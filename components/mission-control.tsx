"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type AgentId = "client" | "strategist" | "copywriter" | "designer" | "mediabuyer";
type Decision = "accepted" | "rejected";
type Phase = "intake" | "review" | "running" | "summary";
type TapeStatus = "pending" | "confirmed" | "failed";
type ArtifactStatus = "ready" | "generating" | "queued" | "failed";
type AuditTab = "current" | "history";
type PublisherState = "idle" | "active" | "filled" | "failed";

type Agent = {
  id: AgentId;
  label: string;
  role: string;
  address: string;
  balanceUsdc: number;
  funded: boolean;
  canSend: boolean;
  status: "idle" | "proposed" | "working" | "paid" | "done" | "skipped" | "failed";
};

type Proposal = {
  agent: Exclude<AgentId, "client">;
  title: string;
  description: string;
  feeUsdc: number;
  meta: string;
  required?: boolean;
  decision: Decision;
};

type TapeItem = {
  id: string;
  title: string;
  detail: string;
  amount?: number;
  status: TapeStatus;
  label: string;
  txHash?: string;
  explorerUrl?: string;
  tone?: "amber" | "emerald" | "rose" | "cyan";
};

type Artifact = {
  id: string;
  type: "brief" | "strategy" | "copy" | "image" | "video" | "placement_plan" | "campaign_report";
  producer: AgentId;
  version: number;
  title: string;
  previewText?: string;
  status: ArtifactStatus;
  metadata?: Record<string, unknown>;
};

type PublisherSlot = {
  id: string;
  publisher: string;
  priceUsdc: number;
  description: string;
  count: number;
  state: PublisherState;
};

type RunSummary = {
  id: string;
  label: string;
  brief: string;
  budgetUsdc: number;
  feesUsdc: number;
  generationCostUsd: number;
  adSpendUsdc: number;
  placements: number;
  txCount: number;
  confirmationRate: string;
  timestamp: string;
  status: "complete" | "blocked";
};

const TREASURY_ADDRESS = "0x4D9A62f7b3d82A0fA7Bc0E2c3B1d8e7A9f0cB4A2";
const EXPLORER_BASE = "https://sepolia.basescan.org";
const PAYMENT_MODE = "mock" as const;

const PUBLISHER_SEEDS: Array<Omit<PublisherSlot, "count" | "state">> = [
  { id: "twitch", publisher: "TwitchSide Banner", priceUsdc: 0.05, description: "High-frequency placements near late-night streams." },
  { id: "forum", publisher: "GamerForum Sidebar", priceUsdc: 0.03, description: "Thread-adjacent visibility for intent-rich communities." },
  { id: "yt", publisher: "YT Pre-roll Slot", priceUsdc: 0.08, description: "Quick sightline before highlight reels and reviews." },
  { id: "discord", publisher: "Discord Server Promo", priceUsdc: 0.02, description: "Pinned inside creator and clan channels." },
  { id: "reddit", publisher: "r/Gaming Promoted", priceUsdc: 0.06, description: "Promoted feed slot for broad gaming reach." },
  { id: "esports", publisher: "Esports Livestream L3", priceUsdc: 0.09, description: "Premium placement for live match audiences." },
  { id: "mobile", publisher: "Mobile Game Interstitial", priceUsdc: 0.04, description: "Interruptive but affordable high-impression inventory." },
  { id: "newsletter", publisher: "GG Newsletter Slot", priceUsdc: 0.03, description: "Curated newsletter placement with reliable CTR." },
];

const INITIAL_ARTIFACTS: Artifact[] = [
  {
    id: "brief-1",
    type: "brief",
    producer: "client",
    version: 1,
    title: "Campaign brief",
    previewText: "A new energy drink for late-night gamers. Hero image on, short video off.",
    status: "ready",
  },
  {
    id: "strategy-1",
    type: "strategy",
    producer: "strategist",
    version: 1,
    title: "Strategy memo",
    previewText: "Own the midnight grind with a caffeine-plus-focus angle and creator-friendly targeting.",
    status: "queued",
  },
  {
    id: "copy-1",
    type: "copy",
    producer: "copywriter",
    version: 1,
    title: "Headline set",
    previewText: "Boost your queue. Stay sharp for the final round.",
    status: "queued",
  },
  {
    id: "image-1",
    type: "image",
    producer: "designer",
    version: 1,
    title: "Hero creative",
    previewText: "Fallback hero card with bold headline, product glow, and ad-frame treatment.",
    status: "queued",
  },
  {
    id: "placements-1",
    type: "placement_plan",
    producer: "mediabuyer",
    version: 1,
    title: "Placement plan",
    previewText: "Eight-slot buying ladder prioritized for late-night gamer inventory.",
    status: "queued",
  },
  {
    id: "report-1",
    type: "campaign_report",
    producer: "client",
    version: 1,
    title: "Campaign report",
    previewText: "Will compile spend, placements, and audit trail after launch.",
    status: "queued",
  },
];

const INITIAL_HISTORY: RunSummary[] = [
  {
    id: "run-7fa1",
    label: "Night Launch / Alpha",
    brief: "Neon headset launch for a tournament warm-up campaign.",
    budgetUsdc: 50,
    feesUsdc: 15.2,
    generationCostUsd: 1.8,
    adSpendUsdc: 33.0,
    placements: 14,
    txCount: 18,
    confirmationRate: "100%",
    timestamp: "Today, 09:42",
    status: "complete",
  },
  {
    id: "run-4c20",
    label: "Sprint Test / Small Budget",
    brief: "Low-budget rehearsal for intake, acceptance, and payment tape.",
    budgetUsdc: 1,
    feesUsdc: 0.6,
    generationCostUsd: 0.3,
    adSpendUsdc: 0.1,
    placements: 2,
    txCount: 4,
    confirmationRate: "100%",
    timestamp: "Yesterday, 18:10",
    status: "complete",
  },
];

const INITIAL_TAPE: TapeItem[] = [
  {
    id: "seed-1",
    title: "Mission core armed",
    detail: "Brief intake ready. Generate a plan to populate specialist proposals.",
    status: "confirmed",
    label: "console",
    tone: "cyan",
  },
  {
    id: "seed-2",
    title: "Treasury standing by",
    detail: "Mock mode enabled. Every receipt will mirror the real event shape.",
    status: "confirmed",
    label: "mode",
    tone: "emerald",
  },
];

const initialAgents = (): Agent[] => [
  {
    id: "client",
    label: "Client Agent",
    role: "Intake and guardrails",
    address: "0xC1eN7A1e7a1e7a1e7a1e7a1e7a1e7a1e7a1e7a1",
    balanceUsdc: 0,
    funded: false,
    canSend: false,
    status: "idle",
  },
  {
    id: "strategist",
    label: "Strategist",
    role: "Angle, audience, and funnel framing",
    address: "0x5a7F3d8b4cC7a9D2D5A6A3E4f9B8d7e6c5B4a321",
    balanceUsdc: 12.4,
    funded: false,
    canSend: true,
    status: "idle",
  },
  {
    id: "copywriter",
    label: "Copywriter",
    role: "Headlines, CTA, and tonal variants",
    address: "0x8B71a3C4dD6e9F7a1B2C3d4E5f60718293a4B5c6",
    balanceUsdc: 9.1,
    funded: false,
    canSend: true,
    status: "idle",
  },
  {
    id: "designer",
    label: "Designer",
    role: "Hero image and ad frame composition",
    address: "0xA2Ff6D3e7c8B1a4E5d6C7b8A9c0D1e2F3a4B5c67",
    balanceUsdc: 8.75,
    funded: false,
    canSend: true,
    status: "idle",
  },
  {
    id: "mediabuyer",
    label: "Media Buyer",
    role: "Inventory sweeps and placement storm",
    address: "0x9cD1A2b3E4f5a6B7c8D9e0F1a2B3c4D5e6F7a8B9",
    balanceUsdc: 11.3,
    funded: false,
    canSend: true,
    status: "idle",
  },
];

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 10 ? 2 : 2,
  }).format(value);
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function shortAddress(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function shortHash(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function nowStamp() {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hashFromSeed(seed: string) {
  let acc = 0;
  for (let i = 0; i < seed.length; i += 1) {
    acc = (acc * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const parts = [acc, acc ^ 0xabcdef, acc ^ 0x123456, acc ^ 0x654321]
    .map((part) => part.toString(16).padStart(8, "0"))
    .join("");
  return `0x${parts}`.slice(0, 66);
}

function buildProposals(brief: string, budget: number): Proposal[] {
  const intensity = brief.length > 60 ? 1.08 : 0.96;
  const strategistFee = clampNumber(Number((budget * 0.07 * intensity).toFixed(2)), 3.5, 8.8);
  const copywriterFee = clampNumber(Number((budget * 0.055 * intensity).toFixed(2)), 2.9, 6.6);
  const designerFee = clampNumber(Number((budget * 0.095 * intensity).toFixed(2)), 4.3, 9.8);
  const mediaBuyerFee = clampNumber(Number((budget * 0.06 * intensity).toFixed(2)), 3.2, 7.4);

  return [
    {
      agent: "strategist",
      title: "Campaign strategist",
      description: "Shape the target angle, audience wedge, and conversion narrative.",
      feeUsdc: strategistFee,
      meta: "angle + audience",
      decision: "accepted",
    },
    {
      agent: "copywriter",
      title: "Copywriter",
      description: "Write the headline stack, CTA variants, and ad-safe benefit lines.",
      feeUsdc: copywriterFee,
      meta: "3 headlines",
      decision: "accepted",
    },
    {
      agent: "designer",
      title: "Designer",
      description: "Create the hero card, fallback frame, and prompt-safe ad visual.",
      feeUsdc: designerFee,
      meta: "hero image",
      decision: "accepted",
    },
    {
      agent: "mediabuyer",
      title: "Media buyer",
      description: "Buy mock publisher inventory until the remaining spend is exhausted.",
      feeUsdc: mediaBuyerFee,
      meta: "required",
      required: true,
      decision: "accepted",
    },
  ];
}

function createArtifacts(
  brief: string,
  audience: string,
  cta: string,
  productImage: string,
  videoEnabled: boolean,
): Artifact[] {
  const artifacts: Artifact[] = [
    {
      id: "brief",
      type: "brief",
      producer: "client",
      version: 1,
      title: "Campaign brief",
      previewText: brief || "Awaiting product brief.",
      status: "ready",
    },
    {
      id: "strategy",
      type: "strategy",
      producer: "strategist",
      version: 2,
      title: "Strategy memo",
      previewText: `Audience: ${audience || "late-night gamers"}. CTA: ${cta || "pre-order now"}.`,
      status: "ready",
    },
    {
      id: "copy",
      type: "copy",
      producer: "copywriter",
      version: 2,
      title: "Headline stack",
      previewText: "Boost your queue. Stay sharp for the final round. Fuel the last push.",
      status: "ready",
    },
    {
      id: "image",
      type: "image",
      producer: "designer",
      version: 2,
      title: "Hero creative",
      previewText: productImage
        ? `Reference frame pulled from ${productImage}.`
        : "Fallback creative with an ad-frame glow and headline overlay.",
      status: "ready",
      metadata: { videoEnabled },
    },
    {
      id: "placement_plan",
      type: "placement_plan",
      producer: "mediabuyer",
      version: 2,
      title: "Placement ladder",
      previewText: "Eight-slot buying ladder with late-night inventory concentration.",
      status: "ready",
    },
    {
      id: "campaign_report",
      type: "campaign_report",
      producer: "client",
      version: 1,
      title: "Campaign report",
      previewText: "Live summary and audit trail compiled after each confirmed receipt.",
      status: "queued",
    },
  ];

  if (videoEnabled) {
    artifacts.push({
      id: "video",
      type: "video",
      producer: "designer",
      version: 1,
      title: "Short video artifact",
      previewText: "Queued asynchronously. Campaign completion does not wait on it.",
      status: "queued",
    });
  }

  return artifacts;
}

function buildPublisherState() {
  return PUBLISHER_SEEDS.map((slot) => ({
    ...slot,
    count: 0,
    state: "idle" as PublisherState,
  }));
}

function buildCurrentSummary({
  brief,
  budgetUsdc,
  feesUsdc,
  generationCostUsd,
  adSpendUsdc,
  placements,
  txCount,
  status,
}: {
  brief: string;
  budgetUsdc: number;
  feesUsdc: number;
  generationCostUsd: number;
  adSpendUsdc: number;
  placements: number;
  txCount: number;
  status: "complete" | "blocked";
}): RunSummary {
  const confirmations = txCount > 0 ? "100%" : "0%";
  return {
    id: `run-${Math.random().toString(36).slice(2, 6)}${Date.now().toString(36).slice(-4)}`,
    label: "Current live run",
    brief,
    budgetUsdc,
    feesUsdc,
    generationCostUsd,
    adSpendUsdc,
    placements,
    txCount,
    confirmationRate: confirmations,
    timestamp: nowStamp(),
    status,
  };
}

function TapeChip({
  item,
}: {
  item: TapeItem;
}) {
  return (
    <li className="tape-item" data-status={item.status}>
      <div className="tape-dot" />
      <div>
        <h4>{item.title}</h4>
        <p>{item.detail}</p>
      </div>
      <div className="tape-meta">
        <strong>{item.label}</strong>
        {item.amount !== undefined ? <span>{formatUsd(item.amount)}</span> : <span>{item.status}</span>}
        {item.txHash ? (
          <a href={item.explorerUrl} target="_blank" rel="noreferrer">
            {shortHash(item.txHash)}
          </a>
        ) : null}
      </div>
    </li>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="stat-card">
      <label>{label}</label>
      <strong>{value}</strong>
    </div>
  );
}

function AgentRow({ agent }: { agent: Agent }) {
  const statusTone =
    agent.status === "paid" || agent.status === "done"
      ? "chip-emerald"
      : agent.status === "failed"
        ? "chip-rose"
        : agent.status === "working" || agent.status === "proposed"
          ? "chip-amber"
          : "";

  return (
    <div className="audit-item">
      <header>
        <div>
          <strong>{agent.label}</strong>
          <p>{agent.role}</p>
        </div>
        <span className={`chip ${statusTone}`}>{agent.status}</span>
      </header>
      <div className="audit-stats">
        <div className="stat-card">
          <label>Wallet</label>
          <strong className="mono">{shortAddress(agent.address)}</strong>
        </div>
        <div className="stat-card">
          <label>Balance</label>
          <strong className="mono">{formatUsd(agent.balanceUsdc)}</strong>
        </div>
      </div>
      <div className="button-row" style={{ marginTop: "0.55rem" }}>
        <span className="chip chip-cyan">{agent.funded ? "funded" : "standby"}</span>
        <span className="chip">{agent.canSend ? "can send" : "read only"}</span>
      </div>
    </div>
  );
}

function ProposalCard({
  proposal,
  onDecision,
}: {
  proposal: Proposal;
  onDecision: (agent: Proposal["agent"], decision: Decision) => void;
}) {
  return (
    <article className="proposal-card" data-decision={proposal.decision}>
      <div className="proposal-head">
        <div>
          <strong>{proposal.title}</strong>
          <span>{proposal.description}</span>
        </div>
        <div className="proposal-fee">{formatUsd(proposal.feeUsdc)}</div>
      </div>
      <div className="proposal-meta">
        <span className="chip chip-cyan">{proposal.meta}</span>
        {proposal.required ? <span className="chip chip-amber">required</span> : null}
        <span className="chip">{proposal.decision}</span>
      </div>
      <div className="proposal-actions">
        <button
          type="button"
          className="toggle"
          data-active={proposal.decision === "accepted"}
          onClick={() => onDecision(proposal.agent, "accepted")}
        >
          Accept
        </button>
        <button
          type="button"
          className="toggle"
          data-active={proposal.decision === "rejected"}
          onClick={() => onDecision(proposal.agent, "rejected")}
        >
          Reject
        </button>
      </div>
    </article>
  );
}

export function MissionControl() {
  const [brief, setBrief] = useState("A new energy drink for late-night gamers");
  const [budgetUsdc, setBudgetUsdc] = useState(50);
  const [audience, setAudience] = useState("competitive gamers");
  const [cta, setCta] = useState("pre-order now");
  const [referenceName, setReferenceName] = useState("product-reference.png");
  const [heroImage, setHeroImage] = useState(true);
  const [shortVideo, setShortVideo] = useState(false);
  const [phase, setPhase] = useState<Phase>("intake");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [tape, setTape] = useState<TapeItem[]>(INITIAL_TAPE);
  const [liveLines, setLiveLines] = useState<string[]>([
    "Ready in mock mode. Generate a plan to surface negotiation, then launch the campaign.",
  ]);
  const [artifacts, setArtifacts] = useState<Artifact[]>(INITIAL_ARTIFACTS);
  const [slots, setSlots] = useState<PublisherSlot[]>(buildPublisherState);
  const [history, setHistory] = useState<RunSummary[]>(INITIAL_HISTORY);
  const [activeAudit, setActiveAudit] = useState<AuditTab>("current");
  const [selectedHistoryId, setSelectedHistoryId] = useState(INITIAL_HISTORY[0]?.id ?? "");
  const [isRunning, setIsRunning] = useState(false);
  const [currentSummary, setCurrentSummary] = useState<RunSummary | null>(null);
  const [generationCostUsd, setGenerationCostUsd] = useState(0);
  const [spentCampaignUsd, setSpentCampaignUsd] = useState(0);
  const [treasuryBalance, setTreasuryBalance] = useState(128.45);
  const [txCount, setTxCount] = useState(0);
  const [footerNote, setFooterNote] = useState("Mock mode keeps the demo reliable while preserving the real event shape.");
  const runTokenRef = useRef(0);

  const generationCost = shortVideo ? 2.4 : 1.7;

  const acceptedFees = useMemo(
    () =>
      proposals.reduce((sum, proposal) => sum + (proposal.decision === "accepted" ? proposal.feeUsdc : 0), 0),
    [proposals],
  );

  const acceptedCount = useMemo(
    () => proposals.filter((proposal) => proposal.decision === "accepted").length,
    [proposals],
  );

  const adSpendUsdc = useMemo(() => {
    const value = budgetUsdc - acceptedFees - (shortVideo || heroImage ? generationCost : 0);
    return Number(Math.max(0, value).toFixed(2));
  }, [acceptedFees, budgetUsdc, generationCost, heroImage, shortVideo]);

  const budgetOk = useMemo(() => {
    const required = acceptedFees + (shortVideo || heroImage ? generationCost : 0) + 0.1;
    return budgetUsdc >= required;
  }, [acceptedFees, budgetUsdc, generationCost, heroImage, shortVideo]);

  const campaignSpent = useMemo(() => spentCampaignUsd, [spentCampaignUsd]);
  const remainingBudget = useMemo(() => Math.max(0, budgetUsdc - campaignSpent), [budgetUsdc, campaignSpent]);
  const tapeFill = budgetUsdc > 0 ? Math.max(0, Math.min(100, (campaignSpent / budgetUsdc) * 100)) : 0;
  const currentHistory = history.find((run) => run.id === selectedHistoryId) ?? history[0];
  const summaryToShow = currentSummary;

  useEffect(() => {
    if (!history.length) {
      setSelectedHistoryId("");
      return;
    }
    if (!history.some((run) => run.id === selectedHistoryId)) {
      setSelectedHistoryId(history[0].id);
    }
  }, [history, selectedHistoryId]);

  useEffect(() => {
    setArtifacts((prev) =>
      prev.map((artifact) =>
        artifact.type === "video"
          ? {
              ...artifact,
              status: shortVideo ? "queued" : "failed",
              previewText: shortVideo
                ? "Queued asynchronously. Campaign completion does not wait on it."
                : "Video disabled by default for the demo path.",
            }
          : artifact.type === "image"
            ? {
                ...artifact,
                previewText: referenceName
                  ? `Reference frame pulled from ${referenceName}.`
                  : "Fallback creative with an ad-frame glow and headline overlay.",
              }
            : artifact,
      ),
    );
  }, [heroImage, referenceName, shortVideo]);

  const setProposalDecision = (agent: Proposal["agent"], decision: Decision) => {
    setProposals((prev) => prev.map((proposal) => (proposal.agent === agent ? { ...proposal, decision } : proposal)));
  };

  const resetDemo = () => {
    runTokenRef.current += 1;
    setPhase("intake");
    setProposals([]);
    setAgents(initialAgents());
    setTape(INITIAL_TAPE);
    setLiveLines([
      "Ready in mock mode. Generate a plan to surface negotiation, then launch the campaign.",
    ]);
    setArtifacts(INITIAL_ARTIFACTS);
    setSlots(buildPublisherState());
    setIsRunning(false);
    setCurrentSummary(null);
    setGenerationCostUsd(0);
    setSpentCampaignUsd(0);
    setTreasuryBalance(128.45);
    setTxCount(0);
    setFooterNote("Mock mode keeps the demo reliable while preserving the real event shape.");
  };

  const generatePlan = () => {
    const nextProposals = buildProposals(brief, budgetUsdc).map((proposal) => ({
      ...proposal,
      decision: "accepted" as Decision,
    }));

    setProposals(nextProposals);
    setAgents((prev) =>
      prev.map((agent) =>
        agent.id === "client"
          ? { ...agent, status: "working" }
          : nextProposals.some((proposal) => proposal.agent === agent.id)
            ? { ...agent, status: "proposed" }
            : agent,
      ),
    );
    setTape([
      {
        id: `brief-${Date.now()}`,
        title: "Brief parsed",
        detail: `${brief} / audience: ${audience} / CTA: ${cta}`,
        status: "confirmed",
        label: "intake",
        tone: "cyan",
      },
      {
        id: `plan-${Date.now() + 1}`,
        title: "Plan generation complete",
        detail: "Four specialist proposals are ready for accept/reject review.",
        status: "confirmed",
        label: "plan",
        tone: "emerald",
      },
    ]);
    setLiveLines([
      `Intake locked: ${brief || "brief missing"}.`,
      `Plan generated for ${budgetUsdc.toFixed(2)} USDC with parallel specialist pricing.`,
      "Review each proposal, then launch the campaign.",
    ]);
    setPhase("review");
    setFooterNote("Plan generation complete. The negotiation table is now live.");
    setArtifacts(createArtifacts(brief, audience, cta, referenceName, shortVideo));
  };

  const appendTape = (item: TapeItem) => {
    setTape((prev) => [item, ...prev].slice(0, 12));
  };

  const updateTape = (id: string, patch: Partial<TapeItem>) => {
    setTape((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const appendLine = (line: string) => {
    setLiveLines((prev) => [line, ...prev].slice(0, 10));
  };

  const launchCampaign = async () => {
    if (!budgetOk || isRunning || !proposals.length) {
      if (!proposals.length) {
        setFooterNote("Generate a plan before launch.");
      } else if (!budgetOk) {
        const needed = acceptedFees + (shortVideo || heroImage ? generationCost : 0) + 0.1;
        setFooterNote(`This campaign needs about ${formatUsd(needed)} to run well. Add funds or drop an agent to proceed.`);
        appendTape({
          id: `guard-${Date.now()}`,
          title: "Budget guard blocked launch",
          detail: `Need ${formatUsd(needed)} to cover accepted fees and minimum ad spend.`,
          status: "failed",
          label: "guard",
          tone: "rose",
        });
        appendLine("Budget guard failed. Launch aborted without paying fees.");
      }
      return;
    }

    runTokenRef.current += 1;
    const token = runTokenRef.current;
    setIsRunning(true);
    setPhase("running");
    setCurrentSummary(null);
    setSpentCampaignUsd(0);
    setTxCount(0);
    setTape([]);
    setSlots(buildPublisherState());
    setFooterNote("Campaign launch started. Payments, creative generation, and placements are now live.");
    setArtifacts(createArtifacts(brief, audience, cta, referenceName, shortVideo));
    setAgents((prev) =>
      prev.map((agent) =>
        agent.id === "client"
          ? { ...agent, status: "working" }
          : agent.id === "mediabuyer"
            ? { ...agent, status: "working" }
            : { ...agent, status: "proposed" },
      ),
    );
    setLiveLines([
      "Execution sequence started.",
      "Payment tape and placement storm are initializing.",
    ]);

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const accepted = proposals.filter((proposal) => proposal.decision === "accepted");
    const hasMediaBuyer = accepted.some((proposal) => proposal.agent === "mediabuyer");
    const feeTotal = Number(accepted.reduce((sum, proposal) => sum + proposal.feeUsdc, 0).toFixed(2));
    const creativeCost = Number(((heroImage || shortVideo ? generationCost : 0) || 0).toFixed(2));
    const remainingAfterFees = Number((budgetUsdc - feeTotal - creativeCost).toFixed(2));
    const planSpendTarget = Math.max(0.1, remainingAfterFees);

    appendTape({
      id: `launch-${Date.now()}`,
      title: "Launch accepted",
      detail: `Budget guard passed. Reserved ${formatUsd(feeTotal + creativeCost + 0.1)} before ad buys.`,
      status: "confirmed",
      label: "engine",
      tone: "amber",
    });
    appendLine(`Budget guard passed at ${formatUsd(budgetUsdc)}.`);
    if (!hasMediaBuyer) {
      appendLine("Media buyer rejected. Running in no-media fallback mode.");
      appendTape({
        id: `fallback-${Date.now()}`,
        title: "No-media fallback enabled",
        detail: "The campaign can still complete, but the ad-buy storm is suppressed.",
        status: "confirmed",
        label: "fallback",
        tone: "cyan",
      });
    }

    for (const proposal of accepted) {
      if (runTokenRef.current !== token) return;
      const txHash = hashFromSeed(`${proposal.agent}-${Date.now()}`);
      const explorerUrl = `${EXPLORER_BASE}/tx/${txHash}`;
      const paymentId = `pay-${proposal.agent}-${Date.now()}`;

      appendTape({
        id: paymentId,
        title: `${proposal.title} fee pending`,
        detail: `Paying ${proposal.agent} for ${proposal.meta}.`,
        amount: proposal.feeUsdc,
        status: "pending",
        label: "fee",
        txHash,
        explorerUrl,
        tone: "amber",
      });
      appendLine(`Fee payment queued for ${proposal.title} at ${formatUsd(proposal.feeUsdc)}.`);
      setAgents((prev) =>
        prev.map((agent) =>
          agent.id === proposal.agent ? { ...agent, status: "working", funded: true } : agent,
        ),
      );
      setTxCount((prev) => prev + 1);
      setTreasuryBalance((prev) => Number((prev - proposal.feeUsdc).toFixed(2)));
      setSpentCampaignUsd((prev) => Number((prev + proposal.feeUsdc).toFixed(2)));
      await sleep(220);
      if (runTokenRef.current !== token) return;

      updateTape(paymentId, { status: "confirmed", detail: `${proposal.agent} paid and cleared to work.` });
      appendLine(`Confirmed ${proposal.agent} fee with receipt ${shortHash(txHash)}.`);
      setAgents((prev) =>
        prev.map((agent) =>
          agent.id === proposal.agent ? { ...agent, status: "paid", balanceUsdc: Number((agent.balanceUsdc + proposal.feeUsdc).toFixed(2)) } : agent,
        ),
      );
      await sleep(120);
    }

    if (creativeCost > 0) {
      const designHash = hashFromSeed(`designer-${brief}`);
      const creativeId = `creative-${Date.now()}`;
      appendTape({
        id: creativeId,
        title: "Creative generation started",
        detail: shortVideo ? "Hero image and short-video artifact branch active." : "Hero image fallback path active.",
        amount: creativeCost,
        status: "pending",
        label: "gen",
        txHash: designHash,
        explorerUrl: `${EXPLORER_BASE}/tx/${designHash}`,
        tone: "cyan",
      });
      appendLine(`Designer rendering started at ${formatUsd(creativeCost)} generation cost.`);
      setGenerationCostUsd(creativeCost);
      setArtifacts((prev) =>
        prev.map((artifact) =>
          artifact.type === "image"
            ? {
                ...artifact,
                status: "generating",
                previewText: referenceName
                  ? `Reference frame pulled from ${referenceName}.`
                  : "Fallback hero card in progress.",
              }
            : artifact.type === "video"
              ? { ...artifact, status: "queued" }
              : artifact,
        ),
      );
      await sleep(300);
      if (runTokenRef.current !== token) return;
      updateTape(creativeId, { status: "confirmed", detail: "Hero creative rendered and frozen into the artifact strip." });
      appendLine(`Creative rendered successfully. Artifact strip updated.`);
      setArtifacts((prev) =>
        prev.map((artifact) =>
          artifact.type === "image"
            ? {
                ...artifact,
                status: "ready",
                previewText: referenceName
                  ? `Reference frame pulled from ${referenceName}.`
                  : "Fallback creative with ad-frame glow and headline overlay.",
              }
            : artifact.type === "video"
              ? {
                  ...artifact,
                  status: shortVideo ? "queued" : "failed",
                  previewText: shortVideo
                    ? "Queued asynchronously. Campaign completion does not wait on it."
                    : "Video left disabled to keep the core demo reliable.",
                }
              : artifact,
        ),
      );
      setTreasuryBalance((prev) => Number((prev - creativeCost).toFixed(2)));
      setTxCount((prev) => prev + 1);
      setTimeout(() => {
        if (runTokenRef.current === token) {
          updateTape(creativeId, { detail: "Hero creative rendered and frozen into the artifact strip." });
        }
      }, 0);
      await sleep(120);
    }

    let spentThisRun = feeTotal + creativeCost;
    let placements = 0;
    const targetPlacements = hasMediaBuyer ? clampNumber(Math.round(planSpendTarget / 0.035) + 6, 8, 24) : 0;
    for (let i = 0; i < targetPlacements; i += 1) {
      if (runTokenRef.current !== token) return;
      const slotIndex = i % slots.length;
      const slot = slots[slotIndex];
      if (spentThisRun + slot.priceUsdc > budgetUsdc) {
        break;
      }

      const placementHash = hashFromSeed(`${slot.id}-${i}-${Date.now()}`);
      const placementId = `placement-${slot.id}-${i}`;
      setSlots((prev) =>
        prev.map((entry, index) =>
          index === slotIndex ? { ...entry, count: entry.count + 1, state: "active" } : entry,
        ),
      );
      appendTape({
        id: placementId,
        title: `${slot.publisher} bought`,
        detail: slot.description,
        amount: slot.priceUsdc,
        status: "pending",
        label: "buy",
        txHash: placementHash,
        explorerUrl: `${EXPLORER_BASE}/tx/${placementHash}`,
        tone: "amber",
      });
      appendLine(`Placement locked: ${slot.publisher} at ${formatUsd(slot.priceUsdc)}.`);
      setTreasuryBalance((prev) => Number((prev - slot.priceUsdc).toFixed(2)));
      spentThisRun = Number((spentThisRun + slot.priceUsdc).toFixed(2));
      placements += 1;
      setTxCount((prev) => prev + 1);
      setSpentCampaignUsd(spentThisRun);
      await sleep(i === 0 ? 180 : 90);
      if (runTokenRef.current !== token) return;
      updateTape(placementId, { status: "confirmed", detail: `${slot.publisher} receipt cleared.` });
      setSlots((prev) =>
        prev.map((entry, index) =>
          index === slotIndex ? { ...entry, state: "filled" } : entry,
        ),
      );
      appendLine(`Confirmed ${slot.publisher} receipt ${shortHash(placementHash)}.`);
      await sleep(60);
    }

    if (runTokenRef.current !== token) return;
    const reportSummary = buildCurrentSummary({
      brief,
      budgetUsdc,
      feesUsdc: feeTotal,
      generationCostUsd: creativeCost,
      adSpendUsdc: Number((spentThisRun - feeTotal - creativeCost).toFixed(2)),
      placements,
      txCount: accepted.length + (creativeCost > 0 ? 1 : 0) + placements,
      status: "complete",
    });

    setGenerationCostUsd(creativeCost);
    setCurrentSummary(reportSummary);
    setPhase("summary");
    setIsRunning(false);
    setFooterNote("Campaign live. Every placement is a receipt. Verify any of them on-chain.");
    appendTape({
      id: `summary-${Date.now()}`,
      title: "Campaign live",
      detail: "Summary compiled with spend, placements, and transaction counts.",
      status: "confirmed",
      label: "summary",
      tone: "emerald",
    });
    appendLine("Campaign live. Summary compiled.");
    setArtifacts((prev) =>
      prev.map((artifact) =>
        artifact.type === "campaign_report"
          ? {
              ...artifact,
              status: "ready",
              previewText: `Fees ${formatUsd(feeTotal)}. Ad spend ${formatUsd(reportSummary.adSpendUsdc)}. Placements ${placements}.`,
            }
          : artifact,
      ),
    );
    setHistory((prev) => [reportSummary, ...prev].slice(0, 6));
    setActiveAudit("current");
  };

  return (
    <main className="mission-root">
      <div className="shell">
        <header className="topbar">
          <div className="brand-lockup">
            <div className="brand-mark">ADS</div>
            <div className="brand-copy">
              <p className="eyebrow">Financial operations console</p>
              <h1>AdSwarm mission control</h1>
              <p>
                Intake the brief, negotiate specialist fees, then watch the payment tape, budget gauge, and placement storm
                converge into a live campaign.
              </p>
            </div>
          </div>
          <div className="topbar-meta">
            <span className="chip chip-amber">
              Mode <strong>{PAYMENT_MODE}</strong>
            </span>
            <span className="chip">
              Treasury <strong className="mono">{shortAddress(TREASURY_ADDRESS)}</strong>
            </span>
            <span className="chip chip-cyan">
              Treasury <strong>{formatUsd(treasuryBalance)}</strong>
            </span>
            <a className="chip chip-emerald" href={`${EXPLORER_BASE}/address/${TREASURY_ADDRESS}`} target="_blank" rel="noreferrer">
              Explorer link
            </a>
          </div>
        </header>

        <div className="shell-grid">
          <aside className="rail">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Intake</p>
                  <h2>Brief and guardrails</h2>
                  <p>Seed the campaign. The client agent asks the minimum needed to price the work.</p>
                </div>
              </div>
              <div className="panel-body intake-grid">
                <div className="field">
                  <label htmlFor="brief">Product brief</label>
                  <textarea id="brief" value={brief} onChange={(event) => setBrief(event.target.value)} />
                </div>

                <div className="question-strip">
                  <div className="question-card">
                    <small>Budget</small>
                    <input
                      value={budgetUsdc}
                      type="number"
                      min={0.5}
                      step={0.5}
                      onChange={(event) => setBudgetUsdc(Number(event.target.value) || 0)}
                    />
                  </div>
                  <div className="question-card">
                    <small>Audience</small>
                    <input value={audience} onChange={(event) => setAudience(event.target.value)} />
                  </div>
                  <div className="question-card">
                    <small>CTA</small>
                    <input value={cta} onChange={(event) => setCta(event.target.value)} />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="reference">Product reference</label>
                  <input
                    id="reference"
                    value={referenceName}
                    onChange={(event) => setReferenceName(event.target.value)}
                    placeholder="upload filename or reference label"
                  />
                </div>

                <div className="option-row">
                  <button type="button" className="toggle" data-active={heroImage} onClick={() => setHeroImage((value) => !value)}>
                    Hero image
                  </button>
                  <button type="button" className="toggle" data-active={shortVideo} onClick={() => setShortVideo((value) => !value)}>
                    Short video
                  </button>
                </div>

                <div className="button-row">
                  <button type="button" className="button button-primary" onClick={generatePlan}>
                    Generate plan
                  </button>
                  <button type="button" className="button" onClick={resetDemo}>
                    Reset demo
                  </button>
                </div>
                <p className="hint">
                  Client agent prompt: price the idea before anyone works. The UI stays usable if generation is skipped.
                </p>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Agent rail</p>
                  <h2>Wallet cards</h2>
                  <p>Addresses, balances, and status. The specialists become active once the plan is generated.</p>
                </div>
              </div>
              <div className="panel-body stack">
                {agents.map((agent) => (
                  <AgentRow key={agent.id} agent={agent} />
                ))}
              </div>
            </section>
          </aside>

          <section className="stack">
            <section className="panel signature-stage">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Signature element</p>
                  <h2>Transaction tape and budget gauge</h2>
                  <p>One centered engine room for spend, receipts, and payout rhythm.</p>
                </div>
                <div className="button-row">
                  <span className="chip chip-amber">
                    Spend <strong>{formatUsd(campaignSpent)}</strong>
                  </span>
                  <span className="chip chip-cyan">
                    Remaining <strong>{formatUsd(remainingBudget)}</strong>
                  </span>
                </div>
              </div>

              <div className="signature-grid">
                <div className="gauge" style={{ ["--fill" as string]: `${tapeFill}%` }}>
                  <div className="gauge-ring">
                    <div className="gauge-center">
                      <div>
                        <strong>{formatUsd(remainingBudget)}</strong>
                        <span>remaining budget</span>
                      </div>
                    </div>
                  </div>
                  <div className="gauge-stats">
                    <MetricCard label="Budget" value={formatUsd(budgetUsdc)} />
                    <MetricCard label="Accepted fees" value={formatUsd(acceptedFees)} />
                    <MetricCard label="Generation cost" value={formatUsd(generationCostUsd)} />
                    <MetricCard label="Accepted" value={`${acceptedCount} / ${proposals.length || 4}`} />
                  </div>
                </div>

                <div className="tape">
                  <div className="panel-header" style={{ padding: 0 }}>
                    <div>
                      <p className="eyebrow">Transaction tape</p>
                      <h2>Pending to confirmed</h2>
                      <p>Reservoir space keeps the receipt column stable while entries arrive.</p>
                    </div>
                    <span className="chip chip-emerald">{phase === "summary" ? "Campaign live" : phase}</span>
                  </div>
                  <ul className="tape-list">
                    {tape.map((item) => (
                      <TapeChip key={item.id} item={item} />
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            <section className="panel proposal-board">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Negotiation</p>
                  <h2>Proposal review</h2>
                  <p>Accept or reject each specialist. The media buyer remains the engine of the demo.</p>
                </div>
                <div className="button-row">
                  <span className={`chip ${budgetOk ? "chip-emerald" : "chip-rose"}`}>
                    {budgetOk ? "Launch ready" : "Budget guard"}
                  </span>
                  <button type="button" className="button button-primary" onClick={launchCampaign} disabled={isRunning || !proposals.length || !budgetOk}>
                    Launch campaign
                  </button>
                </div>
              </div>

              <div className="panel-body proposal-board">
                {!proposals.length ? (
                  <div className="proposal-note">
                    Generate the plan to produce specialist proposals. This keeps the demo story clear before launch.
                  </div>
                ) : null}
                <div className="proposal-grid">
                  {proposals.map((proposal) => (
                    <ProposalCard key={proposal.agent} proposal={proposal} onDecision={setProposalDecision} />
                  ))}
                </div>
                <div className="proposal-note">
                  Budget math: fees {formatUsd(acceptedFees)} + generation {formatUsd(shortVideo || heroImage ? generationCost : 0)} + minimum ad spend {formatUsd(0.1)}.
                  {budgetOk ? " Launch is clear." : ` Need about ${formatUsd(acceptedFees + (shortVideo || heroImage ? generationCost : 0) + 0.1)} to proceed.`}
                </div>
              </div>
            </section>

            <section className="panel live-console">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Live run output</p>
                  <h2>Console stream</h2>
                  <p>In-memory event feed that mimics the final SSE trail and keeps the UI self-contained.</p>
                </div>
                <span className={`chip ${isRunning ? "chip-amber" : phase === "summary" ? "chip-emerald" : "chip-cyan"}`}>
                  {isRunning ? "running" : phase === "summary" ? "completed" : "idle"}
                </span>
              </div>
              <div className="panel-body">
                <div className="console-box" aria-live="polite">
                  {liveLines.map((line, index) => (
                    <div className="console-line" key={`${index}-${line.slice(0, 18)}`}>
                      <time>{String(index + 1).padStart(2, "0")}</time>
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="panel summary-card">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Summary</p>
                  <h2 className="summary-title">{phase === "summary" ? "Campaign live" : "Awaiting launch"}</h2>
                  <p>
                    Closing summary stays visible once the run completes, with the exact spend split preserved.
                  </p>
                </div>
              </div>
              <div className="panel-body">
                <div className="summary-grid">
                  <div className="summary-metric">
                    <label>Fees paid</label>
                    <strong>{formatUsd(summaryToShow?.feesUsdc ?? acceptedFees)}</strong>
                  </div>
                  <div className="summary-metric">
                    <label>Generation cost</label>
                    <strong>{formatUsd(summaryToShow?.generationCostUsd ?? (heroImage || shortVideo ? generationCost : 0))}</strong>
                  </div>
                  <div className="summary-metric">
                    <label>Ad spend</label>
                    <strong>{formatUsd(summaryToShow?.adSpendUsdc ?? adSpendUsdc)}</strong>
                  </div>
                  <div className="summary-metric">
                    <label>Placements</label>
                    <strong>{summaryToShow?.placements ?? slots.filter((slot) => slot.state === "filled").reduce((sum, slot) => sum + slot.count, 0)}</strong>
                  </div>
                </div>
                <div className="button-row" style={{ marginTop: "0.8rem" }}>
                  <span className="chip">
                    Tx count <strong>{summaryToShow?.txCount ?? txCount}</strong>
                  </span>
                  <span className="chip chip-emerald">Every placement is a receipt. Verify any of them on-chain.</span>
                </div>
              </div>
            </section>
          </section>

          <aside className="right-rail stack">
            <section className="panel artifact-strip">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Artifacts</p>
                  <h2>Artifact strip</h2>
                  <p>Reusable campaign outputs stay visible as first-class assets.</p>
                </div>
              </div>
              <div className="panel-body">
                <div className="artifact-row">
                  {artifacts.map((artifact) => (
                    <article className="artifact-card" key={artifact.id}>
                      <span className="artifact-state" data-state={artifact.status}>
                        {artifact.status}
                      </span>
                      <strong>{artifact.title}</strong>
                      <p>{artifact.previewText ?? "No preview text provided."}</p>
                      <span className="chip">
                        <span className="mono">{artifact.type}</span>
                      </span>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Publisher storm</p>
                  <h2>Ad-slot grid</h2>
                  <p>Eight mock publishers light up as the media buyer burns through the remaining spend.</p>
                </div>
              </div>
              <div className="panel-body">
                <div className="publisher-grid">
                  {slots.map((slot) => (
                    <article className="publisher-card" key={slot.id} data-state={slot.state}>
                      <div className="publisher-meta">
                        <strong>{slot.publisher}</strong>
                        <span className="mono">{formatUsd(slot.priceUsdc)}</span>
                      </div>
                      <p>{slot.description}</p>
                      <div className="button-row">
                        <span className="chip">{slot.count} buys</span>
                        <span className={`chip ${slot.state === "filled" ? "chip-emerald" : slot.state === "active" ? "chip-amber" : slot.state === "failed" ? "chip-rose" : ""}`}>
                          {slot.state}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Audit</p>
                  <h2>Audit panel</h2>
                  <p>Compare the current run with recent in-memory history.</p>
                </div>
                <div className="audit-tabs">
                  <button type="button" className="toggle" data-active={activeAudit === "current"} onClick={() => setActiveAudit("current")}>
                    Current
                  </button>
                  <button type="button" className="toggle" data-active={activeAudit === "history"} onClick={() => setActiveAudit("history")}>
                    History
                  </button>
                </div>
              </div>
              <div className="panel-body audit-list">
                {activeAudit === "current" ? (
                  <>
                    <div className="audit-item">
                      <header>
                        <div>
                          <strong>{summaryToShow?.label ?? "Current live run"}</strong>
                          <p>{summaryToShow?.brief ?? "No completed run yet."}</p>
                        </div>
                        <span className="chip chip-emerald">{summaryToShow?.status ?? "idle"}</span>
                      </header>
                      <div className="audit-stats">
                        <div className="stat-card">
                          <label>Budget</label>
                          <strong>{formatUsd(summaryToShow?.budgetUsdc ?? budgetUsdc)}</strong>
                        </div>
                        <div className="stat-card">
                          <label>Confirm rate</label>
                          <strong>{summaryToShow?.confirmationRate ?? "0%"}</strong>
                        </div>
                        <div className="stat-card">
                          <label>Placement count</label>
                          <strong>{summaryToShow?.placements ?? 0}</strong>
                        </div>
                        <div className="stat-card">
                          <label>Timestamp</label>
                          <strong>{summaryToShow?.timestamp ?? "awaiting run"}</strong>
                        </div>
                      </div>
                    </div>
                    <div className="audit-item">
                      <header>
                        <div>
                          <strong>Receipt trail</strong>
                          <p>Transaction count and event progression for the live campaign.</p>
                        </div>
                        <span className="chip">{txCount} events</span>
                      </header>
                      <p>{footerNote}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="audit-item">
                      <header>
                        <div>
                          <strong>Recent campaigns</strong>
                          <p>Pick a prior run to inspect its spend profile.</p>
                        </div>
                        <span className="chip chip-cyan">{history.length} runs</span>
                      </header>
                      <div className="button-row">
                        {history.map((run) => (
                          <button
                            key={run.id}
                            type="button"
                            className="toggle"
                            data-active={selectedHistoryId === run.id}
                            onClick={() => setSelectedHistoryId(run.id)}
                          >
                            {run.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {currentHistory ? (
                      <div className="audit-item">
                        <header>
                          <div>
                            <strong>{currentHistory.label}</strong>
                            <p>{currentHistory.brief}</p>
                          </div>
                          <span className="chip chip-emerald">{currentHistory.confirmationRate}</span>
                        </header>
                        <div className="audit-stats">
                          <div className="stat-card">
                            <label>Budget</label>
                            <strong>{formatUsd(currentHistory.budgetUsdc)}</strong>
                          </div>
                          <div className="stat-card">
                            <label>Fees</label>
                            <strong>{formatUsd(currentHistory.feesUsdc)}</strong>
                          </div>
                          <div className="stat-card">
                            <label>Ad spend</label>
                            <strong>{formatUsd(currentHistory.adSpendUsdc)}</strong>
                          </div>
                          <div className="stat-card">
                            <label>Tx count</label>
                            <strong>{currentHistory.txCount}</strong>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </section>
          </aside>
        </div>

        <div className="footer-note">{footerNote}</div>
      </div>
    </main>
  );
}
