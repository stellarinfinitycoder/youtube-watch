import { fetchUploadsPlaylistPage } from "../_lib/youtube.js";

function parseLimit(raw: unknown): number {
  const parsed = Number(raw ?? 50);
  if (!Number.isFinite(parsed)) {
    return 50;
  }
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const uploadsPlaylistId = String(req.query.uploadsPlaylistId ?? "").trim();
    if (!uploadsPlaylistId) {
      throw new Error("uploadsPlaylistId is required.");
    }
    const pageToken = String(req.query.pageToken ?? "").trim();
    const limit = parseLimit(req.query.limit);
    const data = await fetchUploadsPlaylistPage(uploadsPlaylistId, pageToken, limit);
    res.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to discover latest videos.";
    res.status(400).json({ error: message });
  }
}
