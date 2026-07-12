from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

AgentId = Literal["client", "strategist", "copywriter", "designer", "mediabuyer"]
PaymentMode = Literal["mock", "onchain-single", "onchain-sovereign"]
AgentStatus = Literal["idle", "proposed", "working", "paid", "done", "skipped", "failed"]
ArtifactType = Literal[
    "brief",
    "strategy",
    "copy",
    "image",
    "video",
    "placement_plan",
    "campaign_report",
]
ArtifactStatus = Literal["ready", "generating", "queued", "failed"]
CampaignStatus = Literal["planned", "running", "completed", "insufficient", "failed"]
PaymentKind = Literal["deposit", "fee", "adbuy"]
PaymentStatus = Literal["pending", "confirmed", "failed"]
Decision = Literal["accepted", "rejected"]
GenerationStatus = Literal["generating", "done", "failed"]
PublisherSlotId = str


class APIModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        validate_by_alias=True,
        validate_by_name=True,
    )


class ClarifyQuestion(APIModel):
    id: str
    question: str
    kind: Literal["budget", "audience", "cta", "upload"]


class ClarifyAnswer(APIModel):
    id: str
    answer: str


class AgentRecord(APIModel):
    id: AgentId
    label: str
    address: str
    balance_usdc: float = 0.0
    funded: bool = False
    can_send: bool = False
    status: AgentStatus = "idle"


class Proposal(APIModel):
    agent: AgentId
    work_description: str
    fee_usdc: float
    meta: dict[str, Any] = Field(default_factory=dict)


class DecisionRecord(APIModel):
    agent: AgentId
    decision: Decision


class TreasuryRecord(APIModel):
    address: str
    balance_usdc: float = 0.0


class Artifact(APIModel):
    id: str
    type: ArtifactType
    producer: AgentId
    version: int = 1
    title: str
    storage_url: str | None = Field(default=None, alias="storageUrl")
    preview_text: str | None = Field(default=None, alias="previewText")
    status: ArtifactStatus = "ready"
    metadata: dict[str, Any] = Field(default_factory=dict)


class PaymentRecord(APIModel):
    id: str
    kind: PaymentKind
    from_label: str = Field(alias="fromLabel")
    to_label: str = Field(alias="toLabel")
    from_address: str = Field(alias="fromAddress")
    to_address: str = Field(alias="toAddress")
    amount_usdc: float = Field(alias="amountUsdc")
    tx_hash: str = Field(alias="txHash")
    explorer_url: str = Field(alias="explorerUrl")
    status: PaymentStatus = "pending"
    memo: str = ""
    block_number: int | None = Field(default=None, alias="blockNumber")
    confirmed_at: datetime | None = Field(default=None, alias="confirmedAt")
    metadata: dict[str, Any] = Field(default_factory=dict)


class Placement(APIModel):
    id: str
    slot_id: PublisherSlotId = Field(alias="slotId")
    publisher: str
    price_usdc: float = Field(alias="priceUsdc")
    payment_tx_hash: str = Field(alias="paymentTxHash")
    proof: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class CampaignSummary(APIModel):
    fees_usdc: float = Field(alias="feesUsdc")
    generation_cost_usd: float = Field(alias="generationCostUsdc")
    ad_spend_usdc: float = Field(alias="adSpendUsdc")
    placements: int
    tx_count: int = Field(alias="txCount")


class CampaignPlan(APIModel):
    campaign_id: str = Field(alias="campaignId")
    product_name: str = Field(alias="productName")
    brief: str
    budget_usdc: float = Field(alias="budgetUsdc")
    audience: str | None = None
    cta: str | None = None
    uploaded_image_url: str | None = Field(default=None, alias="uploadedImageUrl")
    video_enabled: bool = Field(default=False, alias="videoEnabled")
    payment_mode: PaymentMode = Field(alias="paymentMode")
    treasury: TreasuryRecord
    agents: list[AgentRecord]
    clarify_questions: list[ClarifyQuestion] = Field(alias="clarifyQuestions")
    clarify_answers: list[ClarifyAnswer] = Field(alias="clarifyAnswers")
    proposals: list[Proposal]
    decisions: list[DecisionRecord]
    budget_check: dict[str, Any] = Field(alias="budgetCheck")
    artifacts: list[Artifact] = Field(default_factory=list)
    recommendation: str


class CampaignState(APIModel):
    campaign_id: str = Field(alias="campaignId")
    product_name: str = Field(alias="productName")
    brief: str
    budget_usdc: float = Field(alias="budgetUsdc")
    audience: str | None = None
    cta: str | None = None
    uploaded_image_url: str | None = Field(default=None, alias="uploadedImageUrl")
    video_enabled: bool = Field(default=False, alias="videoEnabled")
    payment_mode: PaymentMode = Field(alias="paymentMode")
    treasury: TreasuryRecord
    agents: dict[AgentId, AgentRecord]
    clarify_questions: list[ClarifyQuestion] = Field(default_factory=list, alias="clarifyQuestions")
    clarify_answers: list[ClarifyAnswer] = Field(default_factory=list, alias="clarifyAnswers")
    proposals: list[Proposal] = Field(default_factory=list)
    decisions: list[DecisionRecord] = Field(default_factory=list)
    artifacts: list[Artifact] = Field(default_factory=list)
    payments: list[PaymentRecord] = Field(default_factory=list)
    placements: list[Placement] = Field(default_factory=list)
    status: CampaignStatus = "planned"
    spent_usdc: float = Field(default=0.0, alias="spentUsdc")
    generation_cost_usdc: float = Field(default=0.0, alias="generationCostUsdc")
    summary: CampaignSummary | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), alias="createdAt")
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), alias="updatedAt")
    notes: list[str] = Field(default_factory=list)

    def touch(self) -> None:
        self.updated_at = datetime.now(timezone.utc)

    def remaining_budget(self) -> float:
        return max(0.0, round(self.budget_usdc - self.spent_usdc - self.generation_cost_usdc, 4))


class CampaignRequest(APIModel):
    product_name: str = Field(alias="productName")
    brief: str
    budget_usdc: float | None = Field(default=None, alias="budgetUsdc")
    audience: str | None = None
    cta: str | None = None
    uploaded_image_url: str | None = Field(default=None, alias="uploadedImageUrl")
    video_enabled: bool = Field(default=False, alias="videoEnabled")
    accepted_agents: list[AgentId] | None = Field(default=None, alias="acceptedAgents")
    clarifying_answers: dict[str, str] = Field(default_factory=dict, alias="clarifyingAnswers")
    campaign_id: str | None = Field(default=None, alias="campaignId")


class PlanRequest(CampaignRequest):
    pass


class LaunchRequest(CampaignRequest):
    pass


class PublisherProofRequest(APIModel):
    proof: str | None = None
    campaign_id: str | None = Field(default=None, alias="campaignId")


class CampaignPlanResponse(APIModel):
    campaign: CampaignPlan


class CampaignLaunchResponse(APIModel):
    campaign_id: str = Field(alias="campaignId")
    stream_url: str = Field(alias="streamUrl")
    payment_mode: PaymentMode = Field(alias="paymentMode")
    summary: CampaignSummary | None = None


def new_campaign_id() -> str:
    return uuid4().hex
