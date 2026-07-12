from __future__ import annotations

import asyncio
import copy
import logging
import os
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from .models import Artifact, CampaignState, PaymentRecord, Placement

logger = logging.getLogger(__name__)


@dataclass
class SupabaseAuditConfig:
    url: str
    service_role_key: str


class MemoryAuditStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._campaigns: dict[str, CampaignState] = {}
        self._events: dict[str, list[dict[str, Any]]] = {}

    def upsert_campaign(self, campaign: CampaignState) -> None:
        with self._lock:
            self._campaigns[campaign.campaign_id] = copy.deepcopy(campaign)

    def get_campaign(self, campaign_id: str) -> CampaignState | None:
        with self._lock:
            campaign = self._campaigns.get(campaign_id)
            return copy.deepcopy(campaign) if campaign else None

    def list_campaigns(self, limit: int = 20) -> list[CampaignState]:
        with self._lock:
            items = sorted(
                self._campaigns.values(),
                key=lambda item: item.updated_at,
                reverse=True,
            )
            return [copy.deepcopy(item) for item in items[:limit]]

    def append_event(self, campaign_id: str, event: dict[str, Any]) -> None:
        with self._lock:
            self._events.setdefault(campaign_id, []).append(copy.deepcopy(event))

    def get_events(self, campaign_id: str) -> list[dict[str, Any]]:
        with self._lock:
            return copy.deepcopy(self._events.get(campaign_id, []))

    def record_payment(self, campaign_id: str, payment: PaymentRecord) -> None:
        with self._lock:
            campaign = self._campaigns.get(campaign_id)
            if campaign is None:
                return
            existing_index = next((index for index, item in enumerate(campaign.payments) if item.id == payment.id), None)
            if existing_index is None:
                campaign.payments.append(copy.deepcopy(payment))
            else:
                campaign.payments[existing_index] = copy.deepcopy(payment)
            campaign.touch()
            self._campaigns[campaign_id] = campaign

    def record_placement(self, campaign_id: str, placement: Placement) -> None:
        with self._lock:
            campaign = self._campaigns.get(campaign_id)
            if campaign is None:
                return
            existing_index = next((index for index, item in enumerate(campaign.placements) if item.id == placement.id), None)
            if existing_index is None:
                campaign.placements.append(copy.deepcopy(placement))
            else:
                campaign.placements[existing_index] = copy.deepcopy(placement)
            campaign.touch()
            self._campaigns[campaign_id] = campaign

    def record_artifact(self, campaign_id: str, artifact: Artifact) -> None:
        with self._lock:
            campaign = self._campaigns.get(campaign_id)
            if campaign is None:
                return
            existing_index = next((index for index, item in enumerate(campaign.artifacts) if item.id == artifact.id), None)
            if existing_index is None:
                campaign.artifacts.append(copy.deepcopy(artifact))
            else:
                campaign.artifacts[existing_index] = copy.deepcopy(artifact)
            campaign.touch()
            self._campaigns[campaign_id] = campaign


class SupabaseAuditStore:
    def __init__(self, config: SupabaseAuditConfig) -> None:
        self._config = config
        self._client = None
        try:
            from supabase import create_client  # type: ignore

            self._client = create_client(config.url, config.service_role_key)
        except Exception as exc:
            logger.warning("Supabase client unavailable; audit writes disabled: %s", exc)

    @property
    def enabled(self) -> bool:
        return self._client is not None

    async def _insert(self, table: str, payload: dict[str, Any]) -> None:
        if not self._client:
            return

        def _call() -> None:
            try:
                self._client.table(table).insert(payload).execute()
            except Exception as exc:
                logger.warning("Supabase insert failed for %s: %s", table, exc)

        await asyncio.to_thread(_call)

    async def record_campaign(self, campaign: CampaignState) -> None:
        await self._insert(
            "campaigns",
            {
                "id": campaign.campaign_id,
                "product_name": campaign.product_name,
                "brief": campaign.brief,
                "budget_usdc": campaign.budget_usdc,
                "audience": campaign.audience,
                "cta": campaign.cta,
                "status": campaign.status,
                "payment_mode": campaign.payment_mode,
                "spent_usdc": campaign.spent_usdc,
                "generation_cost_usdc": campaign.generation_cost_usdc,
                "created_at": campaign.created_at.isoformat(),
                "updated_at": campaign.updated_at.isoformat(),
                "metadata": {"video_enabled": campaign.video_enabled, "notes": campaign.notes},
            },
        )

    async def record_payment(self, campaign_id: str, payment: PaymentRecord) -> None:
        await self._insert(
            "payments",
            {
                "id": payment.id,
                "campaign_id": campaign_id,
                "kind": payment.kind,
                "from_label": payment.from_label,
                "to_label": payment.to_label,
                "from_address": payment.from_address,
                "to_address": payment.to_address,
                "amount_usdc": payment.amount_usdc,
                "tx_hash": payment.tx_hash,
                "explorer_url": payment.explorer_url,
                "status": payment.status,
                "memo": payment.memo,
                "block_number": payment.block_number,
                "confirmed_at": payment.confirmed_at.isoformat() if payment.confirmed_at else None,
                "metadata": payment.metadata,
            },
        )

    async def record_placement(self, campaign_id: str, placement: Placement) -> None:
        await self._insert(
            "placements",
            {
                "id": placement.id,
                "campaign_id": campaign_id,
                "slot_id": placement.slot_id,
                "publisher": placement.publisher,
                "price_usdc": placement.price_usdc,
                "payment_tx_hash": placement.payment_tx_hash,
                "proof": placement.proof,
                "metadata": placement.metadata,
            },
        )

    async def record_artifact(self, campaign_id: str, artifact: Artifact) -> None:
        await self._insert(
            "artifacts",
            {
                "id": artifact.id,
                "campaign_id": campaign_id,
                "type": artifact.type,
                "producer": artifact.producer,
                "version": artifact.version,
                "title": artifact.title,
                "storage_url": artifact.storage_url,
                "preview_text": artifact.preview_text,
                "status": artifact.status,
                "metadata": artifact.metadata,
            },
        )

    async def record_agent(self, campaign_id: str, agent: dict[str, Any]) -> None:
        await self._insert("agents", {"campaign_id": campaign_id, **agent})


class AuditStore:
    def __init__(
        self,
        memory: MemoryAuditStore | None = None,
        supabase: SupabaseAuditStore | None = None,
    ) -> None:
        self.memory = memory or MemoryAuditStore()
        self.supabase = supabase

    def upsert_campaign(self, campaign: CampaignState) -> None:
        self.memory.upsert_campaign(campaign)
        if self.supabase and self.supabase.enabled:
            asyncio.create_task(self.supabase.record_campaign(campaign))

    def append_event(self, campaign_id: str, event: dict[str, Any]) -> None:
        self.memory.append_event(campaign_id, event)

    def get_campaign(self, campaign_id: str) -> CampaignState | None:
        return self.memory.get_campaign(campaign_id)

    def list_campaigns(self, limit: int = 20) -> list[CampaignState]:
        return self.memory.list_campaigns(limit=limit)

    def get_events(self, campaign_id: str) -> list[dict[str, Any]]:
        return self.memory.get_events(campaign_id)

    def record_payment(self, campaign_id: str, payment: PaymentRecord) -> None:
        self.memory.record_payment(campaign_id, payment)
        if self.supabase and self.supabase.enabled:
            asyncio.create_task(self.supabase.record_payment(campaign_id, payment))

    def record_placement(self, campaign_id: str, placement: Placement) -> None:
        self.memory.record_placement(campaign_id, placement)
        if self.supabase and self.supabase.enabled:
            asyncio.create_task(self.supabase.record_placement(campaign_id, placement))

    def record_artifact(self, campaign_id: str, artifact: Artifact) -> None:
        self.memory.record_artifact(campaign_id, artifact)
        if self.supabase and self.supabase.enabled:
            asyncio.create_task(self.supabase.record_artifact(campaign_id, artifact))

    def record_agent(self, campaign_id: str, agent: dict[str, Any]) -> None:
        if self.supabase and self.supabase.enabled:
            asyncio.create_task(self.supabase.record_agent(campaign_id, agent))


def build_audit_store() -> AuditStore:
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if supabase_url and supabase_key:
        return AuditStore(
            supabase=SupabaseAuditStore(
                SupabaseAuditConfig(url=supabase_url, service_role_key=supabase_key)
            )
        )
    return AuditStore()
