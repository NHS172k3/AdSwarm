# PRD — "AdSwarm": An Autonomous AI Ad Agency (One-Person Company × Multi-Agent × On-Chain)

> Paste this whole document into Claude Code / Codex as the build spec. It is intentionally prescriptive about **architecture, libraries, and scope** so you don't reinvent the wheel or over-build. This is a **7-hour hackathon** project judged in a fast first-pass (~18 seconds of attention per project). **The demo is the product.** Optimize every decision for: *real on-chain actions, a spectacular live visual, and reliability under a live demo.*

---

## 0. TL;DR for the coding agent

Build a single **Next.js (TypeScript, App Router)** app, deployable to Vercel, that runs a **one-person ad agency staffed by 5 AI agents**. A user describes a product; a **client-facing agent asks 2–3 short clarifying questions** (budget, audience, call-to-action, optional product-image upload) and compiles a brief. Then four specialist agents (Strategist, Copywriter, Designer, Media Buyer) each **propose their fee and scope** in one negotiation round; the user **accepts or rejects each proposal** (no counter-round). On approval, the agency **pays each accepted agent its negotiated fee**, the accepted agents do the real work (including **actually generating ad images**, or using the user's uploaded product photos), and the Media Buyer spends the **remaining budget** buying ad placements from **mock publisher endpoints** via an **x402-style HTTP 402 → pay → retry** handshake. **The system is budget-aware and scales to any amount** — a **$1 budget** yields a small campaign (fewer placements, one cheap image); a large budget yields more. If the budget can't cover the agreed fees plus meaningful ad spend, the agency **tells the client it's insufficient** and names the minimum needed. Everything runs through a single `PaymentProvider` interface with a **`PAYMENT_MODE` switch** (`mock` | `onchain-single` | `onchain-sovereign`) and streams to a **live "mission control" dashboard** over SSE: the clarifying-question intake, each agent's proposal, the fee payments, the generated creatives, a **draining budget gauge**, and a **live transaction tape** where each payment flips *pending → confirmed* with a clickable `sepolia.basescan.org` link. A **Supabase** audit log records every campaign, agent, and payment.

**Every agent has its own on-chain wallet identity from day one.** You **build and rehearse entirely in `mock`** (instant, free, no faucets), then flip one env var to `onchain-single` for real Base Sepolia transactions. The UI, agents, and events are **identical across all modes**, so wallet funding is a deferrable, low-risk step, never a refactor.

**Two separate cost layers (keep them distinct):** (1) the **testnet USDC budget** is free play money that models the campaign economy on-chain; (2) the **only real money** spent is a few cents of OpenAI (LLM reasoning) + **image generation** API calls. Default to the **cheapest generation** (one small image, or reuse the user's uploaded photo) so a full $1 test costs you ~1–2 cents of real credits. Higher-quality images and **video are opt-in scaling tiers** gated behind larger budgets.

---

## 1. Product concept

**The pitch (one sentence):** *An AI ad agency you can audit down to the cent — a client-facing agent takes your brief, four specialist AI employees bid their own fees, then plan, create, and buy your campaign, paying each other and real ad slots autonomously on-chain.*

**Why it's novel (say this to judges):** Ad agencies are black boxes; nobody knows where the budget really goes, and ad fraud eats a huge share of spend. AdSwarm makes **every step a public receipt** — and goes further: each agent **autonomously prices its own work**, so the client sees the full cost breakdown and negotiation *before* committing, then watches every payment land on-chain. Traditional card rails can't process 2-cent ad buys economically — stablecoin micropayments (the x402 pattern) are the only thing that can. The blockchain is **load-bearing**, not decoration: remove it and the entire "auditable, negotiated, per-impression spend" value prop collapses.

**Why it's a "one-person company":** one human founder; the entire workforce is AI agents, each with its own wallet, its own LLM, and its own economic judgment. They intake the client, negotiate fees, collaborate, get paid, and transact as autonomous economic actors.

---

## 2. Goals & non-goals

**Goals**
- Real, verifiable on-chain transactions on Base Sepolia (nothing about the money is faked).
- A demo that reads as **complex and impressive in the first 15 seconds** (parallel agents + a transaction storm).
- Strong, distinctive UI (see §9 — this is a judged differentiator).
- Runs reliably from a laptop; ideally also deploys to Vercel.
- Buildable by one person in ~7 hours using well-known libraries.

**Non-goals (do NOT build these)**
- No real mainnet, no real (non-testnet) money on-chain. Testnet USDC only.
- No production-grade x402 facilitator infra, no KYC, no multi-user accounts/auth (single founder + connect-wallet-to-fund is enough).
- No expensive generation by default — generation happens for real, but default to the **cheapest** option (one small image, or the user's uploaded photo). Video/HD are opt-in scaling tiers.
- No multi-round haggling — negotiation is **one round** (propose → accept/reject), no counter-offers.
- Don't chase 90+ transactions if it hurts reliability; scale placements to the budget (§7).

---

## 3. The money flows (the heart of it)

All denominated in **testnet USDC** (free play money) on **Base Sepolia**. The single funded wallet is the **Agency Treasury**; the five agents and the publishers each have their own receive addresses.

1. **Deposit — User → Agency Treasury.** The user funds the campaign budget via the **Fund Wallet UI** (§7.7): in `mock` mode a simulated deposit; in `onchain-single` a real testnet-USDC transfer from the user's connected wallet. The budget can be anything — **$1 and up**.
2. **Negotiated fees — Agency Treasury → each accepted agent.** After the one-round negotiation (§7.2), the Treasury pays each **accepted** agent its **own proposed fee** into that agent's wallet. Rejected agents are paid nothing and their work is skipped. This is agent-to-agent settlement, not fixed payroll — each agent priced itself.
3. **Ad buys — Agency Treasury → publishers.** The Media Buyer spends the **remaining budget** (budget − fees − real generation cost) buying ad slots from mock publishers via the x402 handshake. **This is the visual centerpiece, and its size scales with the budget** — a $1 campaign buys ~15–20 placements; a bigger budget buys more (up to `AD_BUY_COUNT`).

**Budget arithmetic (enforced before spending):** `adSpend = budget − Σ(accepted fees) − generationCost`. If `adSpend` is ≤ 0 or below a minimum threshold, the agency **declines and reports insufficient budget** with the minimum needed (§7.3). No agent is paid and no ads are bought until the budget clearly covers fees + meaningful ad spend.

Total transactions per run ≈ **1 deposit + (1–4 fees) + N ad buys**, where N scales with budget.

---

## 4. The demo script (build backwards from this — 60–75s)

This is the acceptance test. The judge should see, in order:

1. **[0:00]** A clean control room. Founder describes a product: *"A new energy drink for late-night gamers"* and clicks **Start**.
2. **[0:04]** The **Client Agent** asks 2–3 short questions inline (budget? audience? main call-to-action? optional: upload a product photo). Founder answers: budget **$50** (or **$1** for the cheap test), audience "competitive gamers," CTA "pre-order now." *(Show the $1 run too — same flow, smaller campaign — to prove it scales.)*
3. **[0:12]** **Negotiation panel** appears: all four specialists post a proposal at once — *Strategist "market angle + targeting — ◈0.10", Copywriter "3 headlines — ◈0.08", Designer "generate 1 product ad — ◈0.12 (or ◈0.02 to use your photo)", Media Buyer "place across gaming channels, ~18 slots — ◈0.10"*. A live budget check shows *"Fees ◈0.40 · Ad spend ◈0.60 · fits your ◈50 budget."* Founder clicks **Accept all** (or rejects one).
4. **[0:20]** On approval, a **fee payment fires to each accepted agent** (tape: pending → confirmed; each agent's wallet balance ticks up). Agents execute: Strategist streams the angle, Copywriter streams headlines, **Designer reveals a real generated ad image** (or the uploaded product photo composed into an ad).
5. **[0:34]** **Media Buyer** activates. The screen comes alive: a **rapid tape of ad-buy transactions** streams in, the **budget gauge drains**, and an **ad-slot grid lights up** as placements land — as many as the remaining budget allows.
6. **[0:52]** **Summary card**: *"Campaign live. Fees ◈0.40 · Ad spend ◈0.58 across 18 placements · 23 transactions. Verify on-chain →"*.
7. **[0:58]** Founder clicks a random tx → real Base Sepolia explorer page opens. Then flips to the **Audit log** tab (Supabase) showing all past campaigns. Mic drop.

**Two things to show for maximum impact:** the **negotiation** (agents pricing themselves) and the **spend storm + draining gauge + clickable proof**. The $1 run proves the same machinery scales down cleanly.

---

## 5. Tech stack (use these — don't substitute without reason)

| Concern | Choice | Why |
|---|---|---|
| App framework | **Next.js 14+ (App Router, TypeScript)** | One codebase, Vercel-native, API routes for backend. |
| Styling | **Tailwind CSS** + **shadcn/ui** | Fast, clean, good defaults to override with our own tokens. |
| Animation | **Framer Motion** | The tape/gauge motion is the hero; framer makes it trivial. |
| Multi-agent orchestration | **LangGraph.js** (`@langchain/langgraph`) | Reputed, gives structured state + streaming. The graph is mostly linear; keep it simple. |
| LLM | **OpenAI** via `@langchain/openai` (or `openai` SDK) | User has OpenAI credits. Use `gpt-4o-mini` for all agent reasoning/proposals (fast, cheap). |
| Image generation | **OpenAI Images** via a **`GenerationProvider` interface** | Cheapest real image generation for the MVP. |
| Video generation | **Runway Gen-4 Turbo** via a **`VideoGenerationProvider` interface** | Default video provider for short ad videos. Future providers (Higgsfield, Veo, Kling, etc.) plug into the same interface without changing agent logic. |
| Wallet connect + fund | **wagmi + viem**, or **RainbowKit** for the connect UI | Lets the user connect a wallet and deposit testnet USDC in `onchain` modes. In `mock` mode the Fund UI simulates a deposit (no wallet needed). See §7.7. |
| Chain interaction | **viem** (preferred) or **ethers v6** | viem is modern, typed, great DX for Base. |
| Payment abstraction | **`PaymentProvider` interface + `PAYMENT_MODE` env switch** | Single seam; swap mock ↔ real ↔ sovereign with one env var, no code changes. See §7.3. |
| Payments — `mock` mode | In-memory simulated payments (default) | Instant, free, no faucets. Build/rehearse here; also the wifi-dies fallback. |
| Payments — `onchain-single` | Real ERC-20 testnet USDC transfer via **viem**, one funded sender | Your actual demo mode. Free (testnet). Direct transfer + thin 402 handshake = bulletproof. |
| Payments — real x402 (optional) | **Coinbase x402 packages** (e.g. `x402-next` / `x402-fetch` / `x402-axios` + CDP facilitator) | The actual x402 standard — most legit, but more setup. **Verify current package names/versions from official x402 docs/npm before installing.** Slots in behind the same interface. |
| Realtime → UI | **Server-Sent Events (SSE)** from a Next.js route handler | Simple one-way stream; perfect for a live feed. Polling fallback if needed. |
| Persistence / Audit | **Supabase (PostgreSQL)** with `@supabase/supabase-js` | Records every campaign, agent, and payment. Parallel fire-and-forget writes (doesn't block demo). Server-side writes only (service-role key). See §7.6. |
| State | In-memory on the server for a run; React state on the client. Supabase as durable audit log, not live pipeline driver. | No local DB needed; Supabase is optional infra that never blocks the demo if it hiccups. |

> **Important for the coding agent:** package names, testnet contract addresses, faucet URLs, and x402 SDK APIs change over time. **Verify anything external against current official docs/npm before hardcoding it.** Do not trust a memorized address or API shape.

---


> The architecture intentionally separates image and video providers. The MVP implements OpenAI Images + Runway Gen-4 Turbo. Future providers are swappable through interfaces.
## 6. Architecture

```
┌──────────────────────────────────────── Next.js app (Vercel-deployable) ────────────────────────────────────────┐
│                                                                                                                  │
│  Client (React dashboard)                          Server (route handlers)                                       │
│  ┌─────────────────────────┐   SSE events   ┌───────────────────────────────────────────────────────────────┐  │
│  │  Mission-control UI      │◄───────────────│  POST /api/launch  → runs LangGraph pipeline, emits events    │  │
│  │  - brief form            │                │  GET  /api/publishers/[slot] → returns 402, verifies, 200s    │  │
│  │  - 4 agent cards         │                │                                                               │  │
│  │  - budget gauge          │                │  Orchestration layer (LangGraph.js)                           │  │
│  │  - transaction tape      │                │    strategist → copywriter → designer → mediaBuyer            │  │
│  │  - ad-slot grid          │                │  Payment layer (interface): x402 SDK  |  direct-transfer      │  │
│  │  - summary card          │                │  Wallet layer (viem): ONE funded treasury wallet = sender     │  │
│  └─────────────────────────┘                └───────────────────────────────────────────────────────────────┘  │
│                                                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                   │ JSON-RPC                                   │ reads receipts
                                   ▼                                            ▼
                        Base Sepolia RPC (Alchemy free tier / sepolia.base.org)  →  sepolia.basescan.org (explorer)
```

**Wallet model (supports the full sovereignty story while staying cheap):**

- There is **one funded wallet: the Agency Treasury.** The user funds it (§7.7). In `onchain-single` it is the single funded sender for everything — fee payments to agents and the ad-buy storm to publishers. Keeping one sender means one nonce sequence to manage and one wallet to fund (max reliability).
- **All five agents (Client, Strategist, Copywriter, Designer, Media Buyer) get their own real wallet identity from the start** — a real keypair/address via `viem` (`generatePrivateKey` → `privateKeyToAccount`). The dashboard shows five distinct agent wallets with real addresses and balances that tick up when they're paid their negotiated fee. This *is* the "each agent owns its money" story, and it costs nothing because **receiving needs no gas or funding.**
- Each wallet carries **`funded`** and **`canSend`** flags. In `onchain-single` only the Treasury is `funded/canSend`; agents are receive-only. In `onchain-sovereign` (stretch) agents get funded and send from their own wallets (e.g., the Designer pays its own image-gen cost; the Media Buyer sends placements from its wallet).
- **Publishers** are receive-only addresses.

**Why this shape:** five real, self-custodying agent wallets whose balances visibly change as they're paid their self-negotiated fees (strong sovereignty + negotiation story), while you still only **fund and nonce-manage a single sender** (low risk). Upgrading to full per-agent self-custody is a funding step + flag flip, never a refactor — see `onchain-sovereign` in §7.3.

**Run mode:** For the live demo, run locally (`next dev`) for maximum reliability. Vercel deploy is a nice-to-have; if deploying, see the timeout note in §12.

---

## 7. Functional requirements (detailed)

### 7.1 Agents (LangGraph.js pipeline — 5 agents, two-phase)

Shared graph **state** object (typed):
```ts
type AgentId = "client" | "strategist" | "copywriter" | "designer" | "mediabuyer";

type AgentWallet = {
  id: AgentId;
  label: string;
  address: `0x${string}`;    // real address, generated at startup for every agent
  balanceUsdc: number;       // ticks up when the agent is paid its fee
  funded: boolean;           // has gas + USDC to SEND (mode-dependent)
  canSend: boolean;          // allowed to originate payments (mode-dependent)
};

type Proposal = {
  agent: AgentId;
  workDescription: string;   // what it will do, in plain language (LLM-written)
  feeUsdc: number;           // the fee the agent prices itself at
  meta?: Record<string, any>;// e.g. Designer: { mode: "generate"|"uploaded", genCostUsdc }
  status: "proposed" | "accepted" | "rejected";
};

type CampaignState = {
  rawBrief: string;                 // the user's freeform description
  answers: Record<string, string>;  // client-agent clarifying answers (budget, audience, cta)
  productImages?: string[];         // optional user-uploaded product image URLs
  budgetUsdc: number;
  agents: Record<AgentId, AgentWallet>;
  proposals: Proposal[];            // one per specialist, from the propose phase
  strategy?: { angle: string; audience: string; tone: string };
  headlines?: string[];
  creatives?: { url: string; headline: string }[];
  placements?: Placement[];
  ledger: Payment[];                // every tx recorded here
  feesUsdc: number;                 // Σ accepted fees
  generationCostUsdc: number;       // real gen cost, tracked
  adSpendUsdc: number;              // remaining budget spent on placements
};
```
> All five agent wallets are created at startup regardless of `PAYMENT_MODE`. The dashboard renders each agent's address + live balance; a `funded` agent shows a **"self-custody"** badge, so the UI upgrades itself when you fund agents later.

**The graph runs in three stages:**

```
  intake            propose (parallel)            [USER GATE]        execute (sequential)
┌─────────┐   ┌──────────────────────────┐   ┌──────────────┐   ┌────────────────────────────┐
│ client  │──▶│ strategist.propose        │──▶│ accept/reject│──▶│ pay fees → strategist.exec  │
│ intake  │   │ copywriter.propose        │   │  per agent   │   │  → copywriter.exec          │
│ (asks   │   │ designer.propose          │   │  + budget    │   │  → designer.exec (generate  │
│  2–3 Qs)│   │ mediabuyer.propose        │   │    check     │   │     or use uploaded image)  │
└─────────┘   └──────────────────────────┘   └──────────────┘   │  → mediabuyer.exec (storm)  │
                                                                 └────────────────────────────┘
```

**Stage 1 — `client.intake` (the client-facing agent).** LLM. Reads `rawBrief`, asks **2–3 short, relevant clarifying questions** (not an interrogation) — typically **budget**, **target audience**, and **primary call-to-action**, plus an optional prompt to **upload product images**. Emits `clarify_question` events; waits for the user's answers (`clarify_answer`). Compiles a structured brief into `state.answers`. The Client Agent charges **no fee** (it's the founder's front desk).

**Stage 2 — `*.propose` (each specialist prices itself).** Each specialist LLM reads the brief and emits a `Proposal` (`workDescription` + `feeUsdc`, low temperature so fees are sane):
- **Strategist** — proposes market angle + targeting work and its fee.
- **Copywriter** — proposes N headlines and its fee.
- **Designer** — proposes creative work; if `productImages` were uploaded it proposes a cheap **"use your photo"** path (low fee, ~no gen cost); otherwise a **"generate 1 image"** path with its `genCostUsdc` in `meta`. If budget is large it *may* propose more/higher-quality images (or video — see §7.4).
- **Media Buyer** — proposes a placement plan sized to the **budget minus the other proposed fees**, estimating a placement count, and its own media-buying fee.

Fees scale with budget: prompt each agent that fees should be a small, sensible fraction of the stated budget (e.g., a $1 campaign → fees in cents; a $500 campaign → fees in dollars). Emit each as a `proposal` event.

**Stage 3 — user gate + budget check (§7.3).** The negotiation panel shows all proposals; the user accepts/rejects each (one round). A budget check runs. If it passes → execute; if not → decline with the minimum needed.

**Stage 4 — `*.execute` (only accepted agents).** In order:
1. **Pay fees:** Agency Treasury → each accepted agent's wallet (real tx; balance ticks up). Emit `payment` (kind `fee`).
2. **Strategist.exec** → strategy; **Copywriter.exec** → headlines; **Designer.exec** → **actually generate the image(s)** (or compose the uploaded product photo into an ad), tracking real `generationCostUsdc`; emit `creative` events.
3. **Media Buyer.exec** → the storm: spends `adSpend = budget − fees − generationCost` buying placements from publishers (§7.2), scaling the count to the remaining budget, capped at `AD_BUY_COUNT`. Emits `payment` (kind `adbuy`) + `placement` + `budget_update` per buy. Stops at the budget floor.

Keep prompts short and low-temperature for consistent runs. If LangGraph.js causes friction, a plain async pipeline emitting the same events is an acceptable fallback — try LangGraph first (it's the "reputed orchestration" ask, and its interrupt/human-in-the-loop support fits the user gate well).

### 7.1a Negotiation & budget guard (the user gate)

After the propose stage, the app pauses (LangGraph interrupt or an explicit "await approval" step) and surfaces the proposals. The user **accepts or rejects each** (single round — no counter-offers). Then compute:

```
acceptedFees      = Σ feeUsdc for accepted proposals
generationCost    = designer accepted? its genCostUsdc : 0   (0 if using uploaded photo)
adSpend           = budgetUsdc − acceptedFees − generationCost
minMeaningfulSpend= CONFIG.MIN_AD_SPEND_USDC   // e.g. 0.10
```

- **If `adSpend >= minMeaningfulSpend`** → proceed to execute; Media Buyer sizes placements to `adSpend`.
- **If `adSpend < minMeaningfulSpend` (or ≤ 0)** → **decline gracefully.** Emit a `budget_insufficient` event and show the user a clear message: *"This campaign needs about ◈{acceptedFees + minMeaningfulSpend} to run well — your budget is ◈{budget}. Add funds or drop an agent to proceed."* No fees are paid and no ads are bought. The user can **add funds** (§7.7) or **reject an agent** to shrink fees, then re-check.

**Rejecting agents degrades gracefully:** reject Copywriter → proceed without new headlines (use the product name / a default). Reject Designer → require an uploaded product image (or fall back to a text-only creative). Reject Strategist → Media Buyer uses generic targeting. The Media Buyer can't be rejected (it's the one that spends the budget).

### 7.2 Mock publishers (the ad inventory sellers)

Implement as Next.js route handlers: `GET /api/publishers/[slot]`.

Define ~8 publisher slots in a config array, each with a name and price, e.g.:
```ts
const PUBLISHERS = [
  { id: "twitchside",  name: "TwitchSide Banner",     priceUsdc: 0.05 },
  { id: " signup",     name: "GamerForum Sidebar",    priceUsdc: 0.03 },
  { id: "ytpre",       name: "YT Pre-roll Slot",      priceUsdc: 0.08 },
  { id: "discord",     name: "Discord Server Promo",  priceUsdc: 0.02 },
  { id: "reddit",      name: "r/Gaming Promoted",     priceUsdc: 0.06 },
  { id: "esports",     name: "Esports Livestream L3", priceUsdc: 0.09 },
  { id: "mobile",      name: "Mobile Game Interstl.", priceUsdc: 0.04 },
  { id: "newsletter",  name: "GG Newsletter Slot",    priceUsdc: 0.03 },
];
```
The Media Buyer cycles through these (with repeats) to reach `AD_BUY_COUNT` placements.

**Handshake behavior of each publisher endpoint:**
- If the request has **no valid payment proof** → respond **HTTP 402** with headers/body describing the payment terms (amount in USDC, recipient = that publisher's receive address, chain = Base Sepolia, token = testnet USDC). Match the x402 payment-required response shape if using the SDK.
- If the request **includes a valid payment proof** (an x402 payment header, or in the fallback: a tx hash) → **verify the payment actually landed on-chain** (SDK facilitator verifies, or fallback: `getTransactionReceipt` + check recipient/amount) → respond **200** with `{ impressionId, slot, timestamp }`.

### 7.3 Payment layer (one interface, three swappable modes)

**This is the key architectural decision.** The rest of the app NEVER touches the chain directly — it only calls the `PaymentProvider` interface and gets back a uniform result. Which implementation is live is chosen by the **`PAYMENT_MODE`** env var. Because every mode returns the same shape and emits the same events, **the UI, agents, tape, and gauge behave identically regardless of mode** — so you build in `mock` and flip to real with one env var.

```ts
type PayResult = {
  txHash: string;        // real hash on-chain; realistic fake id in mock mode
  explorerUrl: string;   // basescan link on-chain; "#" or a fake path in mock
  status: "pending";     // provider then emits payment_update:confirmed later
};

interface PaymentProvider {
  // `from` is the sending agent's wallet id (e.g. "mediabuyer"); in single mode
  // the provider routes all sends through the one funded wallet transparently.
  pay(from: AgentWallet["id"] | "treasury", toAddress: string,
      amountUsdc: number, memo: string): Promise<PayResult>;
}
```

**Mode 1 — `mock` (DEFAULT; build & rehearse here; also the wifi-dies fallback):**
- No chain at all. `pay()` synthesizes a realistic-looking `0x…` hash, records the payment in the in-memory ledger, updates balances, and emits `payment` (pending) then, after a short delay, `payment_update` (confirmed) — exactly like the real modes.
- Zero setup, zero cost, instant, deterministic. **All agents `canSend: true`, `funded: false`.** You can build the entire product and rehearse the full demo without ever touching a faucet.

**Mode 2 — `onchain-single` (the real demo mode; still free testnet):**
- Real, verifiable Base Sepolia transactions via **viem**, but **only the Agency Treasury wallet is funded** (`funded: true, canSend: true`); the five agent wallets stay receive-only (`canSend: false`). The user deposits into the Treasury (§7.7); the Treasury pays agent fees (into agent wallets) and executes the ad-buy storm (to publishers) — the Media Buyer *directs* these buys, the Treasury *signs* them.
- `pay()` sends a testnet USDC ERC-20 `transfer`, returns the real hash + basescan URL. Publisher verifies via `getTransactionReceipt` (recipient + amount) then 200s. Genuine 402 → pay → retry, fully auditable. This is what you demo if the flip succeeds.

**Mode 3 — `onchain-sovereign` (the "eventually" mode — present but dormant):**
- Same as single, except **each agent sends from its OWN funded wallet** (`funded: true, canSend: true` for all). Full self-custody: every agent both earns and spends from its own account.
- Implement the code path but it's fine to ship it as a **stub that throws "wallet not funded yet"** until you actually fund the agent wallets. Upgrading from single → sovereign is a **funding step + flag flip, not a refactor.** Only reach for this as a stretch goal after the core demo is rock-solid.

**Optional real-x402 sub-implementation (inside modes 2/3, if time allows):** instead of a raw viem transfer, use Coinbase's x402 packages (`x402-fetch`/`x402-axios` client-side, `x402-next` + a Base Sepolia facilitator server-side; may need free CDP API keys — **verify current setup from official x402 docs**). It slots in behind the same `PaymentProvider` interface. Use it only if it's smooth; the viem direct transfer is already a real, legit on-chain payment.

**All on-chain paths must produce a real tx hash that opens on `sepolia.basescan.org`.** That clickable proof is the non-negotiable credibility moment.

**Nonce & throughput (critical for the storm — applies to on-chain modes):** in `onchain-single` all sends come from ONE funded wallet, so:
- Fetch the starting nonce once, then **manage the nonce manually**, incrementing per tx.
- **Do not `await` each confirmation before sending the next** — submit the tx, get the hash instantly, emit it as `pending`, and move on. Poll receipts in the background and emit `payment_update: confirmed` as they land.
- Add a small delay (e.g. 50–150ms) or a low concurrency cap between sends to avoid RPC rate limits.
- Prefer an **Alchemy free-tier RPC** over the public RPC for the storm (higher rate limits).

### 7.4 Creatives — Images + Video

The Designer agent produces **real ad creatives** at execute time, behind a `GenerationProvider` interface so the source/quality/cost is a config choice:

```ts
interface GenerationProvider {
  generateAd(opts: {
    prompt: string;            // built from brief + headline + product
    productImages?: string[];  // if user uploaded, compose/reference these
    tier: "cheap" | "standard" | "hd" | "video";
  }): Promise<{ url: string; realCostUsd: number }>;
}
```

**Two paths the Designer chooses between (decided in its proposal):**
1. **Uploaded product images** — if the user uploaded photos in intake, the Designer uses them (optionally lightly composited with the headline). **Cheapest path** — little or no generation cost. Preferred when available.
2. **Generate** — if no upload (or the user wants fresh creative), generate the image.

**Cost tiers (real API cost — keep the default cheap):**
| Tier | What | Approx real cost | When |
|---|---|---|---|
| `cheap` (DEFAULT) | 1 small image (smallest supported size) | ~1–2¢ | $1 tests, default |
| `standard` | 1–2 mid-size images | ~4–8¢ | mid budgets |
| `hd` | 2–3 high-res images | ~12–24¢ | larger budgets |
| `video` | short generated clip (e.g. Higgsfield) | higher; uses the user's Higgsfield credits | only above a budget threshold, opt-in |

The Designer's proposal picks a tier from the **campaign budget** (small budget → `cheap`; larger → `standard`/`hd`; `video` only if budget clears `CONFIG.VIDEO_MIN_BUDGET_USDC` and the user opts in). **Track the real generation cost** in `state.generationCostUsdc` and subtract it from ad spend, so the on-screen economy stays honest.

> **Two cost layers, restated:** the on-chain **fee** the Designer charges is *testnet USDC* (free play money in the campaign economy). The **real** money is the generation API call. For a $1 `cheap` test, real cost ≈ 1–2¢ of OpenAI credits. Uploaded images make it ≈ $0.

**Reliability:** generation is now live, so (a) default to `cheap`, (b) set a timeout + a graceful fallback (a headline-over-gradient placeholder card) if generation is slow/fails — never let a slow image stall the run, (c) for the *judge demo specifically*, you may pre-warm one generation before presenting so the reveal is instant. For **your personal $1 testing**, live generation is the point — let it run.



### 7.4b Video generation

The Designer agent may optionally produce a short video advertisement in addition to the hero image.

Implement a dedicated interface:

```ts
interface VideoGenerationProvider {
  generateVideo(opts:{
    prompt:string;
    sourceImageUrl?:string;
    aspectRatio:"9:16"|"1:1"|"16:9";
    durationSeconds:number;
    tier:"preview"|"social"|"premium";
  }): Promise<any>;
}
```

**MVP provider:** **Runway Gen-4 Turbo** (image-to-video).

Default settings:
- Duration: 5 seconds
- Aspect ratio: 9:16
- Silent
- Uses the approved hero image or uploaded product photo as input

Video generation is asynchronous. Campaign execution never blocks waiting for the video. If rendering exceeds the timeout, the campaign completes while the video continues in the background.

Future providers (same interface only; not implemented initially):
- Higgsfield
- Google Veo
- Kling
- Seedance
- Local ComfyUI



### 7.4c Artifact pipeline (first-class outputs)

Artifacts are first-class entities produced, versioned, stored, and reused across the system. Agents collaborate by consuming and producing artifacts rather than passing only text.

```ts
type ArtifactType =
  | "brief"
  | "strategy"
  | "copy"
  | "image"
  | "video"
  | "thumbnail"
  | "placement_plan"
  | "campaign_report";

type Artifact = {
  id: string;
  type: ArtifactType;
  producer: AgentId;
  version: number;
  storageUrl: string;
  metadata: Record<string, unknown>;
};
```

Every artifact is persisted to Supabase Storage:

```
campaigns/{campaignId}/
  uploads/
  strategy/
  copy/
  generated/images/
  generated/videos/
  thumbnails/
  reports/
```

Agents always read the latest approved artifact instead of regenerating work unnecessarily. Generation requests are cached using a deterministic hash of the brief, uploaded assets, and generation settings.

### 7.5 Realtime event stream (SSE)

`POST /api/launch` (and companion routes for intake answers + negotiation approval) drive an SSE stream. Event types (JSON):
```ts
type Event =
  // intake (client agent)
  | { type: "clarify_question"; id: string; question: string; kind: "budget"|"audience"|"cta"|"upload" }
  | { type: "clarify_answer"; id: string; answer: string }
  // funding
  | { type: "deposit"; amountUsdc: number; txHash?: string; explorerUrl?: string; treasuryBalanceUsdc: number }
  // negotiation
  | { type: "proposal"; agent: AgentId; workDescription: string; feeUsdc: number; meta?: any }
  | { type: "proposal_decision"; agent: AgentId; decision: "accepted"|"rejected" }
  | { type: "budget_check"; feesUsdc: number; generationCostUsdc: number; adSpendUsdc: number; ok: boolean }
  | { type: "budget_insufficient"; neededUsdc: number; budgetUsdc: number; message: string }
  // execution
  | { type: "agent_status"; agent: AgentId; status: "working"|"done" }
  | { type: "reasoning"; agent: AgentId; text: string }         // streamed chunks ok
  | { type: "generation"; agent: "designer"; tier: string; realCostUsd: number; status: "generating"|"done" }
  | { type: "creative"; url: string; headline: string }
  | { type: "payment"; id: string; kind: "deposit"|"fee"|"adbuy";
      fromLabel: string; toLabel: string; amountUsdc: number;
      txHash: string; explorerUrl: string; status: "pending" }
  | { type: "payment_update"; id: string; status: "confirmed"; blockNumber?: number }
  | { type: "placement"; slotId: string; publisher: string; priceUsdc: number }
  | { type: "budget_update"; spentUsdc: number; remainingUsdc: number }
  | { type: "summary"; feesUsdc: number; generationCostUsdc: number;
      adSpendUsdc: number; placements: number; txCount: number };
```
Client consumes via `EventSource`. Intake answers and negotiation accept/reject go back to the server via small POST routes (or the same SSE session with a companion channel). If SSE is fiddly, fall back to short polling of an in-memory run log.

### 7.6 Persistence & audit log (Supabase)

**The pattern:** Supabase is a **parallel, fire-and-forget durable record**, not the live pipeline driver. The demo is driven by SSE (fast, local, reliable). After each event, a server-side route **enqueues a write to Supabase** (non-blocking — doesn't wait for confirmation before the next event). If Supabase hiccups, the demo tape keeps flowing; the writes retry or drop, and the audit trail has a gap, but the on-screen experience is unaffected. This architecture keeps the real-time demo rock-solid while building a queryable, auditable history.

**Schema** (Supabase PostgreSQL tables, created at startup via migrations or the SQL editor):

```sql
-- campaigns: one row per run
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp default now(),
  brief text not null,
  budget_usdc numeric(10,2) not null,
  spent_usdc numeric(10,2) default 0,
  placement_count integer default 0,
  tx_count integer default 0,
  payment_mode text not null, -- 'mock' | 'onchain-single' | 'onchain-sovereign'
  status text not null default 'running' -- 'running' | 'completed' | 'failed'
);

-- agents: the four wallets per campaign
create table agents (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  role text not null, -- 'strategist' | 'copywriter' | 'designer' | 'mediabuyer'
  label text not null,
  address text not null, -- 0x...
  balance_usdc numeric(10,2) default 0,
  funded boolean default false,
  created_at timestamp default now()
);

-- payments: the ledger — the star table, fully auditable
create table payments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  kind text not null, -- 'deposit' | 'payroll' | 'adbuy'
  from_label text not null,
  to_label text not null,
  to_address text not null,
  amount_usdc numeric(10,2) not null,
  tx_hash text, -- null in mock mode; real hash in on-chain modes
  explorer_url text, -- null in mock mode; real basescan link in on-chain modes
  status text not null default 'pending', -- 'pending' | 'confirmed'
  block_number integer, -- for on-chain txs, the block it confirmed in
  created_at timestamp default now(),
  confirmed_at timestamp
);

-- placements: ad-buy outcomes
create table placements (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  payment_id uuid not null references payments(id) on delete cascade,
  publisher text not null,
  slot_id text not null,
  price_usdc numeric(10,2) not null,
  impression_id text,
  created_at timestamp default now()
);

-- Indexes for the audit-log queries (§8+ UI tab)
create index idx_campaigns_created on campaigns(created_at desc);
create index idx_payments_campaign on payments(campaign_id);
create index idx_payments_status on payments(status);
create index idx_placements_campaign on placements(campaign_id);
```

**Write pattern (in the backend, server-side):**
```ts
// After each event is emitted via SSE, fire-and-forget to Supabase.
// Do NOT await; the demo continues regardless.
async function recordPayment(campaignId: string, payment: PaymentEvent) {
  supabase
    .from('payments')
    .insert({
      campaign_id: campaignId,
      kind: payment.kind,
      from_label: payment.fromLabel,
      to_label: payment.toLabel,
      to_address: payment.toAddress,
      amount_usdc: payment.amountUsdc,
      tx_hash: payment.txHash,
      explorer_url: payment.explorerUrl,
      status: payment.status, // 'pending'
    })
    .catch(err => console.error('Supabase write failed (non-blocking):', err));
    // ^ intentional: if Supabase fails, we log and move on. SSE client never sees it.
}

// When a payment confirms:
async function confirmPayment(paymentId: string, blockNumber?: number) {
  supabase
    .from('payments')
    .update({ status: 'confirmed', confirmed_at: new Date(), block_number: blockNumber })
    .eq('id', paymentId)
    .catch(err => console.error('Supabase confirm failed (non-blocking):', err));
}
```

**Why Supabase, not just in-memory or a flat JSON log:**
- **Queryable audit trail.** A judge can see aggregate stats ("this agency ran 10 campaigns, spent $423 total, had a 95% confirm rate") without digging through files.
- **Real database.** It reads "serious" and "auditable" — way more credible than a JSON blob.
- **Cheap and free-tier friendly.** Supabase's free tier covers this workload (a few hundred inserts per demo run).
- **Fire-and-forget safety.** The demo never depends on Supabase succeeding — if it's down, the tape still flows, and judges see a clean demo anyway.

**The "audit log" UI tab (§9 expansion):** After a campaign completes, a second tab shows a query result:
```
AUDIT LOG — All campaigns
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Campaign #3 (Today, 14:22)  Budget: $50  Spent: $47.30  31 placements  34 txs  [View details]
Campaign #2 (Today, 14:08)  Budget: $50  Spent: $49.80  32 placements  35 txs
Campaign #1 (Today, 13:45)  Budget: $25  Spent: $24.50  15 placements  18 txs

AGGREGATE: 3 campaigns | $147.60 spent | 100% confirm rate
```
Clicking "View details" opens a scrollable list of that campaign's payments with live basescan links. This is a powerful second-screen moment: "Here's the full audit trail. Click any payment to verify on-chain."

### 7.7 Fund Wallet UI (deposit the budget)

The user sets the campaign budget by **funding the Agency Treasury**, via a **Fund Wallet** panel. Behavior is mode-aware but the UI is the same:

- **`mock` mode:** the panel shows the Treasury address and an amount input. Clicking **Add funds** simulates a deposit — the Treasury balance updates instantly, a `deposit` event fires (with a fake hash), no wallet needed. This is what you use while building and for a zero-friction demo.
- **`onchain-single` mode:** the panel offers **Connect wallet** (wagmi/RainbowKit). Once connected, the user enters an amount and clicks **Deposit** → their wallet signs a **testnet USDC transfer** to the Treasury address. The app watches the Treasury balance (poll `balanceOf` or watch for the transfer event); when it increases, it fires the `deposit` event with the real tx hash + basescan link and unlocks **Start campaign**.

Rules:
- **Nothing runs until the Treasury holds funds.** The launch button is disabled at zero balance; the header always shows the live Treasury balance.
- The budget used for a campaign is the deposited amount (or a user-entered figure ≤ balance).
- Show the balance prominently — it's the number the whole economy is measured against, and it draining is half the demo.
- Because deposits are testnet USDC, the user needs test USDC in their wallet first (faucet, §13). In `mock` mode none of this applies.

**Minimum-budget hint:** if the user tries to start with a budget below `CONFIG.MIN_CAMPAIGN_BUDGET_USDC` (e.g. $0.50), warn that agent fees + meaningful ad spend won't fit and suggest a minimum — this is the same guard as §7.1a, surfaced early.

---


## Agent design rationale (why these 5 agents)

The five-agent structure is intentionally minimal. Each agent owns a distinct business capability and an economic responsibility.

| Agent | Responsibility | Why it exists |
|---|---|---|
| Client Agent | Collects requirements, asks clarifying questions, manages approvals | Separates customer interaction from execution and makes the negotiation feel like a real agency account manager. |
| Strategist | Produces positioning, audience, messaging direction and channel strategy | Owns marketing decisions before creative work begins. |
| Copywriter | Produces headlines, CTAs and campaign copy | Specializes in language so creative assets and placements reuse consistent messaging. |
| Designer | Produces visual artifacts (images and optional videos) and owns creative generation costs | Owns all visual deliverables and generation providers. |
| Media Buyer | Allocates the remaining budget, purchases placements and optimizes campaign spend | Owns the campaign economy and all payment execution. |

Do **not** split the Designer into separate Image and Video agents for the MVP. They use the same inputs, the same creative direction, and the same generation infrastructure. Keeping them together reduces orchestration complexity while still allowing optional video output.

Do **not** merge the Strategist and Copywriter. Strategy answers *what should we say?* while Copywriting answers *how should we say it?* This distinction is intuitive to judges because it mirrors real advertising agencies.

Do **not** split the Media Buyer into Finance and Buying agents. The budget check already happens before execution, and a single Media Buyer cleanly owns campaign spending, publisher transactions, and optimization.

Future versions may add specialist agents (Analytics, Brand Safety, Compliance, SEO, Video Editor), but the MVP intentionally stays at five agents because each has a clear business function that is easy to explain in a live demo.


## 8. Data / config model

A single `config.ts` with all tunables so the demo is easy to adjust live:
```ts
export const CONFIG = {
  PAYMENT_MODE: process.env.PAYMENT_MODE ?? "mock", // "mock" | "onchain-single" | "onchain-sovereign"
  DEFAULT_BUDGET_USDC: 50,
  MIN_CAMPAIGN_BUDGET_USDC: 0.5,   // below this, warn the user up front (§7.7)
  MIN_AD_SPEND_USDC: 0.10,         // budget must leave at least this for placements (§7.1a)
  AD_BUY_COUNT: 30,                // hard cap on placements; actual count scales to remaining budget
  AVG_PLACEMENT_USDC: 0.035,       // used to size placement count to the budget
  // Agents price themselves in the propose stage; these are guardrails for the LLM proposals:
  FEE_RANGE_FRACTION: { min: 0.03, max: 0.15 }, // each fee as a fraction of budget (sane bounds)
  GENERATION: {
    DEFAULT_TIER: "cheap",         // "cheap" | "standard" | "hd" | "video"
    VIDEO_MIN_BUDGET_USDC: 25,
  },
  VIDEO: {
    ENABLED: true,
    PROVIDER: "runway",
    MODEL: "gen4_turbo",
    DEFAULT_DURATION_SECONDS: 5,
    DEFAULT_ASPECT_RATIO: "9:16",
    TIMEOUT_MS: 180000,
    MIN_CAMPAIGN_BUDGET_FOR_VIDEO: 10,
     // only offer video above this budget
    TIMEOUT_MS: 20000,             // fall back to placeholder if generation exceeds this
  },
  CHAIN: "base-sepolia",
  CHAIN_ID: 84532,
  RPC_URL: process.env.RPC_URL,        // Alchemy free tier recommended (only used in on-chain modes)
  USDC_ADDRESS: process.env.USDC_ADDRESS, // Base Sepolia testnet USDC — VERIFY current address
  TREASURY_ADDRESS: process.env.TREASURY_ADDRESS, // the one funded wallet users deposit into
  EXPLORER_BASE: "https://sepolia.basescan.org",
  SEND_DELAY_MS: 100,        // throttle for the storm
  MOCK_CONFIRM_DELAY_MS: 400, // in mock mode, how long a tx sits "pending" before it flips confirmed
};
```
> **`PAYMENT_MODE` is the master switch.** Default `mock` means the app runs end-to-end with **no wallet, no faucet, no RPC** — perfect for building and rehearsing. Set it to `onchain-single` (plus the env vars in §13) only when you want real on-chain txs. Nothing else in the app changes.

---

## 9. UI / visual design (a judged differentiator — take this seriously)

**Aesthetic thesis:** *A financial operations console for an AI company* — the room where you watch money move. Think "trading desk × block explorer," calm and premium, not a neon hacker terminal. The **money is the emotional core**, so let a single warm metallic accent carry it.

**Avoid the AI-default looks:** do **not** ship (a) cream + high-contrast serif + terracotta, (b) near-black + single acid-green, or (c) hairline broadsheet columns. We're going for a **deep indigo instrument-panel** instead.

**Design tokens (starting point — refine, don't just accept):**
- **Palette (deep console):**
  - `--bg` `#0B1020` (deep indigo-black)
  - `--surface` `#141B31` (raised panel)
  - `--line` `#26304D` (hairline borders)
  - `--text` `#E7ECF5` / `--muted` `#8A97B8`
  - `--money` `#F2B15E` (warm amber-gold — used ONLY for USDC amounts, the gauge fill, and confirmed spend; this is the signature color)
  - `--confirm` `#5BE3B3` (mint — a tx flipping from pending→confirmed)
  - `--pending` `#F2B15E` at reduced alpha, pulsing
- **Type:** a characterful grotesque for display (e.g. **General Sans** or **Space Grotesk**), **Inter** for body/UI, and a **monospace for all money + hashes** (e.g. **JetBrains Mono** or **Geist Mono**). Money and hashes in mono is what makes it read "financial/real." Set a deliberate scale; big confident numbers for the budget.
- **Radius/space:** small radius (6–8px), dense but breathable panels, strong alignment to a grid. Precision reads as competence.

**Layout & flow (three lightweight steps → one live console):**

The app moves through **Intake → Negotiation → Live console**, each a clean panel, ending on the mission-control screen. Keep steps fast; the console is the payoff.

*Step A — Intake (client agent):* a conversational panel. Founder types the product; the Client Agent asks 2–3 questions as chips/inputs (budget, audience, CTA) plus a **drag-to-upload** product-image zone. A **Fund Wallet** control shows the Treasury balance and an **Add funds / Connect wallet** action (§7.7). **Start** unlocks only when funded.
```
┌──────────────────────────────────────────────┐
│  Tell us about your product                  │
│  [ "A new energy drink for late-night gamers"]│
│  Client Agent: What's your budget?  [ $1 ]    │
│  Who're you targeting?  [ competitive gamers ]│
│  Main call-to-action?   [ pre-order now ]     │
│  Product photos (optional): [ ⬆ drop images ] │
│  Treasury ◈1.00  •  [Add funds] [Start ▶]     │
└──────────────────────────────────────────────┘
```

*Step B — Negotiation (one round):* all four specialist proposals at once, each with its self-priced fee + an accept/reject toggle, and a live budget check.
```
┌──────────────────────────────────────────────┐
│  Your team's proposals                        │
│  Strategist   market angle + targeting  ◈0.10 [✓]│
│  Copywriter   3 headlines               ◈0.08 [✓]│
│  Designer     generate 1 product ad     ◈0.12 [✓]│
│               (or use your photo — ◈0.02)      │
│  Media Buyer  ~18 gaming placements     ◈0.10 [✓]│
│  ─────────────────────────────────────────────│
│  Fees ◈0.40 · Ad spend ◈0.58 · fits ◈1.00 ✓   │
│  [Reject one]                 [Approve & run ▶]│
└──────────────────────────────────────────────┘
```
If the budget check fails, this panel shows the **insufficient-budget** message + minimum needed, with **Add funds** inline.

*Step C — Live console (the mission-control screen):*
```
┌───────────────────────────────────────────────────────────────────────────┐
│  ADSWARM ▍ autonomous ad agency            treasury 0x1a2b…  balance ◈ 0.42 │  header
├───────────────────────────┬───────────────────────────────────────────────┤
│  AGENTS (wallets)          │   BUDGET  ◈0.58 spent  ▓▓▓▓▓▓▓░░  remaining    │  gauge (drains)
│  ▸ Client      ✓           │   LIVE TRANSACTION TAPE  (the signature)       │
│  ▸ Strategist  ✓ ◈0.10     │   ◈0.10 → Strategist          0x9f… ⏳→✓  fee  │
│  ▸ Copywriter  ✓ ◈0.08     │   ◈0.05 → TwitchSide Banner   0x2c… ⏳→✓       │  streaming feed
│  ▸ Designer    ✓ ◈0.12     │   ◈0.03 → GamerForum Sidebar  0xa1… ⏳         │
│  ▸ Media Buyer ● buying…   │   … (chips fly in, flip pending→confirm)       │
├───────────────────────────┼───────────────────────────────────────────────┤
│  CREATIVE [generated ad]   │   AD-SLOT GRID  ▪▪▪▫▪▪▫▪▪▪  (cells light up)   │
└───────────────────────────┴───────────────────────────────────────────────┘
```
Each agent card shows its **wallet address + live balance** (ticking up when paid its fee) and a **self-custody badge** when funded. The generated creative appears in the CREATIVE panel.

**Signature element — the "spend tape":** each payment enters as a chip (amount in amber mono + label + short hash), tagged `fee` or a publisher. It arrives **pending** (amber, soft pulse), then **flips to confirmed** (mint check) when its receipt lands — a satisfying cascade. The **budget gauge drains** in sync. Fees and ad-buys share the tape so the whole economy is one legible stream.

**Second screen — the audit log tab:** After the campaign completes, a tab shows this campaign's full ledger + an aggregate view (total campaigns, total spend, confirm rate) from Supabase. A judge clicks any payment to verify on-chain. This is the "it actually persists" moment and a strong closing argument.

**Motion (deliberate, not scattered):** chips fly in + flip states; gauge animates smoothly; agent cards get a subtle active glow while working. Respect `prefers-reduced-motion`. Don't animate everything — the tape and gauge carry it.

**Copy voice:** plain, confident, active. Button says **Launch campaign**; when done, the toast/summary says **Campaign live** (same vocabulary through the flow). Label things by what they are ("remaining budget", "confirmed on Base"), never by system internals. The summary line is the closing argument: *"Every placement is a receipt. Verify any of them on-chain."*

**Quality floor:** responsive down to a laptop screen at minimum, visible focus states, no layout shift when the tape streams (reserve the space). The audit log tab queries Supabase and renders cleanly; no blocker if Supabase is slow or down (the live demo already finished).

---



### Creative output options

The Intake UI includes a "Creative Outputs" section allowing the client to choose:

- ☑ Hero image (default)
- ☑ Short product video (optional)

If video is enabled, the Designer proposes both the image and video work, including the estimated real API cost and additional execution time. If disabled, the pipeline skips all video-generation work and no video provider is invoked.

The campaign summary clearly distinguishes:
- Testnet campaign economy (agent fees and media spend)
- Real generation costs (image/video API usage)

## 10. Reliability rules (this is a live demo — treat these as hard requirements)

- **Build and rehearse in `mock` mode** (no wallet, no faucet, no RPC). Only switch to `onchain-single` once the whole demo works — and keep `mock` as the guaranteed fallback if the venue network misbehaves.
- **In on-chain mode: pre-fund the Agency Treasury wallet** with plenty of test USDC + a little test ETH **before** demoing (or fund it live via the Fund UI). Verify balance on load and show it in the header.
- **One funded sender in `onchain-single`** (the Treasury); all agent + publisher wallets exist as real addresses but only receive (§6).
- **Manual nonce management**, fire-and-don't-await, background receipt polling (§7.3).
- **Placements scale to the budget**, capped at `AD_BUY_COUNT`. A $1 test buys ~15–20 — already a storm. Only raise the cap if the RPC handles it.
- **Alchemy free-tier RPC** for the storm; keep `sepolia.base.org` as backup.
- **Generation defaults to `cheap`** with a timeout → placeholder fallback (§7.4); never let a slow image stall the run. For your $1 testing let it run live; for the judge demo you may pre-warm one generation.
- **Deterministic-ish LLM** (low temperature, short outputs) so runs + fee proposals look consistent.
- **Graceful failure:** if a single ad-buy tx fails, skip it and continue — never let one failure halt the storm. Log it, move on.
- Have a **"replay last run"** or a recorded fallback in your back pocket in case the venue wifi dies.

---

## 11. Build plan (7 hours, milestone-ordered — ship a working thin slice early)

**Build the whole thing in `mock` mode first — no wallet setup blocks any of the build.** The real-chain flip is a single late step you attempt only once the demo already works end-to-end.

| Time | Milestone | Definition of done |
|---|---|---|
| **0:00–0:30** | Skeleton + `PaymentProvider` (mock) | App scaffolds; `PaymentProvider` mock emitting pending→confirmed; all 5 agent wallet identities + Treasury generated at startup. No wallet/faucet needed. |
| **0:30–1:00** | Supabase (optional, high-value) | Create project, run migration SQL (§7.6), add env vars, stub `recordPayment()` (fire-and-forget). Skippable if time-pressed. |
| **1:00–1:45** | Mock publishers + 402 + storm | `/api/publishers/[slot]` returns 402 then verifies + 200s. Media Buyer buys in a loop, sizing count to budget, emits payment/placement/budget events. This already looks like the final demo core. |
| **1:45–3:00** | 5 agents, two-phase (propose/execute) | Client intake (2–3 Qs) → each specialist emits a `proposal` (fee + scope) → execute stage pays accepted agents + does work. Budget guard (§7.1a). All LLM via `gpt-4o-mini`, low temp. |
| **3:00–3:45** | Real image/video generation | `GenerationProvider` with OpenAI Images at `cheap` tier; Designer generates 1 image OR uses uploaded product photos; timeout → placeholder fallback; track real cost. |
| **3:45–5:15** | Dashboard UI (3 steps + console + audit tab) | Intake panel (Qs + upload + Fund Wallet), negotiation panel (proposals + accept/reject + budget check), live console (gauge, tape, agent wallet cards, creative, ad grid), audit-log tab querying Supabase. Wire SSE. |
| **5:15–5:45** | Polish + design pass | Tokens/type/motion from §9; tape + gauge sing; responsive + reduced-motion. **Complete, demo-ready in mock mode with a $1 run and a big-budget run.** |
| **5:45–6:20** | Fund UI + on-chain flip (high-value) | Wire wagmi/RainbowKit deposit; do §13 setup (~15 min); fund Treasury; set `PAYMENT_MODE=onchain-single`; run a real $1 campaign; confirm hashes open on basescan. **If flaky, revert to `mock`.** |
| **6:20–7:00** | Harden + rehearse | Pre-canned brief + answers, generation pre-warm, failure skipping, rehearse the 60–75s script twice (incl. the $1 run + audit tab); capture a screen recording backup. |

**If you fall behind, cut in this order (each keeps a winning demo):** drop `onchain` (stay mock) → drop real generation (placeholder creative) → drop Supabase → simplify negotiation to auto-accept (still shows proposals). The irreducible core is: *intake → proposals → pay agents → storm → tape + gauge + summary.* Everything else layers on top.

---

## 12. Known risks & mitigations

- **Any on-chain problem at all** → the ultimate mitigation is `PAYMENT_MODE=mock`: a full, identical-looking demo with zero chain dependency. On-chain is always optional upside, never a blocker.
- **x402 SDK/facilitator friction** → don't use it; the viem direct-transfer path inside `onchain-single` is already a real, verifiable payment. The x402 SDK is optional polish behind the same interface.
- **RPC rate limits during the storm** (on-chain mode only) → Alchemy free tier, throttle (`SEND_DELAY_MS`), lower `AD_BUY_COUNT`, or just demo in `mock`.
- **Image generation slow/fails** → default `cheap` tier, hard `TIMEOUT_MS`, fall back to a headline-over-gradient placeholder; the run never stalls on an image. Pre-warm one generation before a judge demo.
- **Insufficient budget** → the §7.1a guard declines cleanly with the minimum needed and an inline **Add funds**; it never pays agents or buys ads on a budget that can't cover them. This is a feature to show, not a bug.
- **Wallet-connect friction (Fund UI)** → in `mock` mode the Fund UI simulates deposits with no wallet at all; only wire wagmi/RainbowKit for the on-chain flip, and keep faucet-funding the Treasury as a manual backup.
- **Supabase hiccup or downtime** → persistence is fire-and-forget and never blocks the live demo. If Supabase is down, the tape still flows perfectly. The audit-log tab just shows no history; skip clicking it if needed.
- **Testnet USDC address / faucet drift** → **verify current Base Sepolia USDC address and faucet URLs from official docs (Circle / Base / Alchemy) before hardcoding.** Do not trust a memorized address.
- **Vercel serverless timeouts** on a long run → for the demo, **run locally** (`next dev`). If deploying: set a higher `maxDuration` on the route, enable fluid/streaming, and/or keep `AD_BUY_COUNT` modest. The dashboard itself deploys to Vercel fine.
- **Wifi dies at the venue** → keep a screen recording of a successful run as a fallback.

---

## 13. Accounts & environment

**For `mock` mode (the whole build + a valid demo): you need only an OpenAI API key** (used for both agent reasoning and cheap image generation). No wallet, no faucet, no RPC. This is where you spend almost all your time.

**Only when you attempt the `onchain-single` flip** (≈15 min, still $0) do you set up the wallet side:
1. **MetaMask** browser extension → create wallet → switch network to **Base Sepolia** (built in). This is the **Agency Treasury** wallet (the one funded sender), and/or the user's own wallet for depositing via the Fund UI.
2. **Faucets** (free): get test **ETH** (gas) and test **USDC** on Base Sepolia — Circle's USDC testnet faucet + a Base Sepolia ETH faucet (Alchemy/Coinbase). Fund the Treasury generously (or fund your personal wallet and deposit via the Fund UI).
3. **Alchemy** free account → create a Base Sepolia app → copy the **HTTPS RPC URL** (better rate limits than the public RPC for the storm).
4. **WalletConnect project ID** (free, only if using RainbowKit for the connect UI).

`.env.local`:
```
OPENAI_API_KEY=sk-...             # agent reasoning + cheap image generation (mock mode needs only this)
PAYMENT_MODE=mock                 # flip to onchain-single for real txs

# --- Supabase (optional but recommended for audit trail) ---
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc... # full-access key (server-side only!)

# --- image generation (optional; only if using a non-OpenAI tier / video) ---
HIGGSFIELD_API_KEY=...            # only if you enable the "video" tier or Higgsfield images

# --- only needed when PAYMENT_MODE=onchain-single ---
TREASURY_PRIVATE_KEY=0x...        # Agency Treasury (funded sender), from MetaMask (testnet only!)
TREASURY_ADDRESS=0x...            # its address (users deposit here via the Fund UI)
RPC_URL=https://base-sepolia.g.alchemy.com/v2/XXXX
USDC_ADDRESS=0x...                # Base Sepolia testnet USDC — VERIFY before use
NEXT_PUBLIC_WALLETCONNECT_ID=...  # only if using RainbowKit for the Fund UI connect

# --- optional, only if you use the real x402 facilitator (§7.3) ---
CDP_API_KEY_ID=...
CDP_API_KEY_SECRET=...

# --- only for PAYMENT_MODE=onchain-sovereign (stretch) ---
# STRATEGIST_PRIVATE_KEY / COPYWRITER_PRIVATE_KEY / DESIGNER_PRIVATE_KEY / MEDIABUYER_PRIVATE_KEY
```
> Security note: keys hold only worthless testnet funds. Still, never commit `.env.local`; add it to `.gitignore`. In `mock` mode there's no wallet key at all — just OpenAI.

---

## 14. Definition of done (acceptance criteria)

- [ ] Runs end-to-end in **`mock` mode** with only an OpenAI key — no wallet/faucet/RPC.
- [ ] Every agent has its own wallet identity + live balance; payroll lands in each agent's own wallet.
- [ ] Submitting a brief + budget runs the full 4-agent pipeline.
- [ ] At least **~30 ad-buy transactions** occur per run (deposit + 3 payroll + storm), with the same UI in every mode.
- [ ] In **`onchain-single`** mode each tape entry opens a **valid `sepolia.basescan.org` page** (real hash).
- [ ] The **budget gauge drains** and the **tape flips pending→confirmed** live, driven by events.
- [ ] Flipping `PAYMENT_MODE` between `mock` and `onchain-single` requires **no code changes**.
- [ ] **(Optional) Supabase audit log:** campaigns table records each run; payments table records each tx; audit-log tab queries and displays history + aggregate stats. Fire-and-forget writes don't block the live demo.
- [ ] A **summary card** reports total spent, placement count, payroll, and tx count.

- [ ] User can enable or disable video generation before launch.
- [ ] Video generation runs asynchronously when enabled and does not block campaign completion.
- [ ] All generated artifacts (brief, strategy, copy, images, videos, reports) are persisted and versioned.

- [ ] The whole run completes in **under ~60 seconds** and looks great on a laptop screen.
- [ ] Runs reliably twice in a row from a cold start.

---

## 15. Explicit do / don't for the coding agent

**Do**
- **Build and rehearse entirely in `mock` mode**; treat the on-chain flip as a late, optional, one-env-var step.
- Keep all payments behind the single `PaymentProvider` interface so `mock` / `onchain-single` / `onchain-sovereign` are pure config swaps.
- Give every agent its own wallet identity + `funded`/`canSend` flags from the start, so full self-custody is a later flag flip, not a refactor.
- **Make Supabase writes fire-and-forget** (non-blocking, no await). The demo drives on SSE; Supabase accumulates audit history in parallel. If Supabase is slow or down, the live demo is unaffected.
- Verify all external specifics (package names, USDC address, faucets, x402/facilitator APIs) against current official docs before wiring them.
- Make the transaction tape + budget gauge the visual hero; spend design effort there.
- Emit granular SSE events so the UI feels alive.
- Ship a working thin slice early, then layer.

**Don't**
- Don't use mainnet or real funds.
- Don't generate images/video live during the demo.
- Don't await each tx confirmation serially (kills the storm).
- Don't await Supabase writes (it's fire-and-forget; use `.catch()` to log errors, not to block).
- Don't add auth, databases, or multi-user scope.
- Don't default the UI to the three generic AI looks called out in §9.
- Don't let one failed tx stop the run.
