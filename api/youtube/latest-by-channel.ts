import { fetchLatestVideos } from "../_lib/youtube.js";

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
    const channelId = String(req.query.channelId ?? "").trim();
    if (!channelId) {
      throw new Error("channelId is required.");
    }
    const limit = parseLimit(req.query.limit);
    const videos = await fetchLatestVideos(channelId, limit);
    res.status(200).json({ videos });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch latest videos.";
    res.status(400).json({ error: message });
  }
}
