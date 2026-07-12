# Project AGENTS

## Goal
Build a hackathon-ready AdSwarm demo: intake, agent negotiation, payment tape, budget gauge, creatives, mock publishers, and audit history.

## Build Rules
- Keep `mock` mode reliable first.
- Preserve the on-chain seam in code, but do not block the demo on chain setup.
- Keep the UI rich: transaction tape, budget gauge, agent cards, creative panel, audit tab.
- Use fallback behavior for OpenAI, Supabase, and generation so the run never hard-fails on missing optional services.
- Keep code scoped and reversible. Avoid broad refactors while the demo is still incomplete.
- Prefer server-side execution for campaign orchestration and persistence.
- Do not commit secrets or assume `.env.local` exists.

## Environment
- `OPENAI_API_KEY` enables richer proposals/copy and image generation.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` enable optional audit persistence.
- `PAYMENT_MODE=mock` must always work without chain credentials.

## Verification
- Run build or typecheck checks after meaningful changes.
- Keep a fallback demo path if on-chain or provider integrations fail.

