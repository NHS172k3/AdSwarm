# AdSwarm

AdSwarm is a hackathon-ready demo of an AI-native ad agency. A campaign brief enters an agent workflow that plans strategy, negotiates fees, generates creative assets, simulates media execution, and records an auditable run history.

The product is designed to be demo-safe by default:
- **`PAYMENT_MODE=mock`** provides a complete end-to-end flow with no chain credentials.
- Optional integrations (OpenAI, Supabase, on-chain USDC) enhance output quality and persistence without blocking the run when unavailable.

## Highlights

- Multi-agent campaign planning with proposal acceptance/rejection controls
- Live launch stream with:
  - payment tape
  - budget checks/gauge behavior
  - creative generation events
  - placement/publisher events
  - final campaign summary
- Optional OpenAI-powered image and experimental video generation
- Optional Supabase audit persistence
- Optional Base Sepolia USDC transfer path (`onchain-single` mode)
- In-memory audit/run history fallback to keep demos reliable

## Tech Stack

- Next.js 15
- React 19
- TypeScript
- OpenAI API (optional)
- Supabase (optional)
- viem (optional on-chain payments)

## Prerequisites

- Node.js 20+
- pnpm

## Quick Start

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

3. Start the app:

   ```bash
   pnpm dev
   ```

4. Open http://127.0.0.1:3000

## Environment Configuration

### Core (recommended for all runs)

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
OPENAI_IMAGE_MODEL=gpt-image-1
OPENAI_IMAGE_QUALITY=low
PAYMENT_MODE=mock
```

> `OPENAI_API_KEY` is optional for app availability. If omitted or unavailable, AdSwarm falls back to deterministic local behaviors so launch still completes.

### Optional: Supabase Audit Persistence

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

If unset, audit history remains available through in-memory/local fallback behavior.

### Optional: On-Chain Payments (Base Sepolia)

```env
PAYMENT_MODE=onchain-single
TREASURY_PRIVATE_KEY=0x...
TREASURY_ADDRESS=0x...
RPC_URL=https://base-sepolia.g.alchemy.com/v2/...
USDC_ADDRESS=0x...
```

If chain execution fails, keep `PAYMENT_MODE=mock` for demo continuity.

## Scripts

- `pnpm dev` — start local development server
- `pnpm typecheck` — run TypeScript checks
- `pnpm build` — create production build
- `pnpm check` — run typecheck + production build
- `pnpm start` — start production server (after `pnpm build`)

## Demo Flow

1. Open the app.
2. Enter campaign inputs (brief, audience, CTA, budget).
3. Click **Plan campaign**.
4. Accept desired agent proposals (accept all for full-path demo).
5. Click **Launch campaign**.
6. Observe the transaction tape, budget movement, creative events, publisher placements, and final summary.

## API Routes

- `POST /api/plan` — generate campaign plan/proposals
- `POST /api/launch` — run launch stream and payment/media simulation
- `GET /api/audit` — inspect stored audit runs
- `GET /api/runs?runId=...` — inspect a specific run
- `GET /api/publishers?slotId=...&proof=...` — resolve publisher slot
- `POST|GET /api/experimental/video` — create, poll, or download experimental OpenAI video jobs

## Experimental Video

Video generation is asynchronous and intentionally non-blocking.

Enable with:

```env
OPENAI_EXPERIMENTAL_VIDEO_ENABLED=true
OPENAI_EXPERIMENTAL_VIDEO_MODEL=sora-2
```

When enabled and selected in campaign configuration, launch emits a video artifact with metadata such as `openaiVideoId`, status URL, and download URL. If video APIs are unavailable, the broader campaign run still completes.

## Security and Operations Notes

- Keep secrets in `.env.local` only (never commit credentials).
- Use `mock` mode for the most reliable demos.
- Keep on-chain mode as an optional enhancement, not a dependency for core flows.

