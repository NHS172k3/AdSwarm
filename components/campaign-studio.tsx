"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Gauge,
  Image as ImageIcon,
  LockKeyhole,
  Play,
  ReceiptText,
  RefreshCcw,
  Sparkles,
  Upload,
  Wallet,
} from "lucide-react";
import type {
  Artifact,
  CampaignDraft,
  CampaignEvent,
  PlanResult,
  Question,
  RunRecord,
  RunSummary,
  WalletState,
} from "@/lib/types";

type Props = {
  initialMode: "mock" | "onchain-single" | "onchain-sovereign";
};

type LiveEntry = {
  id: string;
  at: string;
  event: CampaignEvent;
};

type TapeStatus = "pending" | "confirmed" | "failed";
type StageId = "brief" | "review" | "launch" | "results";

const VIDEO_POLL_INTERVAL_MS = 10_000;

const PUBLISHER_SEEDS = [
  {
    id: "twitchside_banner",
    name: "TwitchSide Banner",
    priceUsdc: 0.05,
    description: "High-frequency placements near late-night streams.",
  },
  {
    id: "gamerforum_sidebar",
    name: "GamerForum Sidebar",
    priceUsdc: 0.03,
    description: "Thread-adjacent visibility for intent-rich communities.",
  },
  {
    id: "yt_preroll_slot",
    name: "YT Pre-roll Slot",
    priceUsdc: 0.08,
    description: "Quick sightline before highlight reels and reviews.",
  },
  {
    id: "discord_server_promo",
    name: "Discord Server Promo",
    priceUsdc: 0.02,
    description: "Pinned inside creator and clan channels.",
  },
  {
    id: "r_gaming_promoted",
    name: "r/Gaming Promoted",
    priceUsdc: 0.06,
    description: "Promoted feed slot for broad gaming reach.",
  },
  {
    id: "esports_livestream_l3",
    name: "Esports Livestream L3",
    priceUsdc: 0.09,
    description: "Premium placement for live match audiences.",
  },
  {
    id: "mobile_game_interstitial",
    name: "Mobile Game Interstitial",
    priceUsdc: 0.04,
    description: "Interruptive but affordable high-impression inventory.",
  },
  {
    id: "gg_newsletter_slot",
    name: "GG Newsletter Slot",
    priceUsdc: 0.03,
    description: "Curated newsletter placement with reliable CTR.",
  },
] as const;

const defaultDraft = (mode: Props["initialMode"]): CampaignDraft => ({
  brief: "A new energy drink for late-night gamers",
  budgetUsdc: 50,
  audience: "competitive gamers",
  cta: "pre-order now",
  productImage: "",
  useVideo: false,
  mode,
});

function labelForAgent(agent: string): string {
  switch (agent) {
    case "strategist":
      return "Strategist";
    case "copywriter":
      return "Copywriter";
    case "designer":
      return "Designer";
    case "mediabuyer":
      return "Media Buyer";
    case "client":
      return "Client Agent";
    default:
      return agent;
  }
}

function chipClass(status?: string): string {
  switch (status) {
    case "done":
    case "paid":
    case "confirmed":
    case "completed":
    case "accepted":
    case "ready":
      return "chip chip-emerald";
    case "failed":
    case "rejected":
      return "chip chip-rose";
    case "working":
    case "running":
    case "generating":
    case "pending":
      return "chip chip-amber";
    case "queued":
    case "proposed":
    case "review":
      return "chip chip-cyan";
    default:
      return "chip";
  }
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

function timeStamp(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

function artifactMediaUrl(artifact: Artifact | null | undefined): string | null {
  if (!artifact) return null;
  if (artifact.storageUrl) return artifact.storageUrl;
  if (artifact.type === "video" && artifact.status !== "ready") return null;
  const downloadUrl = artifact.metadata?.downloadUrl;
  return typeof downloadUrl === "string" && downloadUrl.length > 0 ? downloadUrl : null;
}

function artifactStatusUrl(artifact: Artifact | null | undefined): string | null {
  if (!artifact) return null;
  const statusUrl = artifact.metadata?.statusUrl ?? artifact.metadata?.pollUrl;
  return typeof statusUrl === "string" && statusUrl.length > 0 ? statusUrl : null;
}

function artifactDownloadUrl(artifact: Artifact | null | undefined): string | null {
  if (!artifact) return null;
  const downloadUrl = artifact.metadata?.downloadUrl;
  return typeof downloadUrl === "string" && downloadUrl.length > 0 ? downloadUrl : null;
}

function artifactPosterUrl(artifact: Artifact | null | undefined): string | undefined {
  if (!artifact) return undefined;
  const posterUrl = artifact.metadata?.posterUrl;
  return typeof posterUrl === "string" && posterUrl.length > 0 ? posterUrl : undefined;
}

function describeEvent(event: CampaignEvent): { title: string; detail: string; meta: string; status: TapeStatus } {
  switch (event.type) {
    case "clarify_question":
      return {
        title: "Client question",
        detail: event.question,
        meta: event.kind,
        status: "pending",
      };
    case "clarify_answer":
      return {
        title: "Client answer captured",
        detail: event.answer,
        meta: event.id,
        status: "confirmed",
      };
    case "deposit":
      return {
        title: "Treasury funded",
        detail: `${formatMoney(event.amountUsdc)} moved into campaign treasury.`,
        meta: `${formatMoney(event.treasuryBalanceUsdc)} live`,
        status: "confirmed",
      };
    case "proposal":
      return {
        title: `${labelForAgent(event.agent)} proposed`,
        detail: event.workDescription,
        meta: formatMoney(event.feeUsdc),
        status: "confirmed",
      };
    case "proposal_decision":
      return {
        title: `${labelForAgent(event.agent)} ${event.decision}`,
        detail: `Decision recorded for ${labelForAgent(event.agent)}.`,
        meta: event.decision,
        status: event.decision === "accepted" ? "confirmed" : "failed",
      };
    case "budget_check":
      return {
        title: event.ok ? "Budget clears" : "Budget blocked",
        detail: `Fees ${formatMoney(event.feesUsdc)} and generation ${formatMoney(event.generationCostUsdc)} leave ${formatMoney(event.adSpendUsdc)} for media.`,
        meta: event.ok ? "launch ready" : "needs more",
        status: event.ok ? "confirmed" : "failed",
      };
    case "budget_insufficient":
      return {
        title: "Budget insufficient",
        detail: event.message,
        meta: formatMoney(event.neededUsdc),
        status: "failed",
      };
    case "agent_status":
      return {
        title: `${labelForAgent(event.agent)} ${event.status}`,
        detail: `Agent moved to ${event.status}.`,
        meta: event.agent,
        status: event.status === "failed" ? "failed" : event.status === "done" || event.status === "paid" ? "confirmed" : "pending",
      };
    case "reasoning":
      return {
        title: `${labelForAgent(event.agent)} reasoning`,
        detail: event.text,
        meta: event.agent,
        status: "pending",
      };
    case "generation":
      return {
        title: `Creative ${event.status}`,
        detail: `${event.tier} generation cost ${formatMoney(event.realCostUsd)}.`,
        meta: event.status,
        status: event.status === "failed" ? "failed" : event.status === "done" ? "confirmed" : "pending",
      };
    case "creative":
      return {
        title: "Creative preview updated",
        detail: event.headline,
        meta: event.fallback ? "fallback asset" : "live asset",
        status: "confirmed",
      };
    case "payment":
      return {
        title: `${event.toLabel} payment sent`,
        detail: `${formatMoney(event.amountUsdc)} for ${event.kind}.`,
        meta: event.txHash.slice(0, 10),
        status: "pending",
      };
    case "payment_update":
      return {
        title: `Payment ${event.status}`,
        detail: event.blockNumber ? `Confirmed at block ${event.blockNumber}.` : `Payment ${event.status}.`,
        meta: event.id,
        status: event.status,
      };
    case "placement":
      return {
        title: `${event.publisher} bought`,
        detail: `Placement filled for ${formatMoney(event.priceUsdc)}.`,
        meta: event.slotId,
        status: "confirmed",
      };
    case "budget_update":
      return {
        title: "Budget updated",
        detail: `${formatMoney(event.remainingUsdc)} remains for media.`,
        meta: `${formatMoney(event.spentUsdc)} spent`,
        status: "confirmed",
      };
    case "artifact":
      return {
        title: `${event.artifact.title} ${event.artifact.status}`,
        detail: event.artifact.previewText ?? event.artifact.storageUrl ?? "Artifact updated.",
        meta: event.artifact.type,
        status: event.artifact.status === "failed" ? "failed" : event.artifact.status === "ready" ? "confirmed" : "pending",
      };
    case "summary":
      return {
        title: "Campaign summary",
        detail: `${event.placements} placements and ${event.txCount} transactions confirmed.`,
        meta: formatMoney(event.totalSpentUsdc),
        status: "confirmed",
      };
  }
}

export function CampaignStudio({ initialMode }: Props) {
  const [draft, setDraft] = useState<CampaignDraft>(defaultDraft(initialMode));
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [liveFeed, setLiveFeed] = useState<LiveEntry[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [running, setRunning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<StageId>("brief");
  const [visibleStages, setVisibleStages] = useState<Record<StageId, boolean>>({
    brief: true,
    review: false,
    launch: false,
    results: false,
  });

  const sectionRefs = useRef<Record<StageId, HTMLElement | null>>({
    brief: null,
    review: null,
    launch: null,
    results: null,
  });

  const proposals = plan?.proposalPack.proposals ?? [];
  const wallets = plan?.proposalPack.wallets ?? [];
  const budgetCheck = plan?.proposalPack.budgetCheck ?? null;
  const sortedRuns = useMemo(
    () => [...runs].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [runs],
  );
  const latestRun = sortedRuns[0] ?? null;
  const resolvedQuestions = useMemo(
    () =>
      (plan?.questions ?? []).map((question) => ({
        ...question,
        defaultAnswer: questionAnswers[question.id] ?? question.defaultAnswer ?? "",
      })),
    [plan?.questions, questionAnswers],
  );
  const tapeEntries = liveFeed.slice(-16).reverse();
  const artifactPreview = artifacts.slice(0, 6);

  const activeWallets = useMemo(() => {
    return wallets.map((wallet) => {
      const matchingProposal = proposals.find((proposal) => proposal.agent === wallet.id);
      const status = matchingProposal && accepted[matchingProposal.agent] === false ? "skipped" : wallet.status;
      return { ...wallet, status };
    });
  }, [accepted, proposals, wallets]);

  const creativeArtifact = useMemo(() => {
    return artifacts.find((artifact) => artifact.type === "image" && artifactMediaUrl(artifact)) ?? artifacts.find((artifact) => artifact.type === "image") ?? null;
  }, [artifacts]);

  const videoArtifact = useMemo(() => {
    return artifacts.find((artifact) => artifact.type === "video" && artifactMediaUrl(artifact)) ?? artifacts.find((artifact) => artifact.type === "video") ?? null;
  }, [artifacts]);

  const primaryMediaArtifact = useMemo(() => {
    // Only treat the video as the primary artifact once it actually has playable
    // media; while it is still queued/generating, keep showing the hero image so
    // it does not flash and disappear behind a not-yet-ready video.
    const playableVideo = artifactMediaUrl(videoArtifact) ? videoArtifact : null;
    if (draft.useVideo) return playableVideo ?? creativeArtifact ?? videoArtifact;
    return creativeArtifact ?? playableVideo ?? videoArtifact;
  }, [creativeArtifact, draft.useVideo, videoArtifact]);

  const primaryMediaUrl = artifactMediaUrl(primaryMediaArtifact);
  const videoPosterUrl = artifactPosterUrl(videoArtifact) ?? artifactMediaUrl(creativeArtifact) ?? draft.productImage ?? undefined;

  const creativeHeadline = useMemo(() => {
    const liveCreative = [...liveFeed].reverse().find((entry) => entry.event.type === "creative");
    if (liveCreative && liveCreative.event.type === "creative") return liveCreative.event.headline;
    return creativeArtifact?.previewText ?? draft.cta;
  }, [creativeArtifact?.previewText, draft.cta, liveFeed]);

  const placementCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of liveFeed) {
      if (entry.event.type === "placement") {
        counts.set(entry.event.slotId, (counts.get(entry.event.slotId) ?? 0) + 1);
      }
    }
    return counts;
  }, [liveFeed]);

  const paymentFees = useMemo(() => {
    return liveFeed.reduce((sum, entry) => {
      if (entry.event.type === "payment" && entry.event.kind === "fee") return sum + entry.event.amountUsdc;
      return sum;
    }, 0);
  }, [liveFeed]);

  const placementSpend = useMemo(() => {
    return liveFeed.reduce((sum, entry) => {
      if (entry.event.type === "placement") return sum + entry.event.priceUsdc;
      return sum;
    }, 0);
  }, [liveFeed]);

  const generationCost = summary?.generationCostUsdc ?? budgetCheck?.estimatedGenerationCostUsdc ?? 0;
  const feesToShow = summary?.feesUsdc ?? (paymentFees > 0 ? paymentFees : budgetCheck?.acceptedFeesUsdc ?? 0);
  const adSpendToShow = summary?.adSpendUsdc ?? placementSpend;
  const totalSpentToShow = summary?.totalSpentUsdc ?? Math.min(draft.budgetUsdc, feesToShow + generationCost + adSpendToShow);
  const remainingBudgetToShow = Math.max(0, draft.budgetUsdc - totalSpentToShow);
  const projectedAdSpend = budgetCheck ? Math.max(0, budgetCheck.projectedAdSpendUsdc) : draft.budgetUsdc;
  const gaugePercent = draft.budgetUsdc > 0 ? Math.min(1, Math.max(0.06, totalSpentToShow / draft.budgetUsdc)) : 0.06;
  const currentPhase = running ? "running" : summary ? "completed" : plan ? "review" : "intake";
  const launchReady = Boolean(plan && budgetCheck?.ok && !running);
  const acceptedCount = proposals.filter((proposal) => accepted[proposal.agent] !== false).length;
  const summaryReference = summary ?? latestRun?.summary ?? null;
  const stageOrder: StageId[] = ["brief", "review", "launch", "results"];
  const stageState = {
    brief: {
      label: "Brief",
      subtitle: "Capture the campaign ask",
      unlocked: true,
      ready: Boolean(plan),
    },
    review: {
      label: "Review",
      subtitle: "Choose the agent mix",
      unlocked: Boolean(plan),
      ready: Boolean(plan),
    },
    launch: {
      label: "Launch",
      subtitle: "Run the live campaign",
      unlocked: Boolean(plan),
      ready: Boolean(launchReady || running || summary),
    },
    results: {
      label: "Results",
      subtitle: "Close on receipts and history",
      unlocked: Boolean(plan),
      ready: Boolean(summaryReference),
    },
  } satisfies Record<StageId, { label: string; subtitle: string; unlocked: boolean; ready: boolean }>;

  useEffect(() => {
    void refreshAudit();
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = [...entries]
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio);

        if (visible[0]) {
          const stage = visible[0].target.getAttribute("data-stage-id") as StageId | null;
          if (stage) setActiveStage(stage);
        }

        setVisibleStages((current) => {
          const next = { ...current };
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const stage = entry.target.getAttribute("data-stage-id") as StageId | null;
              if (stage) next[stage] = true;
            }
          }
          return next;
        });
      },
      {
        threshold: [0.2, 0.55, 0.85],
        rootMargin: "-10% 0px -30% 0px",
      },
    );

    for (const stage of stageOrder) {
      const node = sectionRefs.current[stage];
      if (node) observer.observe(node);
    }

    return () => observer.disconnect();
  }, []);

  // Poll any in-flight OpenAI video jobs until they complete, then upgrade the
  // queued artifact into a playable one so the finished MP4 renders in place.
  const pendingVideoKey = useMemo(
    () =>
      artifacts
        .filter(
          (artifact) =>
            artifact.type === "video" &&
            artifact.status !== "ready" &&
            artifact.status !== "failed" &&
            typeof artifact.metadata?.openaiVideoId === "string",
        )
        .map((artifact) => String(artifact.metadata?.openaiVideoId))
        .join(","),
    [artifacts],
  );

  useEffect(() => {
    if (!pendingVideoKey) return;
    const videoIds = pendingVideoKey.split(",").filter(Boolean);
    let cancelled = false;

    async function pollVideo(videoId: string) {
      try {
        const response = await fetch(`/api/experimental/video?videoId=${encodeURIComponent(videoId)}`);
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as { video?: { status?: string } };
        const status = data.video?.status;
        if (cancelled || (status !== "completed" && status !== "failed")) return;

        setArtifacts((current) =>
          current.map((artifact) => {
            if (artifact.type !== "video" || artifact.metadata?.openaiVideoId !== videoId) return artifact;
            if (status === "failed") {
              return { ...artifact, status: "failed", previewText: "OpenAI video job failed." };
            }
            const downloadUrl =
              typeof artifact.metadata?.downloadUrl === "string"
                ? artifact.metadata.downloadUrl
                : `/api/experimental/video?videoId=${encodeURIComponent(videoId)}&download=1&variant=video`;
            return {
              ...artifact,
              status: "ready",
              storageUrl: downloadUrl,
              previewText: "OpenAI video render completed.",
            };
          }),
        );
      } catch {
        // Transient polling error; the interval retries on the next tick.
      }
    }

    void Promise.all(videoIds.map(pollVideo));
    const timer = setInterval(() => {
      void Promise.all(videoIds.map(pollVideo));
    }, VIDEO_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pendingVideoKey]);

  function jumpToStage(stage: StageId) {
    if (!stageState[stage].unlocked) return;
    setActiveStage(stage);
    sectionRefs.current[stage]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function refreshAudit() {
    try {
      const response = await fetch("/api/audit");
      if (!response.ok) return;
      const data = (await response.json()) as { runs: RunRecord[] };
      setRuns(data.runs);
    } catch {
      // Keep the page usable even if audit storage is unavailable.
    }
  }

  async function buildPlan() {
    setPlanError(null);
    setLaunchError(null);

    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });

      if (!response.ok) {
        setPlanError("Could not generate the plan.");
        return;
      }

      const data = (await response.json()) as PlanResult;
      setPlan(data);
      // Initialize per-plan UI state here (not in a [plan] effect): during a
      // launch, applyEvent mutates `plan` for wallet/agent updates, and a
      // plan-dependent effect would re-run and reset artifacts — wiping the
      // real generated image out from under the live run.
      setAccepted(Object.fromEntries(data.proposalPack.proposals.map((proposal) => [proposal.agent, true])));
      setArtifacts(data.proposalPack.artifacts);
      setQuestionAnswers((current) => {
        const next: Record<string, string> = {};
        for (const question of data.questions) {
          next[question.id] = current[question.id] ?? question.defaultAnswer ?? "";
        }
        return next;
      });
      setLiveFeed([]);
      setSummary(null);
      await refreshAudit();
      window.requestAnimationFrame(() => {
        jumpToStage("review");
      });
    } catch {
      setPlanError("Could not generate the plan.");
    }
  }

  function toggleAgent(agent: string) {
    setAccepted((current) => ({ ...current, [agent]: !current[agent] }));
  }

  function updateQuestionAnswer(question: Question, value: string) {
    setQuestionAnswers((current) => ({ ...current, [question.id]: value }));

    if (question.kind === "budget") {
      setDraft((current) => ({ ...current, budgetUsdc: Number(value) || 0 }));
      return;
    }

    if (question.kind === "audience") {
      setDraft((current) => ({ ...current, audience: value }));
      return;
    }

    if (question.kind === "cta") {
      setDraft((current) => ({ ...current, cta: value }));
    }
  }

  function acceptAll() {
    const next: Record<string, boolean> = {};
    for (const proposal of proposals) next[proposal.agent] = true;
    setAccepted(next);
  }

  function rejectCopywriter() {
    setAccepted((current) => ({ ...current, copywriter: false }));
  }

  function appendLiveEvent(event: CampaignEvent) {
    setLiveFeed((current) => [
      ...current,
      {
        id: `${event.type}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        at: timeStamp(),
        event,
      },
    ]);
    applyEvent(event);
  }

  async function launchCampaign() {
    if (!plan || !budgetCheck?.ok) return;

    setRunning(true);
    setLaunchError(null);
    setLiveFeed([]);
    setSummary(null);

    try {
      const response = await fetch("/api/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft,
          questions: resolvedQuestions,
          proposals,
          wallets,
          accepted,
        }),
      });

      if (!response.ok) {
        setLaunchError("Launch failed.");
        setRunning(false);
        return;
      }

      if (!response.body) {
        setLaunchError("No response stream available.");
        setRunning(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6)) as CampaignEvent | { type: "error"; message: string };
          if ((payload as { type: string }).type === "error") {
            setLaunchError((payload as { message: string }).message);
            continue;
          }
          appendLiveEvent(payload as CampaignEvent);
        }
      }

      await refreshAudit();
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : "Launch failed.");
    } finally {
      setRunning(false);
    }
  }

  function applyEvent(event: CampaignEvent) {
    if (event.type === "summary") {
      setSummary({
        feesUsdc: event.feesUsdc,
        generationCostUsdc: event.generationCostUsdc,
        adSpendUsdc: event.adSpendUsdc,
        placements: event.placements,
        txCount: event.txCount,
        totalSpentUsdc: event.totalSpentUsdc,
      });
      window.requestAnimationFrame(() => {
        jumpToStage("results");
      });
    }

    if (event.type === "artifact") {
      setArtifacts((current) => {
        const next = current.filter((artifact) => artifact.id !== event.artifact.id);
        return [event.artifact, ...next];
      });
    }

    if (event.type === "proposal_decision" && event.decision === "rejected") {
      setAccepted((current) => ({ ...current, [event.agent]: false }));
    }

    if (event.type === "payment" && event.kind === "fee") {
      setPlan((current) => {
        if (!current) return current;
        return {
          ...current,
          proposalPack: {
            ...current.proposalPack,
            wallets: current.proposalPack.wallets.map((wallet) =>
              wallet.label === event.toLabel
                ? ({ ...wallet, balanceUsdc: wallet.balanceUsdc + event.amountUsdc, status: "paid" } satisfies WalletState)
                : wallet,
            ),
          },
        };
      });
    }

    if (event.type === "agent_status") {
      setPlan((current) => {
        if (!current) return current;
        return {
          ...current,
          proposalPack: {
            ...current.proposalPack,
            wallets: current.proposalPack.wallets.map((wallet) =>
              wallet.id === event.agent ? { ...wallet, status: event.status } : wallet,
            ),
          },
        };
      });
    }
  }

  const lockedCard = (title: string, detail: string) => (
    <div className="studio-locked-card">
      <span className="chip">
        <LockKeyhole size={14} />
        Locked until the previous step completes
      </span>
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );

  return (
    <main className="mission-root">
      <section className="hero-cover" aria-label="AdSwarm Campaign Studio introduction">
        <div className="hero-cover-atmosphere" aria-hidden="true" />
        <div className="hero-cover-grid" aria-hidden="true" />

        <div className="hero-cover-inner">
          <p className="hero-kicker">
            <span className="hero-kicker-dot" aria-hidden="true" />
            Autonomous Ad Agency
          </p>
          <h1 className="hero-headline">
            The ad agency
            <em>that runs itself.</em>
          </h1>
          <p className="hero-subhead">
            Four AI specialists plan the strategy, negotiate their own fees, launch to live inventory, and settle every
            payment in on-chain USDC. You set the brief — the swarm runs the campaign while you watch.
          </p>

          <div className="hero-flow">
            <div className="hero-flow-step">
              <b>01 Plan</b>
              <span>Strategist</span>
              <small>Turns your brief into a targeted play.</small>
            </div>
            <div className="hero-flow-step">
              <b>02 Negotiate</b>
              <span>The swarm</span>
              <small>Each agent bids its own USDC fee.</small>
            </div>
            <div className="hero-flow-step">
              <b>03 Create</b>
              <span>Designer + Copy</span>
              <small>Ship the hero creative and headline.</small>
            </div>
            <div className="hero-flow-step">
              <b>04 Settle</b>
              <span>Media Buyer</span>
              <small>Buys placements, pays publishers.</small>
            </div>
          </div>

          <div className="hero-actions">
            <button type="button" className="hero-cta" onClick={() => jumpToStage("brief")}>
              Enter the Studio
              <ArrowRight size={18} />
            </button>
            <button type="button" className="hero-cta-ghost" onClick={() => jumpToStage("launch")}>
              <Play size={16} />
              Watch a live run
            </button>
          </div>
        </div>

        <div className="hero-cover-visual">
          <svg className="arch-diagram" viewBox="0 0 480 440" role="img" aria-label="Diagram of the autonomous agent swarm settling payments in USDC">
            <g aria-hidden="true">
              <path className="arch-link" data-kind="deposit" d="M240 84 L240 180" />
              <path className="arch-link" data-kind="fee" d="M208 206 L112 166" />
              <path className="arch-link" data-kind="fee" d="M272 206 L368 166" />
              <path className="arch-link" data-kind="fee" d="M208 238 L112 286" />
              <path className="arch-link" data-kind="fee" d="M272 238 L368 286" />
              <path className="arch-link" data-kind="adbuy" d="M386 330 L272 374" />

              <circle className="arch-coin arch-coin--c1" data-kind="deposit" r="3.6" />
              <circle className="arch-coin arch-coin--c2" data-kind="fee" r="3.2" />
              <circle className="arch-coin arch-coin--c3" data-kind="fee" r="3.2" />
              <circle className="arch-coin arch-coin--c4" data-kind="fee" r="3.2" />
              <circle className="arch-coin arch-coin--c5" data-kind="fee" r="3.2" />
              <circle className="arch-coin arch-coin--c6" data-kind="adbuy" r="3.6" />
            </g>

            <g className="arch-node" data-role="edge">
              <circle className="arch-node-ring" cx="240" cy="52" r="30" />
              <text className="arch-node-label" x="240" y="50">Client</text>
              <text className="arch-node-sub" x="240" y="63">brief</text>
            </g>

            <g className="arch-node" data-role="treasury">
              <circle className="arch-node-glow" cx="240" cy="222" r="42" />
              <circle className="arch-node-ring" cx="240" cy="222" r="42" />
              <text className="arch-node-label" x="240" y="219">Treasury</text>
              <text className="arch-node-sub" x="240" y="233">USDC</text>
            </g>

            <g className="arch-node" data-role="agent" data-i="0">
              <circle className="arch-node-glow" cx="78" cy="150" r="34" />
              <circle className="arch-node-ring" cx="78" cy="150" r="34" />
              <text className="arch-node-label" x="78" y="148">Strategist</text>
              <text className="arch-node-sub" x="78" y="161">plan</text>
            </g>

            <g className="arch-node" data-role="agent" data-i="1">
              <circle className="arch-node-glow" cx="402" cy="150" r="34" />
              <circle className="arch-node-ring" cx="402" cy="150" r="34" />
              <text className="arch-node-label" x="402" y="148">Copywriter</text>
              <text className="arch-node-sub" x="402" y="161">words</text>
            </g>

            <g className="arch-node" data-role="agent" data-i="2">
              <circle className="arch-node-glow" cx="78" cy="300" r="34" />
              <circle className="arch-node-ring" cx="78" cy="300" r="34" />
              <text className="arch-node-label" x="78" y="298">Designer</text>
              <text className="arch-node-sub" x="78" y="311">creative</text>
            </g>

            <g className="arch-node" data-role="agent" data-i="3">
              <circle className="arch-node-glow" cx="402" cy="300" r="34" />
              <circle className="arch-node-ring" cx="402" cy="300" r="34" />
              <text className="arch-node-label" x="402" y="298">Media Buyer</text>
              <text className="arch-node-sub" x="402" y="311">placements</text>
            </g>

            <g className="arch-node" data-role="edge">
              <circle className="arch-node-ring" cx="240" cy="396" r="30" />
              <text className="arch-node-label" x="240" y="394">Publishers</text>
              <text className="arch-node-sub" x="240" y="407">8 slots</text>
            </g>
          </svg>

          <div className="arch-caption" aria-hidden="true">
            <span>
              <i data-kind="deposit" />
              Deposit
            </span>
            <span>
              <i data-kind="fee" />
              Agent fees
            </span>
            <span>
              <i data-kind="adbuy" />
              Ad buys
            </span>
          </div>
        </div>

        <button type="button" className="hero-scrollcue" onClick={() => jumpToStage("brief")}>
          <span>Scroll to begin</span>
          <ChevronDown size={16} />
        </button>

        <div className="hero-cover-fade" aria-hidden="true" />
      </section>

      <div className="shell studio-shell">
        <header className="topbar">
          <div className="brand-lockup">
            <div className="brand-mark">AS</div>
            <div className="brand-copy">
              <p className="eyebrow">Live workspace</p>
              <h1>AdSwarm Campaign Studio</h1>
              <p>
                Build the brief, review the negotiation, launch to inventory, and close out the run — each stage keeps the
                next action clear without hiding the live operating context.
              </p>
            </div>
          </div>

          <div className="topbar-meta">
            <span className="chip">
              <LockKeyhole size={14} />
              <strong>{draft.mode}</strong>
            </span>
            <span className="chip chip-amber">
              <Wallet size={14} />
              <strong>{formatMoney(draft.budgetUsdc)}</strong>
            </span>
            <span className={budgetCheck?.ok ? "chip chip-emerald" : "chip chip-cyan"}>
              <Gauge size={14} />
              <strong>{budgetCheck ? formatMoney(projectedAdSpend) : "awaiting plan"}</strong>
            </span>
            <span className={currentPhase === "completed" ? "chip chip-emerald" : currentPhase === "running" ? "chip chip-amber" : "chip chip-cyan"}>
              <ReceiptText size={14} />
              <strong>{currentPhase}</strong>
            </span>
          </div>
        </header>

        <nav className="studio-stage-nav" aria-label="Campaign flow">
          {stageOrder.map((stage, index) => (
            <button
              key={stage}
              type="button"
              className="studio-stage-pill"
              data-active={activeStage === stage}
              data-ready={stageState[stage].ready}
              disabled={!stageState[stage].unlocked}
              onClick={() => jumpToStage(stage)}
            >
              <span className="studio-stage-pill-index">0{index + 1}</span>
              <span className="studio-stage-pill-copy">
                <strong>{stageState[stage].label}</strong>
                <small>{stageState[stage].subtitle}</small>
              </span>
            </button>
          ))}
        </nav>

        <div className="studio-story">
          <section
            ref={(node) => {
              sectionRefs.current.brief = node;
            }}
            className="panel studio-chapter studio-chapter-hero"
            data-stage-id="brief"
            data-visible={visibleStages.brief}
            data-active={activeStage === "brief"}
          >
            <div className="panel-header studio-panel-header">
              <div>
                <p className="eyebrow">Act I — Brief</p>
                <h2>Campaign brief</h2>
                <p>Capture the ask, attach a reference if you have one, then partially submit by building the plan.</p>
              </div>
              <div className="button-row">
                {planError ? <span className="chip chip-rose">{planError}</span> : <span className="chip">Starts with intake only</span>}
              </div>
            </div>

            <div className="panel-body">
              <div className="studio-hero-grid">
                <div className="studio-form">
                  <div className="field">
                    <label htmlFor="brief">Product brief</label>
                    <textarea
                      id="brief"
                      value={draft.brief}
                      onChange={(event) => setDraft((current) => ({ ...current, brief: event.target.value }))}
                    />
                  </div>

                  <div className="studio-field-grid">
                    <div className="field">
                      <label htmlFor="budget">Budget</label>
                      <input
                        id="budget"
                        type="number"
                        min="1"
                        step="1"
                        value={draft.budgetUsdc}
                        onChange={(event) => setDraft((current) => ({ ...current, budgetUsdc: Number(event.target.value) || 0 }))}
                      />
                    </div>

                    <div className="field">
                      <label>Creative output</label>
                      <div className="option-row">
                        <button type="button" className="toggle" data-active={!draft.useVideo} onClick={() => setDraft((current) => ({ ...current, useVideo: false }))}>
                          <ImageIcon size={14} />
                          Hero image
                        </button>
                        <button type="button" className="toggle" data-active={draft.useVideo} onClick={() => setDraft((current) => ({ ...current, useVideo: true }))}>
                          <Play size={14} />
                          Image + video
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="studio-field-grid">
                    <div className="field">
                      <label htmlFor="audience">Audience</label>
                      <input
                        id="audience"
                        value={draft.audience}
                        onChange={(event) => setDraft((current) => ({ ...current, audience: event.target.value }))}
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="cta">Call to action</label>
                      <input
                        id="cta"
                        value={draft.cta}
                        onChange={(event) => setDraft((current) => ({ ...current, cta: event.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="upload">Product image</label>
                    <label className="studio-upload" htmlFor="upload">
                      <div className="studio-upload-copy">
                        <Upload size={18} />
                        <div>
                          <strong>{draft.productImage ? "Reference image ready" : "Drop in a product image"}</strong>
                          <span>{draft.productImage ? "The designer will use it as the hero asset seed." : "Optional. Creative can still be generated from the brief."}</span>
                        </div>
                      </div>
                      <span className="chip">{draft.productImage ? "attached" : "optional"}</span>
                    </label>
                    <input
                      id="upload"
                      className="sr-only"
                      type="file"
                      accept="image/*"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const dataUrl = await fileToDataUrl(file);
                        setDraft((current) => ({ ...current, productImage: dataUrl }));
                      }}
                    />
                  </div>

                  <div className="button-row">
                    <button type="button" className="button button-primary" onClick={buildPlan} disabled={running}>
                      <Sparkles size={16} />
                      Build plan
                    </button>
                  </div>
                </div>

                <aside className="studio-preview-column">
                  <div className="studio-preview-stage">
                    {primaryMediaUrl || draft.productImage ? (
                      primaryMediaArtifact?.type === "video" && primaryMediaUrl ? (
                        <video className="studio-preview-video" src={primaryMediaUrl} poster={videoPosterUrl} controls playsInline preload="metadata" />
                      ) : (
                        <img
                          className="studio-preview-image"
                          src={primaryMediaUrl ?? draft.productImage}
                          alt="Campaign creative preview"
                        />
                      )
                    ) : (
                      <div className="studio-preview-fallback">
                        <span className="chip chip-cyan">{draft.useVideo ? "image + video" : "image first"}</span>
                        <h3>{draft.cta}</h3>
                        <p>{draft.brief}</p>
                        <div className="studio-preview-foot">
                          <span>{draft.audience}</span>
                          <ArrowRight size={14} />
                          <strong>{formatMoney(draft.budgetUsdc)}</strong>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="studio-roster">
                    <div className="studio-info-row">
                      <span className="eyebrow">Standing by</span>
                      <span className={plan ? "chip chip-emerald" : "chip"}>{plan ? "plan ready" : "awaiting brief"}</span>
                    </div>
                    <div className="studio-roster-list">
                      <span className="studio-roster-chip">Strategist</span>
                      <span className="studio-roster-chip">Copywriter</span>
                      <span className="studio-roster-chip">Designer</span>
                      <span className="studio-roster-chip">Media Buyer</span>
                    </div>
                    <p className="hint">Build the plan and the swarm negotiates fees, generates creative, and settles publishers — you approve and watch.</p>
                  </div>
                </aside>
              </div>
            </div>
          </section>

          <section
            ref={(node) => {
              sectionRefs.current.review = node;
            }}
            className="panel studio-chapter"
            data-stage-id="review"
            data-visible={visibleStages.review}
            data-active={activeStage === "review"}
          >
            <div className="panel-header studio-panel-header">
              <div>
                <p className="eyebrow">Act II — Review</p>
                <h2>Review the agent negotiation</h2>
                <p>Focus the screen on what the user needs to decide: which specialists stay in, and what budget remains for media.</p>
              </div>
              <div className="studio-utility-row">
                <button type="button" className="button button-quiet" onClick={acceptAll} disabled={!plan || running}>
                  <Check size={16} />
                  Accept all
                </button>
                <button type="button" className="button button-quiet" onClick={rejectCopywriter} disabled={!plan || running}>
                  <ChevronRight size={16} />
                  Trim copy
                </button>
              </div>
            </div>

            <div className="panel-body">
              {!plan ? (
                lockedCard(
                  "Build the plan first",
                  "The negotiation section stays quiet until the campaign brief has been priced by the real planning endpoint.",
                )
              ) : (
                <div className="studio-review-grid">
                  <div className="proposal-board">
                    <div className="proposal-grid studio-proposal-grid">
                      {proposals.map((proposal, proposalIndex) => {
                        const isAccepted = accepted[proposal.agent] !== false;
                        const generationMeta =
                          proposal.meta && "genCostUsdc" in proposal.meta ? Number(proposal.meta.genCostUsdc ?? 0) : null;
                        const placementMeta =
                          proposal.meta && "estimatedPlacements" in proposal.meta && typeof proposal.meta.estimatedPlacements === "number"
                            ? proposal.meta.estimatedPlacements
                            : null;

                        return (
                          <article
                            className="proposal-card studio-proposal-card stagger-item"
                            style={{ ["--i" as string]: proposalIndex }}
                            data-decision={isAccepted ? "accepted" : "rejected"}
                            key={proposal.agent}
                          >
                            <div className="proposal-head">
                              <div>
                                <strong>{proposal.title}</strong>
                                <span>{labelForAgent(proposal.agent)}</span>
                              </div>
                              <span className="proposal-fee">{formatMoney(proposal.feeUsdc)}</span>
                            </div>

                            <p className="hint">{proposal.workDescription}</p>

                            <div className="proposal-meta">
                              <span className={chipClass(isAccepted ? "accepted" : "rejected")}>{isAccepted ? "accepted" : "rejected"}</span>
                              {generationMeta !== null ? <span className="chip">gen {formatMoney(generationMeta)}</span> : null}
                              {placementMeta !== null ? <span className="chip">{placementMeta} placements</span> : null}
                            </div>

                            <div className="proposal-actions">
                              <button type="button" className="toggle" data-active={isAccepted} onClick={() => toggleAgent(proposal.agent)}>
                                {isAccepted ? "Accepted" : "Rejected"}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>

                  <aside className="studio-review-side">
                    <div className="studio-question-panel">
                      <div className="studio-inline-head">
                        <span className="eyebrow">Client answers</span>
                        <span className="chip">{resolvedQuestions.length > 0 ? `${resolvedQuestions.length} ready` : "waiting"}</span>
                      </div>

                      {resolvedQuestions.length === 0 ? (
                        <p className="hint">Build the plan to expose the clarification questions before launch.</p>
                      ) : (
                        <div className="studio-question-list">
                          {resolvedQuestions.map((question, questionIndex) => (
                            <label className="studio-question-field stagger-item" style={{ ["--i" as string]: questionIndex }} key={question.id}>
                              <span>{question.question}</span>
                              <input
                                type={question.kind === "budget" ? "number" : "text"}
                                min={question.kind === "budget" ? "1" : undefined}
                                step={question.kind === "budget" ? "1" : undefined}
                                value={question.defaultAnswer ?? ""}
                                onChange={(event) => updateQuestionAnswer(question, event.target.value)}
                              />
                            </label>
                          ))}
                        </div>
                      )}

                      <p className="hint">These answers are sent with launch. Rebuild the plan if you materially change budget or targeting.</p>
                    </div>

                    <div className="studio-budget-card">
                      <div className="studio-inline-head">
                        <span className="eyebrow">Budget guard</span>
                        <span className={budgetCheck ? chipClass(budgetCheck.ok ? "accepted" : "failed") : "chip"}>
                          {budgetCheck ? (budgetCheck.ok ? "launch ready" : "needs more") : "waiting"}
                        </span>
                      </div>

                      <div className="studio-meter">
                        <span style={{ width: `${Math.min(100, Math.max(8, (projectedAdSpend / Math.max(draft.budgetUsdc, 1)) * 100))}%` }} />
                      </div>

                      <div className="audit-stats">
                        <div className="stat-card">
                          <label>Accepted agents</label>
                          <strong>{acceptedCount}</strong>
                        </div>
                        <div className="stat-card">
                          <label>Fees</label>
                          <strong>{formatMoney(budgetCheck?.acceptedFeesUsdc ?? 0)}</strong>
                        </div>
                        <div className="stat-card">
                          <label>Generation</label>
                          <strong>{formatMoney(budgetCheck?.estimatedGenerationCostUsdc ?? 0)}</strong>
                        </div>
                        <div className="stat-card">
                          <label>Ad spend</label>
                          <strong>{formatMoney(projectedAdSpend)}</strong>
                        </div>
                      </div>

                      <p className="hint">Use the launch step when the accepted mix and remaining media budget look right.</p>
                    </div>

                    <div className="studio-ledger">
                      <div className="studio-inline-head">
                        <span className="eyebrow">Agent ledger</span>
                        <span className="chip">
                          <Wallet size={14} />
                          {activeWallets.length}
                        </span>
                      </div>

                      <div className="studio-wallet-list">
                        {activeWallets.map((wallet, walletIndex) => (
                          <article className="studio-wallet-card stagger-item" style={{ ["--i" as string]: walletIndex }} key={wallet.id}>
                            <div className="studio-wallet-head">
                              <strong>{wallet.label}</strong>
                              <span className={chipClass(wallet.status)}>{wallet.status}</span>
                            </div>
                            <div className="studio-wallet-meta">
                              <span>
                                {wallet.address.slice(0, 10)}...{wallet.address.slice(-6)}
                              </span>
                              <strong>{formatMoney(wallet.balanceUsdc)}</strong>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  </aside>
                </div>
              )}
            </div>
          </section>

          <section
            ref={(node) => {
              sectionRefs.current.launch = node;
            }}
            className="panel signature-stage studio-chapter"
            data-stage-id="launch"
            data-visible={visibleStages.launch}
            data-active={activeStage === "launch"}
          >
            <div className="panel-header studio-panel-header">
              <div>
                <p className="eyebrow">Act III — Launch</p>
                <h2>Launch the live campaign</h2>
                <p>The action surface stays focused: launch control, creative, spend tape, and the publisher storm that proves the loop.</p>
              </div>
              <div className="button-row">
                {launchError ? <span className="chip chip-rose">{launchError}</span> : null}
                <span className={launchReady ? "chip chip-emerald" : "chip"}>{launchReady ? "launch ready" : budgetCheck ? "review needed" : "waiting"}</span>
                <button type="button" className="button button-primary" onClick={launchCampaign} disabled={!launchReady}>
                  <Play size={16} />
                  {running ? "Launching..." : "Launch campaign"}
                </button>
              </div>
            </div>

            <div className="panel-body">
              {!plan ? (
                lockedCard(
                  "Review the proposal pack first",
                  "The launch stage only becomes actionable after pricing, budget math, and acceptance decisions are visible.",
                )
              ) : (
                <>
                  <div className="studio-live-grid">
                    <div className="studio-live-main">
                      <div className="studio-creative-panel">
                        <div className="studio-inline-head">
                          <span className="eyebrow">Creative preview</span>
                          <span className="chip">{draft.useVideo ? "image + video" : "image"}</span>
                        </div>

                        <div className="studio-live-stage">
                          {primaryMediaUrl || draft.productImage ? (
                            primaryMediaArtifact?.type === "video" && primaryMediaUrl ? (
                              <video className="studio-preview-video" src={primaryMediaUrl} poster={videoPosterUrl} controls playsInline preload="metadata" />
                            ) : (
                              <img
                                className="studio-preview-image"
                                src={primaryMediaUrl ?? draft.productImage}
                                alt="Live creative preview"
                              />
                            )
                          ) : (
                            <div className="studio-preview-fallback">
                              <span className="chip chip-amber">awaiting creative</span>
                              <h3>{draft.cta}</h3>
                              <p>The designer will either use the uploaded product image or publish a fallback poster during the run.</p>
                            </div>
                          )}
                        </div>

                        <div className="studio-creative-copy">
                          <strong>{creativeArtifact?.title ?? "Hero creative"}</strong>
                          <p>{creativeHeadline}</p>
                        </div>
                      </div>

                      <div className="summary-grid studio-summary-grid">
                        <div className="summary-metric">
                          <label>Fees paid</label>
                          <strong>{formatMoney(feesToShow)}</strong>
                        </div>
                        <div className="summary-metric">
                          <label>Generation</label>
                          <strong>{formatMoney(generationCost)}</strong>
                        </div>
                        <div className="summary-metric">
                          <label>Ad spend</label>
                          <strong>{formatMoney(adSpendToShow)}</strong>
                        </div>
                        <div className="summary-metric">
                          <label>Placements</label>
                          <strong>{summary?.placements ?? liveFeed.filter((entry) => entry.event.type === "placement").length}</strong>
                        </div>
                      </div>

                      <div className="artifact-strip">
                        <div className="studio-inline-head">
                          <span className="eyebrow">Artifacts</span>
                          <span className="chip">
                            <FileText size={14} />
                            {artifactPreview.length}
                          </span>
                        </div>

                        <div className="artifact-row">
                          {artifactPreview.map((artifact, artifactIndex) => (
                            <article className="artifact-card stagger-item" style={{ ["--i" as string]: artifactIndex }} key={artifact.id}>
                              <span className="artifact-state" data-state={artifact.status}>
                                {artifact.status}
                              </span>
                              {artifact.type === "image" && artifactMediaUrl(artifact) ? (
                                <img className="artifact-media" src={artifactMediaUrl(artifact) ?? undefined} alt={artifact.title} />
                              ) : null}
                              {artifact.type === "video" && artifactMediaUrl(artifact) ? (
                                <video
                                  className="artifact-media artifact-video"
                                  src={artifactMediaUrl(artifact) ?? undefined}
                                  poster={artifactPosterUrl(artifact) ?? videoPosterUrl}
                                  controls
                                  playsInline
                                  preload="metadata"
                                />
                              ) : null}
                              {artifact.type === "video" && !artifactMediaUrl(artifact) ? (
                                <div className="artifact-media artifact-video-placeholder">
                                  <Play size={18} />
                                  <span>{artifact.status === "failed" ? "Video unavailable" : "Video job queued"}</span>
                                </div>
                              ) : null}
                              <strong>{artifact.title}</strong>
                              <p>{artifact.previewText ?? artifact.storageUrl ?? "Ready."}</p>
                              {artifact.type === "video" ? (
                                <div className="artifact-actions">
                                  {artifactStatusUrl(artifact) ? (
                                    <a href={artifactStatusUrl(artifact) ?? undefined} target="_blank" rel="noreferrer">
                                      Check status
                                    </a>
                                  ) : null}
                                  {artifactDownloadUrl(artifact) ? (
                                    <a href={artifactDownloadUrl(artifact) ?? undefined} target="_blank" rel="noreferrer">
                                      Download MP4
                                    </a>
                                  ) : null}
                                </div>
                              ) : null}
                              <span className="chip">
                                <span className="mono">{artifact.type}</span>
                              </span>
                            </article>
                          ))}
                        </div>
                      </div>
                    </div>

                    <aside className="studio-live-side">
                      <div className="gauge">
                        <div className="studio-inline-head">
                          <span className="eyebrow">Budget gauge</span>
                          <span className="chip chip-amber">
                            <CircleDollarSign size={14} />
                            {formatMoney(remainingBudgetToShow)}
                          </span>
                        </div>

                        <div className="gauge-ring" style={{ ["--fill" as string]: `${Math.round(gaugePercent * 360)}deg` }}>
                          <div className="gauge-center">
                            <div>
                              <strong>{formatMoney(totalSpentToShow)}</strong>
                              <span>{running || summary ? "spent so far" : "reserved pre-launch"}</span>
                            </div>
                          </div>
                        </div>

                        <div className="gauge-stats">
                          <div className="stat-card">
                            <label>Run state</label>
                            <strong>{running ? "Live" : summary ? "Complete" : "Idle"}</strong>
                          </div>
                          <div className="stat-card">
                            <label>Transactions</label>
                            <strong>{summary?.txCount ?? liveFeed.filter((entry) => entry.event.type === "payment").length}</strong>
                          </div>
                          <div className="stat-card">
                            <label>Remaining</label>
                            <strong>{formatMoney(remainingBudgetToShow)}</strong>
                          </div>
                          <div className="stat-card">
                            <label>Projected media</label>
                            <strong>{formatMoney(projectedAdSpend)}</strong>
                          </div>
                        </div>
                      </div>

                      <div className="tape">
                        <div className="studio-inline-head">
                          <span className="eyebrow">Spend tape</span>
                          <span className="chip">
                            <ReceiptText size={14} />
                            {tapeEntries.length}
                          </span>
                        </div>

                        <ul className="tape-list" aria-live="polite">
                          {tapeEntries.length === 0 ? (
                            <li className="tape-item" data-status="confirmed">
                              <span className="tape-dot" />
                              <div>
                                <h4>Waiting for launch</h4>
                                <p>The tape stays in place so the live run can start without shifting the page.</p>
                              </div>
                              <div className="tape-meta">
                                <strong>idle</strong>
                                <span>no receipts yet</span>
                              </div>
                            </li>
                          ) : (
                            tapeEntries.map((entry) => {
                              const detail = describeEvent(entry.event);
                              return (
                                <li className="tape-item" data-status={detail.status} key={entry.id}>
                                  <span className="tape-dot" />
                                  <div>
                                    <h4>{detail.title}</h4>
                                    <p>{detail.detail}</p>
                                  </div>
                                  <div className="tape-meta">
                                    <strong>{entry.at}</strong>
                                    <span>{detail.meta}</span>
                                  </div>
                                </li>
                              );
                            })
                          )}
                        </ul>
                      </div>
                    </aside>
                  </div>

                  <div className="studio-publisher-band">
                    <div className="studio-inline-head">
                      <span className="eyebrow">Mock publishers</span>
                      <button type="button" className="button button-quiet" onClick={refreshAudit}>
                        <RefreshCcw size={16} />
                        Refresh audit
                      </button>
                    </div>

                    <div className="publisher-grid studio-publisher-grid">
                      {PUBLISHER_SEEDS.map((slot, slotIndex) => {
                        const count = placementCounts.get(slot.id) ?? 0;
                        const state = count > 0 ? "filled" : running ? "active" : "idle";

                        return (
                          <article className="publisher-card stagger-item" style={{ ["--i" as string]: slotIndex }} data-state={state} key={slot.id}>
                            <div className="publisher-meta">
                              <strong>{slot.name}</strong>
                              <span>{formatMoney(slot.priceUsdc)}</span>
                            </div>
                            <p>{slot.description}</p>
                            <div className="button-row">
                              <span className="chip">{count} buys</span>
                              <span className={state === "filled" ? "chip chip-emerald" : state === "active" ? "chip chip-amber" : "chip"}>
                                {state}
                              </span>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          <section
            ref={(node) => {
              sectionRefs.current.results = node;
            }}
            className="panel studio-chapter"
            data-stage-id="results"
            data-visible={visibleStages.results}
            data-active={activeStage === "results"}
          >
            <div className="panel-header studio-panel-header">
              <div>
                <p className="eyebrow">Act IV — Results</p>
                <h2>Results and audit trail</h2>
                <p>End the experience on proof: the closeout summary stays visible, and recent runs sit beside it rather than crowding the launch step.</p>
              </div>
              <div className="button-row">
                <span className={summaryReference ? "chip chip-emerald" : "chip"}>{summaryReference ? "summary ready" : "awaiting first run"}</span>
              </div>
            </div>

            <div className="panel-body">
              <div className="studio-audit-grid">
                <div className="audit-list">
                  <article className="audit-item stagger-item" style={{ ["--i" as string]: 0 }}>
                    <header>
                      <div>
                        <strong>{summary ? "Current run" : latestRun ? "Latest recorded run" : "No completed run yet"}</strong>
                        <p>
                          {summary
                            ? draft.brief
                            : latestRun
                              ? latestRun.draft.brief
                              : "Launch a campaign to populate the audit trail and closeout metrics."}
                        </p>
                      </div>
                      <span className={summary ? "chip chip-emerald" : latestRun ? chipClass(latestRun.status) : "chip"}>{summary ? "completed" : latestRun?.status ?? "idle"}</span>
                    </header>

                    <div className="audit-stats">
                      <div className="stat-card">
                        <label>Budget</label>
                        <strong>{formatMoney(summary ? draft.budgetUsdc : latestRun?.draft.budgetUsdc ?? draft.budgetUsdc)}</strong>
                      </div>
                      <div className="stat-card">
                        <label>Placements</label>
                        <strong>{summaryReference?.placements ?? 0}</strong>
                      </div>
                      <div className="stat-card">
                        <label>Transactions</label>
                        <strong>{summaryReference?.txCount ?? 0}</strong>
                      </div>
                      <div className="stat-card">
                        <label>Total spent</label>
                        <strong>{formatMoney(summaryReference?.totalSpentUsdc ?? 0)}</strong>
                      </div>
                    </div>
                  </article>

                </div>

                <div className="audit-list">
                  {sortedRuns.length === 0 ? (
                    <article className="audit-item stagger-item" style={{ ["--i" as string]: 0 }}>
                      <header>
                        <div>
                          <strong>Recent runs</strong>
                          <p>No runs yet. Launch a campaign to fill this history column.</p>
                        </div>
                        <span className="chip">0</span>
                      </header>
                    </article>
                  ) : (
                    sortedRuns.map((run, runIndex) => (
                      <article className="audit-item stagger-item" style={{ ["--i" as string]: runIndex }} key={run.id}>
                        <header>
                          <div>
                            <strong>{run.draft.brief.slice(0, 48)}</strong>
                            <p>{formatDateTime(run.createdAt)}</p>
                          </div>
                          <span className={chipClass(run.status)}>{run.status}</span>
                        </header>

                        <div className="audit-stats">
                          <div className="stat-card">
                            <label>Mode</label>
                            <strong>{run.mode}</strong>
                          </div>
                          <div className="stat-card">
                            <label>Budget</label>
                            <strong>{formatMoney(run.draft.budgetUsdc)}</strong>
                          </div>
                          <div className="stat-card">
                            <label>Placements</label>
                            <strong>{run.summary?.placements ?? 0}</strong>
                          </div>
                          <div className="stat-card">
                            <label>Spent</label>
                            <strong>{formatMoney(run.summary?.totalSpentUsdc ?? 0)}</strong>
                          </div>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
