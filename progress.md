# Progress Handoff

Date: 2026-07-12
Project: `C:\Users\harin\Hackathons\amber-hackathon`

## Current Goal

Make the hackathon demo usable end to end:

- Plan an AI ad campaign.
- Accept/reject agent proposals.
- Launch the campaign.
- Generate/display image creative.
- Create an async OpenAI video job when video is enabled.
- Persist generated artifacts to Supabase so they can be recovered after the live stream.
- Reduce UI clutter and make the clarification-answer flow obvious.

## Important Runtime Note

There are multiple local Next dev servers running. The experimental video route exists in the codebase, but one stale server/port appears broken.

Observed:

- `http://127.0.0.1:3005/api/experimental/video` returns expected API JSON: `400 {"ok":false,"experimental":true,"error":"videoId is required."}`
- `http://127.0.0.1:3000/api/experimental/video` returned `500` during debugging.

Recommended before continuing:

1. Stop all old Next dev servers.
2. Start exactly one dev server.
3. Use one port consistently.

Suggested command:

```powershell
pnpm dev -- --hostname 127.0.0.1 --port 3000
```

If port `3000` is busy, use `3005`, but then all artifact links should be opened on `3005`.

## Environment

`.env.local` was created with:

```env
OPENAI_EXPERIMENTAL_VIDEO_ENABLED=true
```

`.env.example` was updated to default:

```env
OPENAI_EXPERIMENTAL_VIDEO_ENABLED=true
OPENAI_EXPERIMENTAL_VIDEO_MODEL=sora-2
```

User said OpenAI and Supabase envs are available. Do not commit real secrets.

## Subagent Coordination

Relevant agents contacted:

- `Franklin` UI agent: owns `components/campaign-studio.tsx` and `app/globals.css`.
  - Confirmed backend-only video wiring does not conflict.
  - Later urgent UI task was sent: reduce button density, clarify answer inputs, render images/videos in artifacts.
  - No response received before main agent began minimal UI fixes.
- `Kant` video spike:
  - Implemented isolated video route.
  - Route not fully proven against real OpenAI video job.
  - Warned launch wiring must remain non-blocking and behind env flag.
- `IntegrationCheck`:
  - Recommended async video-job creation during launch only when `draft.useVideo && OPENAI_EXPERIMENTAL_VIDEO_ENABLED`.
  - Do not poll inside launch.
  - Persist `videoId`, status/poll URL, download URL in artifact metadata.
- `DemoRisk`:
  - Did not respond in latest wait.

## Verified Earlier

These passed before the most recent persistence/UI edits:

```powershell
pnpm typecheck
pnpm build
```

Smoke results before the newest edits:

- `GET /` returned `200`
- `GET /api/audit` returned `200`
- `GET /api/experimental/video` returned expected missing-`videoId` response on `3005`

Important: after the latest Supabase persistence and UI edits, checks still need to be rerun.

## Backend State

### OpenAI video route

Files:

- `lib/openai-video-experimental.ts`
- `app/api/experimental/video/route.ts`

Route contract:

```http
POST /api/experimental/video
GET /api/experimental/video?videoId=...
GET /api/experimental/video?videoId=...&download=1&variant=video
```

Expected POST body:

```json
{
  "prompt": "required string",
  "model": "optional string",
  "size": "optional string",
  "seconds": "optional string|number",
  "poll": "optional boolean",
  "pollIntervalMs": "optional number",
  "timeoutMs": "optional number"
}
```

### Launch video wiring

File:

- `lib/campaign.ts`

Current behavior:

- If `draft.useVideo` is true, launch calls `createVideoArtifact(...)`.
- If `OPENAI_EXPERIMENTAL_VIDEO_ENABLED=true`, it attempts to create an async OpenAI video job with:
  - model from `OPENAI_EXPERIMENTAL_VIDEO_MODEL`
  - seconds `4`
  - size `1280x720`
- Launch does not poll to completion.
- Video artifact metadata includes:
  - `openaiVideoId`
  - `statusUrl`
  - `pollUrl`
  - `downloadUrl`
  - `model`
  - `seconds`
  - `size`
  - `prompt`
- If the OpenAI video call fails/times out, launch still completes and emits a queued/failed-info artifact.

Potential risk:

- `createVideoArtifact(...)` uses a 15 second abort timeout. Verify this compiles and behaves correctly in Next runtime.

## Supabase Persistence State

Existing table:

- `campaign_runs` stores full run JSON, including `events` and `artifacts`.

New migration added:

- `supabase/migrations/20260712154500_campaign_artifacts.sql`

New table:

```sql
campaign_artifacts (
  id text primary key,
  run_id uuid references campaign_runs(id),
  type text,
  producer text,
  version integer,
  title text,
  storage_url text,
  preview_text text,
  status text,
  metadata jsonb,
  artifact jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
```

Code changes in `lib/audit-store.ts`:

- Added artifact serialization.
- Added `persistArtifact(...)`.
- Added `loadArtifacts(...)`.
- `createRunRecord(...)` now tries to persist initial artifacts.
- `appendEvent(...)` now:
  - pushes event to memory
  - merges artifact events into `run.artifacts`
  - persists the artifact row
  - persists the updated run row
- `getRunAsync(...)` loads `campaign_artifacts` and overlays them onto the run.

Needs verification:

- Run migration in Supabase.
- Confirm `campaign_artifacts` rows are created after launch.
- Confirm `/api/runs?runId=...` returns enriched artifacts.
- Confirm `campaign_runs.artifacts` also updates.

Migration command options:

```powershell
supabase db push
```

or apply the SQL from:

```text
supabase/migrations/20260712154500_campaign_artifacts.sql
```

## UI State

Files touched:

- `components/campaign-studio.tsx`
- `app/globals.css` may still need style updates.

Current UI issues from user:

- Too many buttons.
- Too much visual/information intensity.
- Clarifying question agent asks questions, but answer input is not obvious enough.
- Generated images/videos are not clearly displayed in UI.
- Video links looked like route missing because stale server/port and because queued video download URLs were exposed before video completion.

Recent UI changes started:

- `artifactMediaUrl(...)` now does not treat queued video `metadata.downloadUrl` as playable media unless artifact status is `ready`.
- Added helpers:
  - `artifactStatusUrl(...)`
  - `artifactDownloadUrl(...)`
- Artifact cards now show a video placeholder for queued/failed videos instead of a broken player.
- Artifact cards now show `Check status` and `Download MP4` links for video artifacts when metadata URLs exist.
- The top question preview block now renders editable answer fields instead of read-only question cards.

Needs completion:

- Add CSS for:
  - `.artifact-media`
  - `.artifact-video`
  - `.artifact-video-placeholder`
  - `.artifact-actions`
  - `.question-card-editable`
  - `.question-strip-editable`
- Verify the UI compiles after the TSX edits.
- Reduce button density further:
  - Consider hiding `Accept all` / `Trim copy` behind simpler defaults or keep only one primary action.
  - Agent proposal cards can keep one compact toggle each.
  - Keep main actions visible: `Plan campaign`, `Launch campaign`, `Refresh`.
- Make artifact gallery more prominent after launch.
- If video artifact status is not ready, show clear copy:
  - “Video rendering. Use Check status until completed.”
  - Do not show a playable `<video>` until status is ready or `storageUrl` is present.

## README State

`README.md` was updated to document:

- video env flags
- launch emits video metadata
- experimental video route
- status/download route
- `/api/experimental/video` useful route

Needs another pass after final UI/persistence verification.

## Immediate Next Tasks

1. Stop duplicate dev servers and restart one server.
2. Finish CSS for artifact media and editable question cards.
3. Run:

```powershell
pnpm typecheck
pnpm build
```

4. Apply Supabase migration:

```powershell
supabase db push
```

5. Launch a mock campaign with video enabled.
6. Inspect:

```text
http://127.0.0.1:3000/api/audit
http://127.0.0.1:3000/api/runs?runId=<RUN_ID>
```

7. Confirm artifacts:

- image artifact has `storageUrl`
- video artifact has `metadata.openaiVideoId` or a useful failure reason
- `campaign_artifacts` table has rows

8. Confirm UI:

- image appears in creative preview and artifact card
- queued video appears as status card with `Check status`
- ready video renders as `<video controls>`
- clarification answers are editable before launch

## Known Risks

- OpenAI video access may fail depending on account/model availability.
- Video generation may be slow; launch should not wait for completion.
- If using different ports, relative artifact URLs must be opened on the same server port.
- Supabase migration must be applied before `campaign_artifacts` persistence works.
- Generated image data URLs stored in Postgres JSON can be large. Good enough for hackathon; later move media blobs to Supabase Storage.

