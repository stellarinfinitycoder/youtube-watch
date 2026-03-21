# APIFY Transcript Feature Plan (v1)

## Goal
Add on-demand transcript retrieval for a video via Apify, triggered from the video modal with a `T` button. In transcript mode, show transcript content inside the same modal instead of the video.

## Scope (v1)
- Add secure backend endpoint to fetch transcript via Apify.
- Add `T` button in video modal to open/toggle transcript mode.
- Show transcript in same modal body (video hidden while transcript is shown).
- Add loading/error/empty/success states.
- Cache transcript by `videoId + language` to reduce repeated API calls.

## Architecture

### 1. Backend endpoint (required)
- Add `POST /api/transcript` (Vercel serverless function in this repo).
- Request payload:
  - `videoId` (or full URL)
  - optional `lang`
- Server uses Apify token from environment.
- Return normalized transcript object.

### 2. Apify integration
- Pick one transcript-capable YouTube actor.
- Execute actor run and poll until completion.
- Read dataset/output and normalize to a stable contract:
  - `text` (full transcript)
  - `segments[]` with `{ startSec, endSec, text }`
  - `language`
  - `source` (`captions` / `generated`)

### 3. Frontend modal behavior
- Add `T` button in current modal controls.
- Add view mode state:
  - `video`
  - `transcript`
- In transcript mode:
  - hide video player container
  - show scrollable transcript panel

### 4. UI states in transcript mode
- Loading: `FETCHING TRANSCRIPT...`
- Success: render transcript text/segments
- Empty: `NO TRANSCRIPT`
- Error: short red error text

### 5. Caching
- Cache transcript in local storage by `videoId + language`.
- Use cached value before calling API.
- Add TTL (suggested: 7 days) or refresh behavior in later version.

### 6. Security
- Keep `APIFY_TOKEN` server-side only.
- Do not expose token in client bundle.
- Frontend calls only `/api/transcript`.

### 7. Reliability/cost controls
- Basic rate limit/throttle on endpoint.
- Timeout and retry limits when polling Apify run.
- Error logging for failed transcript requests.

## Suggested implementation order
1. Backend endpoint + env wiring
2. Apify actor call + run polling + normalization
3. Frontend `T` button + modal transcript mode
4. Loading/error/empty/success rendering
5. Local transcript cache
6. Polish + edge-case handling

## Rough effort
- Backend + Apify integration: 2-4 hours
- Modal transcript UI: 1-2 hours
- Cache + polish: 1-2 hours
- Total: ~1 short day

## Main risk
Apify actor output consistency/format differences between videos/languages.
