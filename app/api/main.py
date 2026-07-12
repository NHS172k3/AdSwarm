from __future__ import annotations

import json
import os
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from lib.audit import AuditStore, build_audit_store
from lib.engine import CampaignEngine
from lib.models import CampaignPlanResponse, CampaignRequest, PlanRequest, PublisherProofRequest
from lib.publishers import get_slot


def _require_web_origin() -> str:
    origin = os.getenv("WEB_ORIGIN")
    if not origin:
        raise RuntimeError("WEB_ORIGIN is required to start the API. Set it to the frontend origin.")
    return origin


audit_store: AuditStore = build_audit_store()
engine = CampaignEngine(audit_store)

app = FastAPI(title="AdSwarm API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[_require_web_origin()],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/plan", response_model=CampaignPlanResponse)
async def plan(request: PlanRequest) -> CampaignPlanResponse:
    campaign = await engine.plan(request)
    return CampaignPlanResponse(campaign=campaign)


def _sse(event: dict[str, Any]) -> str:
    return f"event: {event['type']}\ndata: {json.dumps(event, separators=(',', ':'), ensure_ascii=True)}\n\n"


@app.post("/api/launch")
async def launch(request: CampaignRequest) -> StreamingResponse:
    campaign = await engine.plan(request)
    launch_request = request.model_copy(update={"campaign_id": campaign.campaign_id})

    async def stream() -> Any:
        async for event in engine.launch(launch_request):
            yield _sse(event)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Campaign-Id": campaign.campaign_id,
            "X-Stream-Url": f"/api/runs/{campaign.campaign_id}/events",
        },
    )


@app.post("/api/runs/{run_id}/events")
async def run_events(run_id: str, request: Request) -> StreamingResponse:
    body = await request.json()
    launch_request = CampaignRequest.model_validate({**body, "campaignId": run_id})

    async def stream() -> Any:
        async for event in engine.launch(launch_request):
            yield _sse(event)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/runs/{run_id}")
async def run_detail(run_id: str) -> dict[str, Any]:
    campaign = audit_store.get_campaign(run_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return {
        "campaign": campaign,
        "events": audit_store.get_events(run_id),
    }


@app.get("/api/audit")
async def audit(limit: int = 20) -> dict[str, Any]:
    campaigns = audit_store.list_campaigns(limit=limit)
    return {
        "campaigns": campaigns,
        "count": len(campaigns),
    }


@app.get("/api/publishers/{slot_id}")
async def publisher(slot_id: str, proof: str | None = None, campaign_id: str | None = None) -> JSONResponse:
    slot = get_slot(slot_id)
    if slot is None:
        raise HTTPException(status_code=404, detail="Unknown slot")
    if not proof:
        return JSONResponse(
            status_code=402,
            content={
                "status": "payment_required",
                "slotId": slot["slot_id"],
                "publisher": slot["publisher"],
                "priceUsdc": slot["price_usdc"],
                "message": "Payment proof required to unlock the placement.",
            },
        )
    if campaign_id:
        campaign = audit_store.get_campaign(campaign_id)
        if campaign is not None and not any(payment.tx_hash == proof for payment in campaign.payments):
            raise HTTPException(status_code=403, detail="Payment proof not found for campaign")
    return JSONResponse(
        content={
            "status": "ok",
            "slotId": slot["slot_id"],
            "publisher": slot["publisher"],
            "priceUsdc": slot["price_usdc"],
            "placement": {
                "slotId": slot["slot_id"],
                "publisher": slot["publisher"],
                "priceUsdc": slot["price_usdc"],
                "proof": proof,
            },
        }
    )


@app.post("/api/publishers/{slot_id}")
async def publisher_post(slot_id: str, body: PublisherProofRequest) -> JSONResponse:
    return await publisher(slot_id, proof=body.proof, campaign_id=body.campaign_id)
