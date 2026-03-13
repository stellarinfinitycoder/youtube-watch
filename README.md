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
```

## Run

```bash
npm run dev
```

`npm run dev` includes local `/api/youtube/*` dev routes via Vite middleware, using `YOUTUBE_API_KEY` from `.env`.

## Deploy (Vercel)

Set environment variable in Vercel project:

- `YOUTUBE_API_KEY`

The key is used server-side only and is not exposed to browser clients.

## Test

```bash
npm run test
```

## Notes

- Input format is strictly `@handle`.
- Latest 25 videos are loaded by resolving handle -> channel ID -> uploads playlist -> playlist items.
- Refresh is manual.
