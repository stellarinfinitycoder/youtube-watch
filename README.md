# YouTube Watch

A React + TypeScript + Ant Design app (Vite) that fetches and displays the latest 15 videos for a YouTube channel handle (`@name`) using the YouTube Data API.

## Stack

- React
- TypeScript
- Ant Design
- Vite
- Vitest + Testing Library

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create an environment file:

```bash
cp .env.example .env
```

3. Put your key in `.env`:

```env
VITE_YOUTUBE_API_KEY=your_youtube_data_api_key_here
```

## Run

```bash
npm run dev
```

## Test

```bash
npm run test
```

## Notes

- Input format is strictly `@handle`.
- Latest 15 videos are loaded by resolving channel handle -> channel ID -> uploads playlist -> playlist items.
- Refresh is manual via the **Refresh** button.
- This implementation is frontend-only, so `VITE_YOUTUBE_API_KEY` is exposed in browser network requests.
