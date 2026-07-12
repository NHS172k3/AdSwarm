# AdSwarm

AdSwarm is a hackathon demo for an AI-native ad agency. A client enters a campaign brief, the agent team negotiates fees, generates creative, simulates payroll and media buys, and produces an audit trail with optional on-chain USDC payments on Base Sepolia.

## NOTE: THE VIDEO GENERATION MIGHT TAKE A WHILE AS IT IS A SMALL MODEL I AM USING TO SAVE COSTS, PLEASE BEAR WITH ME.

## Stack

- Next.js 15
- React 19
- TypeScript
- OpenAI API
- Supabase for optional audit persistence
- `viem` for Base Sepolia USDC transfers

## What works now

- Campaign planning flow with agent proposals
- Accept/reject controls per agent
- Live launch stream with budget checks, fee payments, OpenAI image generation, placement events, and summary
- Mock mode for a full demo without chain dependencies
- On-chain single-treasury mode scaffolded through Base Sepolia USDC envs
- Audit API and local in-memory run history

## Environment

Copy `.env.example` to `.env.local` and fill what you have.

Required for the core app:

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
OPENAI_IMAGE_MODEL=gpt-image-1
OPENAI_IMAGE_QUALITY=low
PAYMENT_MODE=mock
```

Optional Supabase:

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Optional on-chain demo mode:

```env
PAYMENT_MODE=onchain-single
TREASURY_PRIVATE_KEY=0x...
TREASURY_ADDRESS=0x...
RPC_URL=https://base-sepolia.g.alchemy.com/v2/...
USDC_ADDRESS=0x...
```

See `.env.example` for the full template.

## Install

```bash
pnpm install
```

## Run locally

Start the dev server:

```bash
pnpm dev
```

Open:

```text
http://127.0.0.1:3000
```

Validation:

```bash
pnpm typecheck
```

Production build:

```bash
pnpm build
```

Combined validation plus production build:

```bash
pnpm check
```

Serve the production build:

```bash
pnpm start
```

## Demo flow

1. Open the app.
2. Enter a product brief, audience, CTA, and budget.
3. Click `Plan campaign`.
4. Keep all agents accepted for the full demo path.
5. Click `Launch campaign`.
6. Watch the payment tape, OpenAI image generation, placements, and final summary.

## Creative generation

Static ad images are generated with OpenAI when `OPENAI_API_KEY` is present. If OpenAI image generation is unavailable, the launch stream falls back to a local SVG creative so the demo still completes.

Video is intentionally non-blocking. When video is enabled in the campaign and `OPENAI_EXPERIMENTAL_VIDEO_ENABLED=true`, launch creates an async OpenAI video job and emits a video artifact with `metadata.openaiVideoId`, `metadata.statusUrl`, and `metadata.downloadUrl`. Campaign launch still completes if the video API is unavailable.

For local testing, set this in `.env.local` and restart the dev server:

```env
OPENAI_EXPERIMENTAL_VIDEO_ENABLED=true
OPENAI_EXPERIMENTAL_VIDEO_MODEL=sora-2
```

Experimental OpenAI video route:

```bash
curl -X POST http://127.0.0.1:3000/api/experimental/video \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"A short energetic product ad for a gaming energy drink\",\"model\":\"sora-2\"}"
```

This route is disabled unless `OPENAI_EXPERIMENTAL_VIDEO_ENABLED=true` is set.

For the main app flow, turn on `Video` in the campaign composer, launch the campaign, then inspect the emitted video artifact in the UI or via `/api/runs?runId=...`.

Poll status:

```bash
curl "http://127.0.0.1:3000/api/experimental/video?videoId=video_123"
```

Download the finished MP4 through the same isolated route:

```bash
curl -L "http://127.0.0.1:3000/api/experimental/video?videoId=video_123&download=1"
```

## On-chain mode

Set:

```env
PAYMENT_MODE=onchain-single
```

Then provide:

- `TREASURY_PRIVATE_KEY`
- `TREASURY_ADDRESS`
- `RPC_URL`
- `USDC_ADDRESS`

This mode sends USDC transfers from the treasury wallet on Base Sepolia and links each tx to Basescan.

## Useful routes

- `/` main app
- `/api/plan` plan a campaign
- `/api/launch` launch a campaign stream
- `/api/audit` inspect stored local runs
- `/api/runs?runId=...` inspect a specific run
- `/api/publishers?slotId=...&proof=...` unlock a publisher slot
- `/api/experimental/video` create, poll, or download experimental OpenAI video jobs

## Checks already run

These passed locally:

```bash
pnpm typecheck
pnpm build
```

I also smoke-tested:

- `GET /`
- `GET /api/audit`
- `POST /api/plan`
- `POST /api/launch`

## Notes

- `mock` mode is the safest demo default.
- Supabase is optional right now; the app still works without it.
- Keep secret keys in `.env.local` only.
- Use `pnpm`, not `npm`, for this repo.
