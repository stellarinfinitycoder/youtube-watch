# PROJECT_ARCHITECTURE_SHORT.md

Short reference architecture guide for this repository.
For setup/deploy steps, see [README.md](./README.md).

## System Overview

- Frontend runtime is a Vite React TypeScript app.
- Route-gated entrypoint is `src/main.tsx`.
- Route mapping:
1. `/` -> main app (`src/App.tsx`)
2. `/admin/rssfeed` and `/admin/publisher` -> publisher admin page (`src/pages/PublisherAdminPage.tsx`)
3. `/news` and `/news/*` -> public news page (`src/pages/PublicNewsPage.tsx`)

## Runtime Boundaries

- Browser UI, state, and client orchestration live in `src/*`.
- Server/API handlers live in `api/*`; YouTube subroutes are dispatched by `api/youtube.ts`.
- Shared server helpers live in `api/_lib/*`.
- External integrations:
1. YouTube endpoints (channel/video metadata and transcript sources)
2. OpenRouter (summary generation)
3. Vercel KV (publisher storage)

## Frontend Structure

- `src/domain/*`: pure business rules and data transforms.
- `src/storage/*`: local persistence and state normalization.
- `src/api/*`: browser-to-server API wrappers and fetch/error handling.
- `src/components/*` and `src/pages/*`: UI composition and route surfaces.
- `src/hooks/*`: stateful workflows reused by UI.

## Data Flows

- Channel/video discovery:
1. UI actions in app/components
2. `src/api/youtube.ts`
3. `api/youtube.ts`
4. YouTube endpoints

- Transcript and summary:
1. UI actions in app/modal flows
2. `src/api/youtube.ts`
3. `api/transcript.ts` or `api/summarize.ts`
4. `api/_lib/transcript.ts` and/or OpenRouter

- Publisher flow:
1. Admin UI (`src/pages/PublisherAdminPage.tsx`)
2. `src/api/publisher.ts`
3. `api/publisher.ts`
4. `api/_lib/publisher-store.ts` (Vercel KV)

## State And Persistence

- Board-centric runtime state is managed in the frontend and persisted via `src/storage/*`.
- Heavy transcript and summary caches are stored client-side in IndexedDB.
- Lightweight UI state such as boards, active board id, formats, and small preferences remains in `localStorage`.
- Domain modules should remain side-effect-light and deterministic.
- API handlers own server-side validation, auth checks, and integration boundaries.

## Operational Constraints

- Secrets and API keys must remain server-side (`process.env` in API handlers), not exposed to client bundles.
- API routes must validate inputs and return stable JSON failure payloads (`{ error: string }`).
- `src/App.tsx` is already large; prefer extracting logic into `src/domain`, `src/hooks`, `src/components`, or `src/storage` instead of adding monolithic blocks.

## Change Rules

- Update this file when changes affect:
1. route surfaces/entrypoint routing behavior
2. data ownership boundaries (`src` vs `api` vs `api/_lib`)
3. persistence model or storage responsibilities
4. API boundaries, handler responsibilities, or core integration paths
