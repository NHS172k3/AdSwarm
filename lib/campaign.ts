import { CONFIG } from "./config";
import { maybeGenerateCampaignImage, maybeGenerateJson } from "./openai";
import { createExperimentalVideo, EXPERIMENTAL_OPENAI_VIDEO_CONFIG } from "./openai-video-experimental";
import { appendEvent, completeRun, createRunRecord, failRun, updateRun } from "./audit-store";
import { createPaymentProvider } from "./payment";
import { clamp, generateId, randomAddress, randomHex, roundMoney, safeJson, sleep } from "./mock";
import { PUBLISHER_SLOTS } from "./publishers";
import type {
  AgentId,
  Artifact,
  CampaignDraft,
  CampaignEvent,
  PlanResult,
  Proposal,
  Question,
  RunSummary,
  WalletState,
} from "./types";

function createWallet(id: WalletState["id"], label: string, canSend = false, funded = false): WalletState {
  return {
    id,
    label,
    address: randomAddress(),
    balanceUsdc: 0,
    funded,
    canSend,
    status: "idle",
  };
}

export function createWalletSet(mode = CONFIG.PAYMENT_MODE): WalletState[] {
  const treasuryCanSend = mode === "onchain-single" || mode === "mock";
  return [
    createWallet("client", "Client Agent"),
    createWallet("strategist", "Strategist"),
    createWallet("copywriter", "Copywriter"),
    createWallet("designer", "Designer"),
    createWallet("mediabuyer", "Media Buyer"),
  ].map((wallet) => ({
    ...wallet,
    funded: wallet.id === "client" ? true : mode === "mock" ? false : wallet.id === "mediabuyer" ? false : false,
    canSend: wallet.id === "client" ? false : mode === "mock" ? true : wallet.id === "mediabuyer" ? false : false,
  }));
}

function getLabel(agent: AgentId): string {
  switch (agent) {
    case "client":
      return "Client Agent";
    case "strategist":
      return "Strategist";
    case "copywriter":
      return "Copywriter";
    case "designer":
      return "Designer";
    case "mediabuyer":
      return "Media Buyer";
  }
}

function questionSet(draft: CampaignDraft): Question[] {
  const base = [
    {
      id: "budget",
      kind: "budget" as const,
      question: "What budget should this campaign spend?",
      defaultAnswer: `${draft.budgetUsdc ?? CONFIG.DEFAULT_BUDGET_USDC}`,
    },
    {
      id: "audience",
      kind: "audience" as const,
      question: "Who is the primary audience?",
      defaultAnswer: draft.audience || "competitive gamers",
    },
    {
      id: "cta",
      kind: "cta" as const,
      question: "What should the audience do next?",
      defaultAnswer: draft.cta || "pre-order now",
    },
  ];
  return base;
}

function estimateGenerationCostUsdc(draft: CampaignDraft): number {
  if (draft.useVideo) return draft.budgetUsdc >= 25 ? 0.18 : 0.0;
  if (draft.productImage) return 0.01;
  if (draft.budgetUsdc <= 2) return 0.02;
  if (draft.budgetUsdc <= 15) return 0.04;
  return 0.08;
}

function scaleFee(budgetUsdc: number, ratio: number, min: number, max: number): number {
  return roundMoney(clamp(budgetUsdc * ratio, min, max));
}

function baseProposals(draft: CampaignDraft): Proposal[] {
  const generationCost = estimateGenerationCostUsdc(draft);
  const strategyFee = scaleFee(draft.budgetUsdc, 0.08, 0.03, draft.budgetUsdc * 0.18);
  const copyFee = scaleFee(draft.budgetUsdc, 0.06, 0.02, draft.budgetUsdc * 0.16);
  const designerFee = scaleFee(draft.budgetUsdc, draft.productImage ? 0.03 : 0.09, 0.02, draft.budgetUsdc * 0.2);
  const mediaFee = scaleFee(draft.budgetUsdc, 0.07, 0.03, draft.budgetUsdc * 0.18);

  const assetPath = draft.productImage ? "use your photo" : draft.useVideo ? "hero image + video" : "generate 1 image";

  return [
    {
      agent: "strategist",
      title: "Positioning",
      workDescription: "Find the campaign angle, audience wedge, and channel focus.",
      feeUsdc: strategyFee,
      status: "proposed",
      meta: { deliverable: "positioning brief" },
    },
    {
      agent: "copywriter",
      title: "Copy",
      workDescription: "Write headlines, CTA lines, and a tight campaign hook.",
      feeUsdc: copyFee,
      status: "proposed",
      meta: { deliverable: "headlines" },
    },
    {
      agent: "designer",
      title: "Creative",
      workDescription: `Create the hero creative and ${draft.useVideo ? "queue an optional video" : "ship a single static ad"}.`,
      feeUsdc: designerFee,
      status: "proposed",
      meta: { mode: draft.productImage ? "uploaded" : "generated", genCostUsdc: generationCost, assetPath },
    },
    {
      agent: "mediabuyer",
      title: "Distribution",
      workDescription: "Allocate the remaining budget across placements and simulate the buy flow.",
      feeUsdc: mediaFee,
      status: "proposed",
      meta: {
        estimatedPlacements: Math.max(
          6,
          Math.min(
            CONFIG.AD_BUY_COUNT,
            Math.floor((draft.budgetUsdc - (strategyFee + copyFee + designerFee + mediaFee) - generationCost) / CONFIG.AVG_PLACEMENT_USDC),
          ),
        ),
      },
    },
  ];
}

function budgetCheck(draft: CampaignDraft, proposals: Proposal[]): { acceptedFeesUsdc: number; estimatedGenerationCostUsdc: number; projectedAdSpendUsdc: number; ok: boolean; neededUsdc: number } {
  const acceptedFeesUsdc = roundMoney(proposals.reduce((sum, proposal) => sum + proposal.feeUsdc, 0));
  const estimatedGenerationCostUsdc = roundMoney(estimateGenerationCostUsdc(draft));
  const projectedAdSpendUsdc = roundMoney(draft.budgetUsdc - acceptedFeesUsdc - estimatedGenerationCostUsdc);
  const neededUsdc = roundMoney(acceptedFeesUsdc + estimatedGenerationCostUsdc + CONFIG.MIN_AD_SPEND_USDC);
  return {
    acceptedFeesUsdc,
    estimatedGenerationCostUsdc,
    projectedAdSpendUsdc,
    ok: projectedAdSpendUsdc >= CONFIG.MIN_AD_SPEND_USDC,
    neededUsdc,
  };
}

async function makeShortCopy(draft: CampaignDraft, proposals: Proposal[]): Promise<string[]> {
  const prompt = `Write 3 punchy ad headlines for: ${draft.brief}. Audience: ${draft.audience}. CTA: ${draft.cta}. Return JSON array of strings only.`;
  const json = await maybeGenerateJson<string[]>(prompt);
  if (json?.length) return json.slice(0, 3).map((item) => String(item).slice(0, 80));
  return [
    `${draft.brief.slice(0, 42)} for ${draft.audience}`,
    `Pre-order now for ${draft.cta}`,
    `Built for ${draft.audience} who want more speed`,
  ];
}

function makeCreativeDataUrl(draft: CampaignDraft, headline: string): string {
  const text = headline.slice(0, 45);
  const body = draft.brief.slice(0, 90);
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
    <defs>
      <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="#11192c"/>
        <stop offset="100%" stop-color="#0b1020"/>
      </linearGradient>
      <linearGradient id="accent" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stop-color="#f0b562"/>
        <stop offset="100%" stop-color="#54d8a0"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="800" fill="url(#g)"/>
    <circle cx="930" cy="160" r="210" fill="rgba(240,181,98,0.14)"/>
    <circle cx="180" cy="660" r="280" fill="rgba(84,216,160,0.1)"/>
    <rect x="88" y="88" width="152" height="28" rx="14" fill="url(#accent)"/>
    <text x="88" y="170" fill="#eef3ff" font-family="Space Grotesk, Arial, sans-serif" font-size="66" font-weight="700">${escapeXml(text)}</text>
    <text x="88" y="248" fill="#95a4ca" font-family="IBM Plex Mono, Consolas, monospace" font-size="30">${escapeXml(body)}</text>
    <rect x="88" y="566" width="430" height="118" rx="22" fill="rgba(255,255,255,0.05)" stroke="rgba(170,188,226,0.2)"/>
    <text x="120" y="616" fill="#f0b562" font-family="IBM Plex Mono, Consolas, monospace" font-size="28">campaign live</text>
    <text x="120" y="656" fill="#eef3ff" font-family="Space Grotesk, Arial, sans-serif" font-size="34" font-weight="600">${escapeXml(draft.cta)}</text>
    <rect x="668" y="520" width="382" height="150" rx="24" fill="rgba(255,255,255,0.05)" stroke="rgba(170,188,226,0.18)"/>
    <text x="706" y="576" fill="#95a4ca" font-family="IBM Plex Mono, Consolas, monospace" font-size="24">budget</text>
    <text x="706" y="624" fill="#eef3ff" font-family="IBM Plex Mono, Consolas, monospace" font-size="52" font-weight="700">$${draft.budgetUsdc.toFixed(2)}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return char;
    }
  });
}

function buildCampaignVideoPrompt(draft: CampaignDraft, headline: string): string {
  return [
    "Create a punchy, high-energy 4-second 16:9 paid social video advertisement with a cinematic, premium commercial look.",
    `Product / campaign: ${draft.brief}.`,
    `Target audience: ${draft.audience}.`,
    `On-screen hook to evoke: ${headline}.`,
    `Desired call-to-action feeling: ${draft.cta}.`,
    "Structure: open on a bold, scroll-stopping hero shot of the product in the very first frame; add smooth dynamic camera motion (a subtle push-in or orbit) with satisfying product-focused beats; land on a clean, confident closing frame that leaves negative space for a CTA overlay.",
    "Look and feel: modern startup-quality commercial, rich dramatic lighting, strong color contrast, crisp focus, glossy premium textures, and energetic pacing tuned to the audience.",
    "Constraints: no real identifiable people, no copyrighted characters or mascots, no third-party brand logos, and do not render paragraphs of on-screen text or garbled lettering.",
  ].join(" ");
}

function toArtifactStatus(status: string): Artifact["status"] {
  if (status === "completed") return "ready";
  if (status === "failed" || status === "canceled") return "failed";
  if (status === "in_progress") return "generating";
  return "queued";
}

function videoStatusUrl(videoId: string): string {
  return `/api/experimental/video?videoId=${encodeURIComponent(videoId)}`;
}

function videoDownloadUrl(videoId: string): string {
  return `/api/experimental/video?videoId=${encodeURIComponent(videoId)}&download=1&variant=video`;
}

async function createVideoArtifact(runId: string, draft: CampaignDraft, headline: string): Promise<Artifact> {
  const prompt = buildCampaignVideoPrompt(draft, headline);
  const baseArtifact: Artifact = {
    id: generateId(`${runId}_video`),
    type: "video",
    producer: "designer",
    version: 1,
    title: "Video ad",
    previewText: "Video generation queued. This stays non-blocking so campaign launch can finish.",
    status: "queued",
    metadata: {
      provider: "openai-videos",
      enabled: EXPERIMENTAL_OPENAI_VIDEO_CONFIG.enabled,
      model: EXPERIMENTAL_OPENAI_VIDEO_CONFIG.defaultModel,
      seconds: "4",
      durationSec: 4,
      size: "1280x720",
      aspectRatio: "16:9",
      prompt,
    },
  };

  if (!EXPERIMENTAL_OPENAI_VIDEO_CONFIG.enabled) {
    return {
      ...baseArtifact,
      metadata: {
        ...baseArtifact.metadata,
        provider: CONFIG.VIDEO_PROVIDER,
        status: "disabled",
        note: "Set OPENAI_EXPERIMENTAL_VIDEO_ENABLED=true to create a live OpenAI video job during launch.",
      },
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const video = await createExperimentalVideo(
      {
        prompt,
        model: EXPERIMENTAL_OPENAI_VIDEO_CONFIG.defaultModel,
        seconds: "4",
        size: "1280x720",
      },
      { signal: controller.signal },
    );
    const statusUrl = videoStatusUrl(video.id);
    const downloadUrl = videoDownloadUrl(video.id);

    return {
      ...baseArtifact,
      storageUrl: video.status === "completed" ? downloadUrl : undefined,
      previewText:
        video.status === "completed"
          ? "OpenAI video render completed. Download URL is attached."
          : `OpenAI video job ${video.id} is ${video.status}. Poll the status URL for the finished MP4.`,
      status: toArtifactStatus(video.status),
      metadata: {
        ...baseArtifact.metadata,
        status: video.status,
        openaiVideoId: video.id,
        statusUrl,
        pollUrl: statusUrl,
        downloadUrl,
        mimeType: "video/mp4",
        progress: video.progress,
        createdAt: video.created_at,
        upstream: video,
      },
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      ...baseArtifact,
      status: "queued",
      previewText: timedOut
        ? "Video job creation timed out locally. Launch completed; retry the isolated video route if needed."
        : "Video job creation failed. Launch completed without blocking.",
      metadata: {
        ...baseArtifact.metadata,
        status: timedOut ? "create_timeout" : "create_failed",
        error: error instanceof Error ? error.message : "Unknown video generation error.",
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function mergeArtifact(artifacts: Artifact[], artifact: Artifact): void {
  const index = artifacts.findIndex((entry) => entry.id === artifact.id);
  if (index >= 0) {
    artifacts[index] = artifact;
    return;
  }
  artifacts.push(artifact);
}

function buildArtifacts(runId: string, draft: CampaignDraft, proposals: Proposal[]): Artifact[] {
  const strategy = proposals.find((p) => p.agent === "strategist");
  const copy = proposals.find((p) => p.agent === "copywriter");
  const designer = proposals.find((p) => p.agent === "designer");
  const copyHeadline = `${draft.brief.slice(0, 44)}.`;
  return [
    { id: generateId(`${runId}_brief`), type: "brief", producer: "client", version: 1, title: "Campaign brief", previewText: draft.brief, status: "ready" },
    { id: generateId(`${runId}_strategy`), type: "strategy", producer: "strategist", version: 1, title: "Positioning brief", previewText: strategy?.workDescription ?? "Position the offer, audience, and channel.", status: "ready" },
    { id: generateId(`${runId}_copy`), type: "copy", producer: "copywriter", version: 1, title: "Headline set", previewText: copy?.workDescription ?? "Three tight headlines and a CTA line.", status: "ready" },
    { id: generateId(`${runId}_image`), type: "image", producer: "designer", version: 1, title: "Hero creative", storageUrl: draft.productImage || makeCreativeDataUrl(draft, copyHeadline), previewText: copyHeadline, status: "ready" },
    { id: generateId(`${runId}_placement`), type: "placement_plan", producer: "mediabuyer", version: 1, title: "Placement plan", previewText: "Cycle through the publisher list until the remaining spend is exhausted.", status: "ready" },
    { id: generateId(`${runId}_report`), type: "campaign_report", producer: "client", version: 1, title: "Campaign report", previewText: "Audit trail, spend summary, and confirmations.", status: "ready" },
    ...(draft.useVideo
      ? ([{ id: generateId(`${runId}_video`), type: "video" as const, producer: "designer", version: 1, title: "Video ad", previewText: "Queued for asynchronous generation.", status: "queued" as const }] as Artifact[])
      : []),
  ];
}

export async function buildCampaignPlan(draft: CampaignDraft): Promise<PlanResult> {
  const runId = generateId("run");
  const questions = questionSet(draft);
  const proposals = baseProposals(draft);
  const budget = budgetCheck(draft, proposals);
  const wallets = createWalletSet(draft.mode);
  const artifacts = buildArtifacts(runId, draft, proposals);
  return {
    runId,
    questions,
    proposalPack: {
      wallets,
      proposals,
      artifacts,
      budgetCheck: budget,
    },
  };
}

export async function executeCampaign(input: {
  runId: string;
  draft: CampaignDraft;
  questions: Question[];
  wallets: WalletState[];
  proposals: Proposal[];
  accepted: Record<string, boolean>;
  emit: (event: CampaignEvent) => Promise<void> | void;
}): Promise<RunSummary> {
  const provider = createPaymentProvider(input.draft.mode);
  const acceptedProposals = input.proposals.filter((proposal) => input.accepted[proposal.agent]);
  const budget = budgetCheck(input.draft, acceptedProposals);
  const allArtifacts = buildArtifacts(input.runId, input.draft, input.proposals);
  const emitArtifact = async (artifact: Artifact) => {
    mergeArtifact(allArtifacts, artifact);
    await input.emit({ type: "artifact", artifact });
  };

  await input.emit({
    type: "budget_check",
    feesUsdc: budget.acceptedFeesUsdc,
    generationCostUsdc: budget.estimatedGenerationCostUsdc,
    adSpendUsdc: budget.projectedAdSpendUsdc,
    ok: budget.ok,
  });
  if (!budget.ok) {
    const message = `This campaign needs about ${budget.neededUsdc.toFixed(2)} USDC to run well. Add funds or drop an agent to proceed.`;
    await input.emit({
      type: "budget_insufficient",
      neededUsdc: budget.neededUsdc,
      budgetUsdc: input.draft.budgetUsdc,
      message,
    });
    failRun(input.runId, message);
    return {
      feesUsdc: 0,
      generationCostUsdc: 0,
      adSpendUsdc: 0,
      placements: 0,
      txCount: 0,
      totalSpentUsdc: 0,
    };
  }

  let totalTxCount = 0;
  let feesSpent = 0;
  let generationCost = roundMoney(estimateGenerationCostUsdc(input.draft));
  let adSpendRemaining = roundMoney(input.draft.budgetUsdc - budget.acceptedFeesUsdc - generationCost);
  let placements = 0;

  await input.emit({
    type: "deposit",
    amountUsdc: input.draft.budgetUsdc,
    treasuryBalanceUsdc: input.draft.budgetUsdc,
    txHash: input.draft.mode === "mock" ? randomHex(32) : undefined,
    explorerUrl: input.draft.mode === "mock" ? `${CONFIG.EXPLORER_BASE}/tx/${randomHex(32)}` : undefined,
  });

  for (const proposal of input.proposals) {
    const accepted = Boolean(input.accepted[proposal.agent]);
    await input.emit({
      type: "proposal_decision",
      agent: proposal.agent,
      decision: accepted ? "accepted" : "rejected",
    });
  }

  for (const proposal of acceptedProposals) {
    const wallet = input.wallets.find((entry) => entry.id === proposal.agent);
    if (!wallet) continue;
    const paymentId = generateId("pay");
    await input.emit({ type: "agent_status", agent: proposal.agent, status: "working" });
    await input.emit({ type: "reasoning", agent: proposal.agent, text: proposal.workDescription });
    const payment = await provider.pay("treasury", wallet.address, proposal.feeUsdc, proposal.title);
    totalTxCount += 1;
    feesSpent = roundMoney(feesSpent + proposal.feeUsdc);
    await input.emit({
      type: "payment",
      id: paymentId,
      kind: "fee",
      fromLabel: "Agency Treasury",
      toLabel: getLabel(proposal.agent),
      amountUsdc: proposal.feeUsdc,
      txHash: payment.txHash,
      explorerUrl: payment.explorerUrl,
      status: "pending",
    });
    const confirmation = await provider.confirm(payment.txHash);
    wallet.balanceUsdc = roundMoney(wallet.balanceUsdc + proposal.feeUsdc);
    wallet.status = "paid";
    await input.emit({
      type: "payment_update",
      id: paymentId,
      status: confirmation.status,
      blockNumber: confirmation.blockNumber,
    });
    await input.emit({ type: "agent_status", agent: proposal.agent, status: "done" });
  }

  const strategyProposal = acceptedProposals.find((proposal) => proposal.agent === "strategist");
  const copyProposal = acceptedProposals.find((proposal) => proposal.agent === "copywriter");
  const designerProposal = acceptedProposals.find((proposal) => proposal.agent === "designer");
  const mediaProposal = acceptedProposals.find((proposal) => proposal.agent === "mediabuyer");

  const copyLines = await makeShortCopy(input.draft, input.proposals);
  const creativeHeadline = copyLines[0] ?? input.draft.brief.slice(0, 60);
  let creativeUrl = input.draft.productImage || "";
  let creativeMetadata: Record<string, unknown> = {
    source: input.draft.productImage ? "uploaded" : "fallback-svg",
  };

  if (designerProposal) {
    const designerWallet = input.wallets.find((entry) => entry.id === "designer");
    if (designerWallet) {
      await input.emit({ type: "generation", agent: "designer", tier: input.draft.useVideo ? "video" : "cheap", realCostUsd: generationCost, status: "generating" });
      if (!creativeUrl) {
        const generated = await maybeGenerateCampaignImage(input.draft, creativeHeadline);
        if (generated) {
          creativeUrl = generated.dataUrl;
          creativeMetadata = {
            source: "openai-image",
            model: generated.model,
            prompt: generated.prompt,
          };
        }
      }
      if (!creativeUrl) {
        creativeUrl = makeCreativeDataUrl(input.draft, creativeHeadline);
      }
      await input.emit({
        type: "creative",
        url: creativeUrl,
        headline: creativeHeadline,
        fallback: creativeMetadata.source !== "openai-image" && !input.draft.productImage,
      });
      await input.emit({ type: "generation", agent: "designer", tier: input.draft.useVideo ? "video" : "cheap", realCostUsd: generationCost, status: "done" });
      await emitArtifact({
          id: generateId(`${input.runId}_image`),
          type: "image",
          producer: "designer",
          version: 1,
          title: "Hero creative",
          storageUrl: creativeUrl,
          previewText: creativeHeadline,
          status: "ready",
          metadata: creativeMetadata,
      });
    }
  } else {
    if (!creativeUrl) {
      creativeUrl = makeCreativeDataUrl(input.draft, creativeHeadline);
    }
    await input.emit({ type: "creative", url: creativeUrl, headline: creativeHeadline, fallback: true });
  }

  if (input.draft.useVideo) {
    await emitArtifact(await createVideoArtifact(input.runId, input.draft, creativeHeadline));
  }

  if (mediaProposal) {
    const placementsTarget = Math.max(8, Math.min(CONFIG.AD_BUY_COUNT, Math.floor(adSpendRemaining / CONFIG.AVG_PLACEMENT_USDC)));
    const budgetSlots = [...PUBLISHER_SLOTS];
    await input.emit({ type: "agent_status", agent: "mediabuyer", status: "working" });

    for (let index = 0; index < placementsTarget && adSpendRemaining > 0.01; index += 1) {
      const slot = budgetSlots[index % budgetSlots.length];
      const price = roundMoney(slot.priceUsdc);
      if (price > adSpendRemaining) break;
      const paymentId = generateId("pay");
      const payment = await provider.pay("treasury", slot.address, price, slot.name);
      totalTxCount += 1;
      placements += 1;
      adSpendRemaining = roundMoney(adSpendRemaining - price);
      await input.emit({
        type: "payment",
        id: paymentId,
        kind: "adbuy",
        fromLabel: "Agency Treasury",
        toLabel: slot.name,
        amountUsdc: price,
        txHash: payment.txHash,
        explorerUrl: payment.explorerUrl,
        status: "pending",
      });
      await input.emit({
        type: "placement",
        slotId: slot.id,
        publisher: slot.name,
        priceUsdc: price,
      });
      await input.emit({
        type: "budget_update",
        spentUsdc: roundMoney(input.draft.budgetUsdc - adSpendRemaining),
        remainingUsdc: adSpendRemaining,
      });
      const confirmation = await provider.confirm(payment.txHash);
      await input.emit({
        type: "payment_update",
        id: paymentId,
        status: confirmation.status,
        blockNumber: confirmation.blockNumber,
      });
      await sleep(CONFIG.SEND_DELAY_MS);
      if (index % 5 === 4) {
          await emitArtifact({
              id: generateId(`${input.runId}_report_${index}`),
              type: "placement_plan",
              producer: "mediabuyer",
            version: 1,
              title: `Placement wave ${Math.floor(index / 5) + 1}`,
              previewText: `${placements} placements live so far.`,
              status: "ready",
          });
        }
    }

    await input.emit({ type: "agent_status", agent: "mediabuyer", status: "done" });
  }

  const summary: RunSummary = {
    feesUsdc: roundMoney(feesSpent),
    generationCostUsdc: roundMoney(generationCost),
    adSpendUsdc: roundMoney(input.draft.budgetUsdc - feesSpent - generationCost - adSpendRemaining),
    placements,
    txCount: totalTxCount,
    totalSpentUsdc: roundMoney(input.draft.budgetUsdc - adSpendRemaining),
  };

  await input.emit({
    type: "summary",
    ...summary,
  });
  completeRun(input.runId, summary, allArtifacts);
  return summary;
}

export function createBasePlan(draft: CampaignDraft): Promise<PlanResult> {
  return buildCampaignPlan(draft);
}

export async function runCampaignWithStore(input: {
  draft: CampaignDraft;
  questions: Question[];
  proposals: Proposal[];
  wallets: WalletState[];
  accepted: Record<string, boolean>;
  onEvent: (event: CampaignEvent) => Promise<void> | void;
}): Promise<{ runId: string; summary: RunSummary }> {
  const runId = generateId("run");
  const artifacts = buildArtifacts(runId, input.draft, input.proposals);
  const record = createRunRecord({
    mode: input.draft.mode,
    draft: input.draft,
    questions: input.questions,
    proposals: input.proposals,
    wallets: input.wallets,
    artifacts,
  });
  try {
    const summary = await executeCampaign({
      runId: record.id,
      draft: input.draft,
      questions: input.questions,
      proposals: input.proposals,
      wallets: input.wallets,
      accepted: input.accepted,
      emit: async (event) => {
        appendEvent(record.id, event);
        await input.onEvent(event);
      },
    });
    return { runId: record.id, summary };
  } catch (error) {
    failRun(record.id, error instanceof Error ? error.message : "Unknown campaign error");
    throw error;
  }
}
