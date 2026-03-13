import { getLatestVideosAndChannelByHandle, normalizeHandle } from "../_lib/youtube";

function parseLimit(raw: unknown): number {
  const parsed = Number(raw ?? 25);
  if (!Number.isFinite(parsed)) {
    return 25;
  }
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const handle = normalizeHandle(String(req.query.handle ?? ""));
    const limit = parseLimit(req.query.limit);
    const data = await getLatestVideosAndChannelByHandle(handle, limit);
    res.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch latest videos.";
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ error: message });
  }
}
