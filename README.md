# YouTube Watch

A React + TypeScript + Ant Design app (Vite) that fetches and displays the latest 25 videos for a YouTube channel handle (`@name`) using YouTube Data API.

## Stack

- React
- TypeScript
- Ant Design
- Vite
- Vercel API routes (server-side YouTube proxy)
- Vitest + Testing Library

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env
```

3. Add your server API key:

```env
YOUTUBE_API_KEY=your_youtube_data_api_key_here
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_DEFAULT_MODEL=openai/gpt-4o-mini
PUBLISHER_ADMIN_PASSWORD=your_admin_password_here
PUBLISHER_SESSION_SECRET=your_random_session_secret_here
KV_REST_API_URL=your_vercel_kv_rest_url
KV_REST_API_TOKEN=your_vercel_kv_rest_token
PUBLIC_SITE_URL=https://your-domain.com
```

## Run

```bash
npm run dev
```

`npm run dev` includes local `/api/youtube/*` dev routes via Vite middleware, using `YOUTUBE_API_KEY` from `.env`.

## Deploy (Vercel)

Set environment variable in Vercel project:

- `YOUTUBE_API_KEY`
- `OPENROUTER_API_KEY`
- `OPENROUTER_DEFAULT_MODEL` (optional)
- `PUBLISHER_ADMIN_PASSWORD`
- `PUBLISHER_SESSION_SECRET`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `PUBLIC_SITE_URL` (for RSS links)

Publisher surfaces:

- Admin: `/admin/rssfeed`
- Public news: `/news`
- Public RSS: `/rss.xml`

The key is used server-side only and is not exposed to browser clients.

## Test

```bash
npm run test
```

## Fixture Mode (Deterministic)

Use fixture mode for stable local checks without API variability:

```text
http://localhost:5173/?fixture=1
```

In this mode, data is loaded from:

- `src/fixtures/fixture-boards.json`

and fetch actions use fixture data (no external API calls).

## Verify Pipeline

Run one command before deploy:

```bash
npm run verify
```

This runs:

- TypeScript lint check
- Unit tests (`src/utils/handle.test.ts`, `src/api/youtube.test.ts`)
- Playwright smoke suite (`tests/smoke.spec.ts`)

## Notes

- Input format is strictly `@handle`.
- Latest 25 videos are loaded by resolving handle -> channel ID -> uploads playlist -> playlist items.
- Refresh is manual.
