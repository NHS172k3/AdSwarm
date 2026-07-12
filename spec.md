# AdSwarm Hackathon Build Spec

Version: 1.0
Date: 2026-07-12
Source: `PRD-autonomous-ad-agency-v3-agents.md`

Note: no `requirements.md` file is present in this workspace. This spec treats the current PRD as the requirements source and compresses it into a 5-hour implementation contract.

## 1. Product Definition

AdSwarm is a single-page, demo-first AI ad agency. A founder enters a product brief and campaign budget. A Client Agent asks 2-3 clarifying questions, then four specialist agents propose their own fees and scopes. The user accepts or rejects those proposals. Accepted agents get paid from the campaign budget, create campaign outputs, and the Media Buyer spends the remaining budget buying mock ad placements through a payment-style flow.

The demo must make three things obvious within 60 seconds:

1. AI agents are acting like an agency workforce.
2. Each specialist prices itself before work starts.
3. Money visibly moves through payroll and ad buys with a live transaction tape, draining budget gauge, and final audit summary.

## 2. Time-Boxed Delivery Strategy

The remaining hackathon time is short, but the product should still feel ambitious. Do not pre-cut features just because they are stretchy. Instead, build demo-visible versions first, backed by mocks or fallbacks where needed, then deepen the implementation if time remains.

The rule: if a feature materially improves the judge's perception and can be represented safely in the UI within 5 hours, keep it in the demo. The backend can be progressive:

- Demo-visible first: panel, state, event, and believable interaction.
- Real implementation second: live API, database, chain, or provider.
- Fallback always: if the real path fails, the demo still completes.

Priority order:

1. P0: Working mock-mode demo from intake to summary.
2. P0: Live mission-control UI with transaction tape, budget gauge, agent wallet cards, creative panel, and ad-slot grid.
3. P0: PaymentProvider abstraction, so mock and on-chain modes have the same event shape.
4. P0.5: Demo-visible audit log, creative artifact list, and 402-style publisher flow, even if backed by in-memory data.
5. P1: OpenAI-powered proposals/copy and cheap image generation with timeout fallback.
6. P1: Supabase audit persistence if credentials/setup are available.
7. P1.5: `onchain-single` Base Sepolia transfers after mock mode is stable.
8. P2: Async video generation toggle and artifact lifecycle if the hero flow is already reliable.
9. P3: Real x402 SDK/facilitator integration and sovereign per-agent sending.

Scope discipline if time slips:

1. Keep the feature visible, but switch its backing implementation to a safe fallback.
2. For on-chain: keep `PAYMENT_MODE` and explorer-link UI, but demo `mock` if funding/RPC is unstable.
3. For image generation: keep the creative workflow, but fall back to a polished generated-style creative.
4. For Supabase: keep the audit tab, but back it with the in-memory run log if credentials are not ready.
5. For video: keep the toggle and artifact slot if easy, but mark generation as queued or disabled unless provider setup is ready.
6. Never cut the transaction tape, budget gauge, agent proposals, audit/ledger surface, or final summary.

## 3. Demo Acceptance Path

Primary judge flow:

1. User opens the app and sees a polished financial operations console.
2. User enters: `A new energy drink for late-night gamers`.
3. Client Agent asks for budget, audience, and CTA.
4. User answers:
   - Budget: `$1` for reliability test or `$50` for showcase run.
   - Audience: `competitive gamers`.
   - CTA: `pre-order now`.
5. Fund Wallet panel shows the Treasury funded in mock mode.
6. Specialist proposals appear together:
   - Strategist: market angle and targeting.
   - Copywriter: headlines and CTA copy.
   - Designer: hero image or uploaded-photo creative path.
   - Media Buyer: placement plan sized to remaining budget.
7. User clicks `Approve & run`.
8. Fee payments enter the transaction tape as pending, then confirm.
9. Agents stream outputs: strategy, headlines, creative.
10. Media Buyer launches the ad-buy storm:
    - Budget gauge drains.
    - Ad-slot grid cells light up.
    - Transaction chips flip from pending to confirmed.
11. Summary card appears:
    - Fees paid.
    - Generation cost.
    - Ad spend.
    - Placement count.
    - Transaction count.
12. User opens audit/log view or clicks a transaction link.

Target runtime: under 60 seconds from approval to summary.

## 4. Functional Requirements

### 4.1 Modes

The app must support one master environment switch:

```ts
PAYMENT_MODE = "mock" | "onchain-single" | "onchain-sovereign"
```

`mock` is the required reliable mode. `onchain-single` should still be scaffolded behind the same interface so the team can attempt the real-chain flip without reshaping the app. `onchain-sovereign` may be present as a stub that throws a clear unsupported/funding-required error.

Demo expectation:

- The UI should always show the payment mode, treasury address, transaction hashes, and explorer-link affordance.
- In `mock`, hashes are realistic and links can point to a local/fake explorer view or be clearly marked as mock.
- In `onchain-single`, hashes must point to real Base Sepolia explorer pages.

### 4.2 Agent Model

Create five agent identities at startup:

```ts
type AgentId = "client" | "strategist" | "copywriter" | "designer" | "mediabuyer";
```

Each agent must have:

- Stable label.
- Realistic wallet address.
- Live balance in USDC.
- `funded` flag.
- `canSend` flag.
- Status: idle, proposed, working, paid, done, skipped, or failed.

In mock mode, generated addresses are acceptable. In on-chain mode, addresses must be real `0x` addresses and the Treasury is the only funded sender for `onchain-single`.

### 4.3 Intake

The intake UI must collect:

- Product brief.
- Budget.
- Target audience.
- Primary call-to-action.
- Optional product image upload.
- Optional creative output selection:
  - Hero image: default on.
  - Short video: off by default.

The Client Agent should ask 2-3 short questions inline. Prefer OpenAI-generated phrasing for polish, but keep deterministic defaults so the demo works without waiting on the model.

### 4.4 Proposals and Negotiation

After intake, the four specialists produce proposals in parallel or near-parallel. Each proposal must include:

- Agent name.
- Plain-language work description.
- Fee in USDC.
- Optional metadata, such as generation tier or estimated placement count.
- Accept/reject state.

Negotiation is exactly one round:

- User can accept/reject each specialist.
- Media Buyer should remain required unless explicitly implementing graceful no-media mode.
- No counter-offers.
- Show live budget math before execution.

Budget guard:

```ts
acceptedFees = sum(accepted proposal fees)
generationCost = accepted designer generation cost, or 0
adSpend = budgetUsdc - acceptedFees - generationCost
minMeaningfulSpend = CONFIG.MIN_AD_SPEND_USDC
```

If `adSpend < minMeaningfulSpend`, do not pay fees and do not buy ads. Show:

`This campaign needs about ${acceptedFees + minMeaningfulSpend} USDC to run well. Add funds or drop an agent to proceed.`

### 4.5 Execution

Execution must happen only after the budget guard passes.

Required sequence:

1. Pay accepted specialist fees through `PaymentProvider`.
2. Update agent balances as fee payments confirm.
3. Produce strategy output.
4. Produce copy output.
5. Produce hero creative or fallback placeholder.
6. Buy placements until remaining ad spend is exhausted or the placement cap is reached.
7. Emit summary.

Rejected agents degrade gracefully:

- No Strategist: use generic gaming targeting.
- No Copywriter: use product name plus CTA.
- No Designer: use uploaded image or text-only creative card.
- No Media Buyer: avoid for MVP; the storm is the demo centerpiece.

### 4.6 PaymentProvider

All payments must go through one interface:

```ts
type PayResult = {
  txHash: string;
  explorerUrl: string;
  status: "pending";
};

interface PaymentProvider {
  pay(
    from: AgentId | "treasury",
    toAddress: string,
    amountUsdc: number,
    memo: string
  ): Promise<PayResult>;
}
```

Mock provider requirements:

- Generate realistic fake transaction hashes.
- Emit `payment` event immediately with `pending`.
- Emit `payment_update` with `confirmed` after a short delay.
- Update in-memory balances and ledger.
- Use the same event shape planned for on-chain mode.

On-chain provider stretch requirements:

- Use `viem` ERC-20 USDC transfers on Base Sepolia.
- Treasury is the only funded sender in `onchain-single`.
- Do not await confirmations serially.
- Poll receipts in background and emit confirmation events.
- Every transaction link must open on `https://sepolia.basescan.org`.
- Verify current USDC address and faucet/RPC details before hardcoding.

### 4.7 Mock Publishers

Implement a publisher config with about 8 slots:

- TwitchSide Banner: 0.05 USDC.
- GamerForum Sidebar: 0.03 USDC.
- YT Pre-roll Slot: 0.08 USDC.
- Discord Server Promo: 0.02 USDC.
- r/Gaming Promoted: 0.06 USDC.
- Esports Livestream L3: 0.09 USDC.
- Mobile Game Interstitial: 0.04 USDC.
- GG Newsletter Slot: 0.03 USDC.

The Media Buyer cycles through these slots until it reaches budget or `AD_BUY_COUNT`.

Route target:

```txt
GET /api/publishers/[slot]
```

MVP behavior:

- First call without payment proof returns a 402-style response.
- PaymentProvider creates a payment.
- Retry with payment proof returns 200 and placement data.

For mock mode, proof can be the fake transaction id in memory.

### 4.8 Creatives

The MVP must show a hero image panel and an artifact strip/list. Even if only one artifact is real, the product should feel like agents are producing reusable campaign assets.

Acceptable paths:

1. Uploaded product image reused in an ad-like frame.
2. OpenAI-generated image via `GenerationProvider`.
3. Timeout fallback: polished headline-over-visual placeholder.

Generation must never block the campaign indefinitely. Use a timeout and continue to summary even if generation fails.

Track real generation cost separately from testnet campaign spend:

- Agent fees and placements: campaign economy, USDC.
- Image/video API cost: real API cost, shown separately.

Video is optional/stretch:

- The intake should include a video toggle if it can be added cheaply.
- Disabled by default unless provider credentials are ready.
- If enabled, run asynchronously.
- Campaign completion must not wait on video.
- If generation is not wired, show a queued/disabled video artifact state rather than removing the feature from the product story.

Artifact model for the demo:

```ts
type ArtifactType = "brief" | "strategy" | "copy" | "image" | "video" | "placement_plan" | "campaign_report";

type Artifact = {
  id: string;
  type: ArtifactType;
  producer: AgentId;
  version: number;
  title: string;
  storageUrl?: string;
  previewText?: string;
  status: "ready" | "generating" | "queued" | "failed";
  metadata?: Record<string, unknown>;
};
```

At minimum, create in-memory artifacts for brief, strategy, copy, image/fallback image, placement plan, and campaign report.

### 4.9 Events

The UI must be event-driven. SSE is preferred; polling an in-memory run log is acceptable if SSE costs too much time.

Required event types:

```ts
type Event =
  | { type: "clarify_question"; id: string; question: string; kind: "budget" | "audience" | "cta" | "upload" }
  | { type: "clarify_answer"; id: string; answer: string }
  | { type: "deposit"; amountUsdc: number; txHash?: string; explorerUrl?: string; treasuryBalanceUsdc: number }
  | { type: "proposal"; agent: AgentId; workDescription: string; feeUsdc: number; meta?: unknown }
  | { type: "proposal_decision"; agent: AgentId; decision: "accepted" | "rejected" }
  | { type: "budget_check"; feesUsdc: number; generationCostUsdc: number; adSpendUsdc: number; ok: boolean }
  | { type: "budget_insufficient"; neededUsdc: number; budgetUsdc: number; message: string }
  | { type: "agent_status"; agent: AgentId; status: string }
  | { type: "reasoning"; agent: AgentId; text: string }
  | { type: "generation"; agent: "designer"; tier: string; realCostUsd: number; status: "generating" | "done" | "failed" }
  | { type: "creative"; url?: string; headline: string; fallback?: boolean }
  | { type: "payment"; id: string; kind: "deposit" | "fee" | "adbuy"; fromLabel: string; toLabel: string; amountUsdc: number; txHash: string; explorerUrl: string; status: "pending" }
  | { type: "payment_update"; id: string; status: "confirmed" | "failed"; blockNumber?: number }
  | { type: "placement"; slotId: string; publisher: string; priceUsdc: number }
  | { type: "budget_update"; spentUsdc: number; remainingUsdc: number }
  | { type: "summary"; feesUsdc: number; generationCostUsdc: number; adSpendUsdc: number; placements: number; txCount: number };
```

### 4.10 Persistence and Audit

The audit surface is required for the demo. Supabase persistence is P1, but an in-memory audit tab/drawer is P0.

If implemented, use server-side writes only and never block the run while waiting for Supabase.

Minimum tables:

- `campaigns`
- `agents`
- `payments`
- `placements`
- `artifacts` if artifact persistence is implemented

Audit tab MVP:

- List recent campaigns.
- Show selected campaign payments.
- Show aggregate spend, placement count, and confirmation rate.
- If Supabase is not configured, show in-memory last-run audit instead of failing.

Supabase upgrade:

- Use the same audit adapter shape as the in-memory implementation.
- Write campaigns, agents, payments, placements, and artifacts fire-and-forget.
- If Supabase fails, keep the audit UI populated from memory and surface a small non-blocking warning.

### 4.11 Configuration

Create a single config module:

```ts
export const CONFIG = {
  PAYMENT_MODE: process.env.PAYMENT_MODE ?? "mock",
  DEFAULT_BUDGET_USDC: 50,
  MIN_CAMPAIGN_BUDGET_USDC: 0.5,
  MIN_AD_SPEND_USDC: 0.10,
  AD_BUY_COUNT: 30,
  AVG_PLACEMENT_USDC: 0.035,
  FEE_RANGE_FRACTION: { min: 0.03, max: 0.15 },
  GENERATION: {
    DEFAULT_TIER: "cheap",
    TIMEOUT_MS: 20000,
    VIDEO_MIN_BUDGET_USDC: 25
  },
  CHAIN: "base-sepolia",
  CHAIN_ID: 84532,
  RPC_URL: process.env.RPC_URL,
  USDC_ADDRESS: process.env.USDC_ADDRESS,
  TREASURY_ADDRESS: process.env.TREASURY_ADDRESS,
  EXPLORER_BASE: "https://sepolia.basescan.org",
  SEND_DELAY_MS: 100,
  MOCK_CONFIRM_DELAY_MS: 400
};
```

Avoid duplicate config keys. The PRD contains conflicting video timeout values; use one timeout per provider.

## 5. UI Specification

Visual direction: financial operations console for an AI company. It should feel like a trading desk plus block explorer, not a generic chatbot or landing page.

Required screens:

1. Intake.
2. Negotiation.
3. Live console.
4. Summary.
5. Audit log tab or drawer.

Core layout:

- Header: product name, payment mode, treasury address, treasury balance.
- Left rail: agent wallet cards with status, address, and balance.
- Center/right: budget gauge and transaction tape.
- Bottom/side: creative preview and ad-slot grid.
- Summary area after completion.

Design constraints:

- Use a deep console palette with warm amber only for money/gauge emphasis.
- Use small radii around 6-8px.
- Use monospace for balances, amounts, and hashes.
- Reserve tape space so incoming transactions do not shift layout.
- Animate deliberately:
  - Payment chips enter.
  - Pending flips to confirmed.
  - Budget gauge drains.
  - Ad slots light up.
- Respect `prefers-reduced-motion`.
- Must look good on laptop dimensions; mobile can be usable but desktop demo matters most.
- No marketing landing page before the product surface.

Essential microcopy:

- Primary action: `Launch campaign`.
- Completion: `Campaign live`.
- Closing summary: `Every placement is a receipt. Verify any of them on-chain.`

## 6. Suggested File/Module Structure

If scaffolding from scratch, use a single Next.js app:

```txt
app/
  page.tsx
  api/
    launch/route.ts
    runs/[runId]/events/route.ts
    runs/[runId]/decision/route.ts
    publishers/[slot]/route.ts
components/
  IntakePanel.tsx
  NegotiationPanel.tsx
  MissionControl.tsx
  AgentWalletCard.tsx
  BudgetGauge.tsx
  TransactionTape.tsx
  CreativePanel.tsx
  AdSlotGrid.tsx
  AuditLog.tsx
lib/
  agents/
    pipeline.ts
    prompts.ts
    types.ts
  payments/
    provider.ts
    mock.ts
    onchain-single.ts
  publishers.ts
  generation/
    provider.ts
    openai.ts
    fallback.ts
  events.ts
  config.ts
  audit.ts
supabase/
  migrations/
```

If using a monorepo scaffold, keep all secrets and server-only payment/generation logic out of client components.

## 7. Implementation Plan for the Next 5 Hours

### Hour 0-1: Skeleton, Event Core, and Rich Shell

Done when:

- Next.js app runs locally.
- Config module exists.
- Agent identities and treasury are generated.
- Mock PaymentProvider emits pending and confirmed payments.
- In-memory run store records events.
- UI renders the full mission-control shell: agent wallet cards, transaction tape, budget gauge, creative/artifact panel, ad grid, and audit tab.
- Payment mode, treasury address, and explorer-link affordance are visible from the start.

### Hour 1-2: Demo Pipeline and Negotiation

Done when:

- Intake produces structured brief.
- Four proposals appear.
- Accept/reject state works.
- Budget guard blocks insufficient campaigns.
- Execution pays accepted agents and updates balances.
- Media Buyer emits at least 15-30 ad-buy events in mock mode.
- Mock 402-style publisher flow exists: payment required, pay, retry, placement confirmed.

### Hour 2-3: UI Payoff and Audit

Done when:

- Transaction tape is live and visually dominant.
- Budget gauge drains in sync with events.
- Agent cards update status and balance.
- Ad-slot grid lights up with placements.
- Summary card is accurate.
- Audit tab shows the current and previous in-memory runs.
- Artifact strip/list shows brief, strategy, copy, image, placement plan, and campaign report.

### Hour 3-4: AI, Creative, and Supabase Adapter

Done when:

- OpenAI is used for proposals/copy when the key is available.
- Deterministic fallback exists if OpenAI fails during rehearsal.
- Designer produces uploaded-image reuse, generated image, or fallback creative.
- Generation timeout cannot block the run.
- Audit writes go through an adapter; the adapter can target Supabase or memory.
- If Supabase credentials are ready, fire-and-forget persistence is wired.

### Hour 4-5: Hardening, On-Chain Attempt, and Demo Recording

Done when:

- Mock mode can run twice from cold start.
- `$1` run and `$50` run both work.
- Failure paths work: insufficient budget, generation failure, one failed placement.
- Supabase audit or in-memory audit tab is present and demo-ready.
- `onchain-single` is attempted if wallet/RPC/test USDC setup is ready.
- If real on-chain is flaky, the team records a clean mock-mode run and keeps on-chain UI affordances in the product story.
- Optional video toggle is present if it did not endanger the core flow; real video generation remains asynchronous.

## 8. Environment Variables

Required for mock MVP:

```txt
OPENAI_API_KEY=optional-for-fallback-demo
PAYMENT_MODE=mock
```

Optional Supabase:

```txt
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Optional on-chain:

```txt
PAYMENT_MODE=onchain-single
TREASURY_PRIVATE_KEY=
TREASURY_ADDRESS=
RPC_URL=
USDC_ADDRESS=
NEXT_PUBLIC_WALLETCONNECT_ID=
```

Rules:

- Never commit `.env.local`.
- Service role keys are server-only.
- Browser code can only read `NEXT_PUBLIC_*` variables.
- In mock mode, wallet/RPC variables must not be required.

## 9. Definition of Done

P0 done:

- App runs locally.
- Mock mode needs no wallet, faucet, RPC, or Supabase.
- User can complete intake, negotiation, execution, and summary.
- Four specialist proposals are visible before approval.
- Accepted agents receive fee payments and balances update.
- Media Buyer creates a visible ad-buy storm.
- Transaction tape and budget gauge update live.
- Mock 402-style publisher handshake is represented in the event flow.
- Audit tab/drawer shows at least the current run from in-memory data.
- Artifact strip/list shows agent outputs as first-class campaign assets.
- Summary shows fees, generation cost, ad spend, placement count, and tx count.
- Whole run completes in under 60 seconds.
- Same app can run `$1` and `$50` campaigns.
- At least one graceful failure path is demonstrable.

P1 done:

- OpenAI proposals/copy work with fallback.
- Hero creative exists with generation or fallback.
- Audit tab shows recent run history.
- Supabase persistence works when credentials are configured, with memory fallback.
- Video toggle exists and does not block campaign completion.

P2 done:

- `PAYMENT_MODE=onchain-single` performs real Base Sepolia testnet USDC transfers.
- Transaction hashes open in Base Sepolia explorer.
- Mock mode still works unchanged.
- Real video generation works asynchronously if provider credentials are configured.

## 10. Known Risks and Guardrails

- On-chain setup can consume the whole hackathon. Build and rehearse mock first.
- External package names and testnet addresses can drift. Verify current official docs before hardcoding on-chain details.
- Image/video generation can be slow. Use timeout and fallback.
- Supabase should never block the live event stream.
- One failed ad buy should not stop the run.
- Do not add auth, multi-user accounts, production x402 facilitator infra, mainnet, KYC, or multi-round negotiation.
- Do not let the UI become a generic chatbot. The spend tape and gauge are the product.
- Do not remove high-signal demo surfaces just because the backing service is not ready; keep the surface and use a safe adapter/fallback.

## 11. Open Questions

These do not block the MVP:

1. Is a real `requirements.md` intended to exist elsewhere, or should the PRD remain the source of truth?
2. Is the judged demo expected to require real Base Sepolia transactions, or is a flawless mock-mode demo acceptable with on-chain as stretch?
3. Are Supabase project credentials already available, or should audit persistence stay in-memory for the first demo?
4. Should live image generation be shown to judges, or should one creative be pre-warmed/replayed for reliability?
