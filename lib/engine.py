from __future__ import annotations

import asyncio
import math
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from .audit import AuditStore
from .config import CONFIG
from .generation import GenerationService
from .models import (
    AgentId,
    AgentRecord,
    Artifact,
    ClarifyAnswer,
    ClarifyQuestion,
    CampaignLaunchResponse,
    CampaignPlan,
    CampaignRequest,
    CampaignState,
    CampaignSummary,
    DecisionRecord,
    PaymentRecord,
    Placement,
    Proposal,
    TreasuryRecord,
    new_campaign_id,
)
from .openai_helper import OpenAIHelper
from .payments import PaymentProvider, PayReceipt, build_payment_provider
from .publishers import PUBLISHER_SLOTS, cycle_slots, get_slot


def _agent_address(agent_id: AgentId, campaign_id: str) -> str:
    suffix = {
        "client": "00",
        "strategist": "11",
        "copywriter": "22",
        "designer": "33",
        "mediabuyer": "44",
    }[agent_id]
    digest = f"{campaign_id}{suffix}"[-38:]
    base = ("0x" + digest.rjust(40, "0"))[:42]
    return base


def _labels() -> dict[AgentId, str]:
    return {
        "client": "Client Agent",
        "strategist": "Strategist",
        "copywriter": "Copywriter",
        "designer": "Designer",
        "mediabuyer": "Media Buyer",
    }


def _default_questions() -> list[ClarifyQuestion]:
    return [
        ClarifyQuestion(id="budget", question="What budget should the campaign use?", kind="budget"),
        ClarifyQuestion(id="audience", question="Who is the audience?", kind="audience"),
        ClarifyQuestion(id="cta", question="What is the primary call to action?", kind="cta"),
    ]


def _fee_for(agent_id: AgentId, budget_usdc: float) -> float:
    fractions = {
        "strategist": 0.05,
        "copywriter": 0.04,
        "designer": 0.06,
        "mediabuyer": 0.03,
    }
    base = budget_usdc * fractions[agent_id]
    return round(max(0.02, base), 2)


def _proposal_text(
    agent_id: AgentId,
    brief: str,
    audience: str | None,
    cta: str | None,
    product_name: str,
) -> str:
    if agent_id == "strategist":
        return f"Position {product_name} for {audience or 'the target audience'} with a sharp angle around {brief[:80]}"
    if agent_id == "copywriter":
        return f"Lead with direct-response copy and CTA '{cta or 'Learn more'}' for {product_name}"
    if agent_id == "designer":
        return "Build one hero creative with a clear headline, product frame, and callout"
    return "Buy the most efficient placements and keep the remaining budget visible in the tape"


class CampaignEngine:
    def __init__(
        self,
        audit: AuditStore | None = None,
        openai_helper: OpenAIHelper | None = None,
        generation_service: GenerationService | None = None,
    ) -> None:
        self.audit = audit or AuditStore()
        self.openai = openai_helper or OpenAIHelper()
        self.generation = generation_service or GenerationService(self.openai)

    def _build_agent_records(self, campaign_id: str) -> dict[AgentId, AgentRecord]:
        labels = _labels()
        records: dict[AgentId, AgentRecord] = {}
        for agent_id, label in labels.items():
            records[agent_id] = AgentRecord(
                id=agent_id,
                label=label,
                address=_agent_address(agent_id, campaign_id),
                status="idle",
                funded=agent_id == "client",
                can_send=agent_id != "client",
                balance_usdc=0.0,
            )
        return records

    def _resolve_budget(self, request: CampaignRequest) -> float:
        budget = request.budget_usdc if request.budget_usdc is not None else CONFIG.default_budget_usdc
        return round(max(CONFIG.min_campaign_budget_usdc, budget), 2)

    def _clarify_answers(self, request: CampaignRequest) -> list[ClarifyAnswer]:
        answers: list[ClarifyAnswer] = []
        if request.budget_usdc is not None:
            answers.append(ClarifyAnswer(id="budget", answer=f"{request.budget_usdc:.2f} USDC"))
        if request.audience:
            answers.append(ClarifyAnswer(id="audience", answer=request.audience))
        if request.cta:
            answers.append(ClarifyAnswer(id="cta", answer=request.cta))
        for key, value in request.clarifying_answers.items():
            if key not in {answer.id for answer in answers}:
                answers.append(ClarifyAnswer(id=key, answer=value))
        return answers

    async def plan(self, request: CampaignRequest) -> CampaignPlan:
        campaign_id = request.campaign_id or new_campaign_id()
        budget_usdc = self._resolve_budget(request)
        agent_records = self._build_agent_records(campaign_id)
        questions = _default_questions()
        answers = self._clarify_answers(request)
        proposals = [
            Proposal(
                agent="strategist",
                work_description=_proposal_text("strategist", request.brief, request.audience, request.cta, request.product_name),
                fee_usdc=_fee_for("strategist", budget_usdc),
                meta={"fraction": 0.05},
            ),
            Proposal(
                agent="copywriter",
                work_description=_proposal_text("copywriter", request.brief, request.audience, request.cta, request.product_name),
                fee_usdc=_fee_for("copywriter", budget_usdc),
                meta={"fraction": 0.04},
            ),
            Proposal(
                agent="designer",
                work_description=_proposal_text("designer", request.brief, request.audience, request.cta, request.product_name),
                fee_usdc=_fee_for("designer", budget_usdc),
                meta={"fraction": 0.06},
            ),
            Proposal(
                agent="mediabuyer",
                work_description=_proposal_text("mediabuyer", request.brief, request.audience, request.cta, request.product_name),
                fee_usdc=_fee_for("mediabuyer", budget_usdc),
                meta={"fraction": 0.03},
            ),
        ]
        decisions = [
            DecisionRecord(
                agent=proposal.agent,
                decision="accepted" if not request.accepted_agents or proposal.agent in request.accepted_agents else "rejected",
            )
            for proposal in proposals
        ]
        accepted_fees = round(
            sum(
                proposal.fee_usdc
                for proposal, decision in zip(proposals, decisions, strict=False)
                if decision.decision == "accepted"
            ),
            2,
        )
        generation_cost = 0.0 if request.uploaded_image_url else 0.02
        ad_spend = round(max(0.0, budget_usdc - accepted_fees - generation_cost), 2)
        budget_ok = ad_spend >= CONFIG.min_ad_spend_usdc
        recommendation = (
            f"This campaign needs about {accepted_fees + CONFIG.min_ad_spend_usdc:.2f} USDC to run well. "
            f"Your budget is {budget_usdc:.2f} USDC."
            if not budget_ok
            else "Budget covers fees, generation, and meaningful ad spend."
        )
        treasury_address = CONFIG.treasury_address or f"0x{campaign_id[:40].rjust(40, '0')}"
        campaign = CampaignPlan(
            campaignId=campaign_id,
            productName=request.product_name,
            brief=request.brief,
            budgetUsdc=budget_usdc,
            audience=request.audience,
            cta=request.cta,
            uploadedImageUrl=request.uploaded_image_url,
            videoEnabled=request.video_enabled,
            paymentMode=CONFIG.payment_mode,
            treasury=TreasuryRecord(address=treasury_address, balance_usdc=budget_usdc),
            agents=list(agent_records.values()),
            clarifyQuestions=questions,
            clarifyAnswers=answers,
            proposals=proposals,
            decisions=decisions,
            budgetCheck={
                "feesUsdc": accepted_fees,
                "generationCostUsdc": generation_cost,
                "adSpendUsdc": ad_spend,
                "ok": budget_ok,
            },
            artifacts=[],
            recommendation=recommendation,
        )
        state = CampaignState(
            campaignId=campaign_id,
            productName=request.product_name,
            brief=request.brief,
            budgetUsdc=budget_usdc,
            audience=request.audience,
            cta=request.cta,
            uploadedImageUrl=request.uploaded_image_url,
            videoEnabled=request.video_enabled,
            paymentMode=CONFIG.payment_mode,
            treasury=TreasuryRecord(address=treasury_address, balance_usdc=budget_usdc),
            agents=agent_records,
            clarifyQuestions=questions,
            clarifyAnswers=answers,
            proposals=proposals,
            decisions=decisions,
            artifacts=[],
            status="planned",
        )
        self.audit.upsert_campaign(state)
        return campaign

    async def launch(self, request: CampaignRequest) -> AsyncIterator[dict[str, Any]]:
        campaign_id = request.campaign_id or new_campaign_id()
        existing = self.audit.get_campaign(campaign_id)
        if existing is None:
            await self.plan(request)
            existing = self.audit.get_campaign(campaign_id)
        assert existing is not None

        state = existing
        state.status = "running"
        state.touch()
        self.audit.upsert_campaign(state)

        events: list[dict[str, Any]] = []
        streamed_upto = 0

        def append(event: dict[str, Any], *, persist: bool = True) -> dict[str, Any]:
            events.append(event)
            if persist:
                self.audit.append_event(campaign_id, event)
            return event

        async def on_confirmed(receipt: PayReceipt) -> None:
            payment = next((item for item in state.payments if item.id == receipt.payment_id), None)
            if payment is None:
                payment = PaymentRecord(
                    id=receipt.payment_id,
                    kind=receipt.kind,
                    from_label=receipt.from_label,
                    to_label=receipt.to_label,
                    from_address=receipt.from_address or "",
                    to_address=receipt.to_address,
                    amount_usdc=receipt.amount_usdc,
                    tx_hash=receipt.tx_hash,
                    explorer_url=receipt.explorer_url,
                    status="confirmed",
                    memo=receipt.memo,
                    metadata=receipt.metadata,
                )
                state.payments.append(payment)
            payment.status = "confirmed"
            payment.confirmed_at = datetime.now(timezone.utc)
            payment.block_number = payment.block_number or int(datetime.now(timezone.utc).timestamp())
            state.treasury.balance_usdc = round(max(0.0, state.treasury.balance_usdc - payment.amount_usdc), 4)
            if payment.kind == "fee":
                agent_id = next((agent.id for agent in state.agents.values() if agent.address == payment.to_address), None)
                if agent_id:
                    state.agents[agent_id].balance_usdc = round(
                        state.agents[agent_id].balance_usdc + payment.amount_usdc,
                        4,
                    )
                    state.agents[agent_id].status = "paid"
            append(
                {
                    "type": "payment_update",
                    "id": payment.id,
                    "status": "confirmed",
                    "blockNumber": payment.block_number,
                },
                persist=True,
            )
            self.audit.record_payment(campaign_id, payment)
            self.audit.upsert_campaign(state)

        payment_provider, resolved_mode = build_payment_provider(
            mode=state.payment_mode,
            treasury_address=state.treasury.address,
            on_confirmed=on_confirmed,
        )
        state.payment_mode = resolved_mode  # type: ignore[assignment]
        self.audit.upsert_campaign(state)

        for question in state.clarify_questions:
            event = append({"type": "clarify_question", "id": question.id, "question": question.question, "kind": question.kind})
            yield event
            streamed_upto += 1
            if question.id == "budget":
                answer = f"{state.budget_usdc:.2f} USDC"
            elif question.id == "audience":
                answer = state.audience or "competitive gamers"
            elif question.id == "cta":
                answer = state.cta or "pre-order now"
            else:
                answer = next((item.answer for item in state.clarify_answers if item.id == question.id), "")
            event = append({"type": "clarify_answer", "id": question.id, "answer": answer})
            yield event
            streamed_upto += 1

        deposit_receipt = PayReceipt(
            payment_id=f"{campaign_id}:deposit",
            tx_hash=f"0xdep{campaign_id[:29]}",
            explorer_url=f"{CONFIG.explorer_base}/tx/0xdep{campaign_id[:29]}",
            kind="deposit",
            from_label="Founder",
            to_label="Agency Treasury",
            from_address="",
            to_address=state.treasury.address,
            amount_usdc=state.budget_usdc,
            memo="Campaign deposit",
        )
        state.payments.append(
            PaymentRecord(
                id=deposit_receipt.payment_id,
                kind="deposit",
                fromLabel=deposit_receipt.from_label,
                toLabel=deposit_receipt.to_label,
                fromAddress=deposit_receipt.from_address,
                toAddress=deposit_receipt.to_address,
                amountUsdc=deposit_receipt.amount_usdc,
                txHash=deposit_receipt.tx_hash,
                explorerUrl=deposit_receipt.explorer_url,
                status="confirmed",
                memo=deposit_receipt.memo,
                confirmedAt=datetime.now(timezone.utc),
            )
        )
        state.treasury.balance_usdc = round(state.treasury.balance_usdc, 4)
        event = append(
            {
                "type": "deposit",
                "amountUsdc": state.budget_usdc,
                "txHash": deposit_receipt.tx_hash,
                "explorerUrl": deposit_receipt.explorer_url,
                "treasuryBalanceUsdc": state.treasury.balance_usdc,
            }
        )
        yield event
        streamed_upto += 1
        self.audit.record_payment(campaign_id, state.payments[-1])
        self.audit.upsert_campaign(state)

        decision_index = {decision.agent: decision.decision for decision in state.decisions}

        for proposal in state.proposals:
            event = append(
                {
                    "type": "proposal",
                    "agent": proposal.agent,
                    "workDescription": proposal.work_description,
                    "feeUsdc": proposal.fee_usdc,
                    "meta": proposal.meta,
                }
            )
            yield event
            streamed_upto += 1
            event = append(
                {
                    "type": "proposal_decision",
                    "agent": proposal.agent,
                    "decision": decision_index.get(proposal.agent, "accepted"),
                }
            )
            yield event
            streamed_upto += 1
            state.agents[proposal.agent].status = "proposed" if decision_index.get(proposal.agent) == "accepted" else "skipped"

        accepted_fees = round(
            sum(
                proposal.fee_usdc
                for proposal in state.proposals
                if decision_index.get(proposal.agent) == "accepted"
            ),
            2,
        )
        generation_cost = 0.0 if state.uploaded_image_url else 0.02
        state.generation_cost_usdc = generation_cost
        ad_spend = round(max(0.0, state.budget_usdc - accepted_fees - generation_cost), 2)
        budget_ok = ad_spend >= CONFIG.min_ad_spend_usdc
        event = append(
            {
                "type": "budget_check",
                "feesUsdc": accepted_fees,
                "generationCostUsdc": generation_cost,
                "adSpendUsdc": ad_spend,
                "ok": budget_ok,
            }
        )
        yield event
        streamed_upto += 1
        self.audit.upsert_campaign(state)

        if not budget_ok:
            message = (
                f"This campaign needs about {accepted_fees + CONFIG.min_ad_spend_usdc:.2f} USDC to run well. "
                f"Add funds or drop an agent to proceed."
            )
            event = append(
                {
                    "type": "budget_insufficient",
                    "neededUsdc": round(accepted_fees + CONFIG.min_ad_spend_usdc, 2),
                    "budgetUsdc": state.budget_usdc,
                    "message": message,
                }
            )
            yield event
            streamed_upto += 1
            state.status = "insufficient"
            state.summary = CampaignSummary(
                fees_usdc=0.0,
                generation_cost_usd=0.0,
                ad_spend_usdc=0.0,
                placements=0,
                tx_count=len(state.payments),
            )
            event = append(
                {
                    "type": "summary",
                    "feesUsdc": 0.0,
                    "generationCostUsdc": 0.0,
                    "adSpendUsdc": 0.0,
                    "placements": 0,
                    "txCount": len(state.payments),
                }
            )
            yield event
            streamed_upto += 1
            self.audit.upsert_campaign(state)
            return

        # Agent fee payments.
        for proposal in state.proposals:
            if decision_index.get(proposal.agent) != "accepted":
                continue
            agent = state.agents[proposal.agent]
            agent.status = "working"
            event = append({"type": "agent_status", "agent": proposal.agent, "status": "working"})
            yield event
            streamed_upto += 1
            receipt = await payment_provider.pay(
                "Agency Treasury",
                agent.address,
                proposal.fee_usdc,
                f"Fee for {proposal.agent}",
                to_label=agent.label,
                kind="fee",
                metadata={"campaignId": campaign_id, "agent": proposal.agent},
            )
            payment = PaymentRecord(
                id=receipt.payment_id,
                kind="fee",
                from_label=receipt.from_label,
                to_label=receipt.to_label,
                from_address=state.treasury.address,
                to_address=agent.address,
                amount_usdc=receipt.amount_usdc,
                tx_hash=receipt.tx_hash,
                explorer_url=receipt.explorer_url,
                status="pending",
                memo=receipt.memo,
                metadata=receipt.metadata,
            )
            state.payments.append(payment)
            state.spent_usdc = round(state.spent_usdc + payment.amount_usdc, 4)
            event = append(
                {
                    "type": "payment",
                    "id": payment.id,
                    "kind": payment.kind,
                    "fromLabel": payment.from_label,
                    "toLabel": payment.to_label,
                    "amountUsdc": payment.amount_usdc,
                    "txHash": payment.tx_hash,
                    "explorerUrl": payment.explorer_url,
                    "status": payment.status,
                }
            )
            yield event
            streamed_upto += 1
            self.audit.record_payment(campaign_id, payment)

        # Reasoning and creative.
        strategist_text = await self.openai.generate_text(
            f"Brief strategist output for {state.product_name}: {state.brief}",
            f"Target {state.audience or 'the audience'} with a concise value prop tied to {state.product_name}.",
            max_output_tokens=120,
        )
        event = append({"type": "reasoning", "agent": "strategist", "text": strategist_text})
        yield event
        streamed_upto += 1
        copy_text = await self.openai.generate_text(
            f"Write 3 ad headlines and a CTA for {state.product_name}. CTA: {state.cta or 'Learn more'}.",
            f"{state.product_name} is ready now. {state.cta or 'Learn more'}",
            max_output_tokens=120,
        )
        event = append({"type": "reasoning", "agent": "copywriter", "text": copy_text})
        yield event
        streamed_upto += 1
        event = append({"type": "generation", "agent": "designer", "tier": CONFIG.generation.default_tier, "realCostUsd": generation_cost, "status": "generating"})
        yield event
        streamed_upto += 1
        creative = await asyncio.wait_for(
            self.generation.build_hero_artifact(
                campaign_id=campaign_id,
                product_name=state.product_name,
                brief=state.brief,
                audience=state.audience,
                cta=state.cta,
                uploaded_image_url=state.uploaded_image_url,
                video_enabled=state.video_enabled,
            ),
            timeout=CONFIG.generation.timeout_ms / 1000,
        )
        state.generation_cost_usdc = creative.real_cost_usd
        state.artifacts.append(creative.artifact)
        event = append(
            {
                "type": "generation",
                "agent": "designer",
                "tier": CONFIG.generation.default_tier,
                "realCostUsd": creative.real_cost_usd,
                "status": creative.status,
            }
        )
        yield event
        streamed_upto += 1
        event = append(
            {
                "type": "creative",
                "url": creative.artifact.storage_url,
                "headline": creative.artifact.preview_text or state.product_name,
                "fallback": creative.artifact.storage_url.startswith("mock://"),
            }
        )
        yield event
        streamed_upto += 1
        self.audit.record_artifact(campaign_id, creative.artifact)

        if state.video_enabled:
            video_artifact = Artifact(
                id=f"{campaign_id}:video",
                type="video",
                producer="designer",
                version=1,
                title=f"{state.product_name} campaign video",
                preview_text="Video generation queued in fallback mode.",
                status="queued",
                metadata={"reason": "video generation is optional and not blocking"},
            )
            state.artifacts.append(video_artifact)
            self.audit.record_artifact(campaign_id, video_artifact)

        # Placement buys.
        slots = cycle_slots(CONFIG.ad_buy_count)
        placement_count = 0
        for slot in slots:
            if state.remaining_budget() < slot["price_usdc"]:
                break
            receipt = await payment_provider.pay(
                "Agency Treasury",
                slot["publisher"],
                slot["price_usdc"],
                f"Buy placement {slot['slot_id']}",
                to_label=slot["publisher"],
                kind="adbuy",
                metadata={"slotId": slot["slot_id"], "campaignId": campaign_id},
            )
            payment = PaymentRecord(
                id=receipt.payment_id,
                kind="adbuy",
                from_label=receipt.from_label,
                to_label=receipt.to_label,
                from_address=state.treasury.address,
                to_address=slot["publisher"],
                amount_usdc=receipt.amount_usdc,
                tx_hash=receipt.tx_hash,
                explorer_url=receipt.explorer_url,
                status="pending",
                memo=receipt.memo,
                metadata=receipt.metadata,
            )
            state.payments.append(payment)
            placement = Placement(
                id=f"{campaign_id}:{slot['slot_id']}:{placement_count}",
                slotId=slot["slot_id"],
                publisher=slot["publisher"],
                priceUsdc=slot["price_usdc"],
                paymentTxHash=receipt.tx_hash,
                proof=receipt.tx_hash,
                metadata={"campaignId": campaign_id},
            )
            state.placements.append(placement)
            state.spent_usdc = round(state.spent_usdc + slot["price_usdc"], 4)
            placement_count += 1
            event = append(
                {
                    "type": "payment",
                    "id": payment.id,
                    "kind": payment.kind,
                    "fromLabel": payment.from_label,
                    "toLabel": payment.to_label,
                    "amountUsdc": payment.amount_usdc,
                    "txHash": payment.tx_hash,
                    "explorerUrl": payment.explorer_url,
                    "status": payment.status,
                }
            )
            yield event
            streamed_upto += 1
            event = append(
                {
                    "type": "placement",
                    "slotId": slot["slot_id"],
                    "publisher": slot["publisher"],
                    "priceUsdc": slot["price_usdc"],
                }
            )
            yield event
            streamed_upto += 1
            event = append(
                {
                    "type": "budget_update",
                    "spentUsdc": round(state.spent_usdc + state.generation_cost_usdc, 4),
                    "remainingUsdc": round(max(0.0, state.budget_usdc - state.spent_usdc - state.generation_cost_usdc), 4),
                }
            )
            yield event
            streamed_upto += 1
            self.audit.record_payment(campaign_id, payment)
            self.audit.record_placement(campaign_id, placement)
            if placement_count >= CONFIG.ad_buy_count:
                break

        await payment_provider.settle()

        while streamed_upto < len(events):
            yield events[streamed_upto]
            streamed_upto += 1

        state.status = "completed"
        summary = CampaignSummary(
            fees_usdc=round(
                sum(
                    item.amount_usdc
                    for item in state.payments
                    if item.kind == "fee"
                ),
                2,
            ),
            generation_cost_usd=round(state.generation_cost_usdc, 2),
            ad_spend_usdc=round(
                sum(item.amount_usdc for item in state.payments if item.kind == "adbuy"),
                2,
            ),
            placements=len(state.placements),
            tx_count=len(state.payments),
        )
        state.summary = summary
        state.touch()
        self.audit.upsert_campaign(state)
        event = append(
            {
                "type": "summary",
                "feesUsdc": summary.fees_usdc,
                "generationCostUsdc": summary.generation_cost_usd,
                "adSpendUsdc": summary.ad_spend_usdc,
                "placements": summary.placements,
                "txCount": summary.tx_count,
            }
        )
        yield event
        streamed_upto += 1
        self.audit.upsert_campaign(state)

    async def get_launch_response(self, request: CampaignRequest) -> CampaignLaunchResponse:
        campaign = await self.plan(request)
        return CampaignLaunchResponse(
            campaignId=campaign.campaign_id,
            streamUrl=f"/api/runs/{campaign.campaign_id}/events",
            paymentMode=campaign.payment_mode,
            summary=None,
        )
