export type CampaignMode = "mock" | "onchain-single" | "onchain-sovereign";

export type AgentId = "client" | "strategist" | "copywriter" | "designer" | "mediabuyer";

export type QuestionKind = "budget" | "audience" | "cta" | "upload";

export interface Question {
  id: string;
  kind: QuestionKind;
  question: string;
  defaultAnswer?: string;
}

export interface WalletState {
  id: AgentId;
  label: string;
  address: `0x${string}`;
  balanceUsdc: number;
  funded: boolean;
  canSend: boolean;
  status: "idle" | "proposed" | "working" | "paid" | "done" | "skipped" | "failed";
}

export interface Proposal {
  agent: Exclude<AgentId, "client">;
  title: string;
  workDescription: string;
  feeUsdc: number;
  status: "proposed" | "accepted" | "rejected";
  meta?: Record<string, unknown>;
}

export interface Artifact {
  id: string;
  type: "brief" | "strategy" | "copy" | "image" | "video" | "placement_plan" | "campaign_report";
  producer: AgentId;
  version: number;
  title: string;
  storageUrl?: string;
  previewText?: string;
  status: "ready" | "generating" | "queued" | "failed";
  metadata?: Record<string, unknown>;
}

export interface CampaignDraft {
  brief: string;
  budgetUsdc: number;
  audience: string;
  cta: string;
  productImage?: string;
  useVideo: boolean;
  mode: CampaignMode;
}

export interface PlanResult {
  runId: string;
  questions: Question[];
  proposalPack: {
    wallets: WalletState[];
    proposals: Proposal[];
    artifacts: Artifact[];
    budgetCheck: {
      acceptedFeesUsdc: number;
      estimatedGenerationCostUsdc: number;
      projectedAdSpendUsdc: number;
      ok: boolean;
      neededUsdc: number;
    };
  };
}

export type CampaignEvent =
  | { type: "clarify_question"; id: string; question: string; kind: QuestionKind }
  | { type: "clarify_answer"; id: string; answer: string }
  | { type: "deposit"; amountUsdc: number; txHash?: string; explorerUrl?: string; treasuryBalanceUsdc: number }
  | { type: "proposal"; agent: Proposal["agent"]; workDescription: string; feeUsdc: number; meta?: Record<string, unknown> }
  | { type: "proposal_decision"; agent: Proposal["agent"]; decision: "accepted" | "rejected" }
  | { type: "budget_check"; feesUsdc: number; generationCostUsdc: number; adSpendUsdc: number; ok: boolean }
  | { type: "budget_insufficient"; neededUsdc: number; budgetUsdc: number; message: string }
  | { type: "agent_status"; agent: AgentId; status: WalletState["status"] }
  | { type: "reasoning"; agent: AgentId; text: string }
  | { type: "generation"; agent: "designer"; tier: string; realCostUsd: number; status: "generating" | "done" | "failed" }
  | { type: "creative"; url?: string; headline: string; fallback?: boolean }
  | { type: "payment"; id: string; kind: "deposit" | "fee" | "adbuy"; fromLabel: string; toLabel: string; amountUsdc: number; txHash: string; explorerUrl: string; status: "pending" }
  | { type: "payment_update"; id: string; status: "confirmed" | "failed"; blockNumber?: number }
  | { type: "placement"; slotId: string; publisher: string; priceUsdc: number }
  | { type: "budget_update"; spentUsdc: number; remainingUsdc: number }
  | { type: "artifact"; artifact: Artifact }
  | { type: "summary"; feesUsdc: number; generationCostUsdc: number; adSpendUsdc: number; placements: number; txCount: number; totalSpentUsdc: number };

export interface RunSummary {
  feesUsdc: number;
  generationCostUsdc: number;
  adSpendUsdc: number;
  placements: number;
  txCount: number;
  totalSpentUsdc: number;
}

export interface RunRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "running" | "completed" | "failed";
  mode: CampaignMode;
  draft: CampaignDraft;
  questions: Question[];
  proposals: Proposal[];
  wallets: WalletState[];
  events: CampaignEvent[];
  artifacts: Artifact[];
  summary?: RunSummary;
  note?: string;
}
