import { requireAdminSession } from "../_lib/publisher-auth.js";
import { upsertPublishedItem } from "../_lib/publisher-store.js";

function parseBody(req: any): Record<string, unknown> {
  if (req.body && typeof req.body === "object") {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === "string") {
    try {
      const parsed = JSON.parse(req.body) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore malformed JSON
    }
  }
  return {};
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!requireAdminSession(req, res)) {
    return;
  }

  const body = parseBody(req);
  const videoId = typeof body.videoId === "string" ? body.videoId.trim() : "";
  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  const thumbnailUrl = typeof body.thumbnailUrl === "string" ? body.thumbnailUrl.trim() : "";
  const channelTitle = typeof body.channelTitle === "string" ? body.channelTitle.trim() : "";
  const publishedAt = typeof body.publishedAt === "string" ? body.publishedAt.trim() : "";
  const durationSeconds =
    typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds)
      ? Math.max(0, Math.floor(body.durationSeconds))
      : null;
  const viewCount =
    typeof body.viewCount === "number" && Number.isFinite(body.viewCount)
      ? Math.max(0, Math.floor(body.viewCount))
      : null;

  if (!videoId || !videoUrl || !title || !publishedAt) {
    res.status(400).json({ error: "Missing required fields." });
    return;
  }
  if (!summary) {
    res.status(400).json({ error: "Summary is required for publish." });
    return;
  }

  try {
    const item = await upsertPublishedItem({
      videoId,
      videoUrl,
      title,
      summary,
      thumbnailUrl,
      channelTitle,
      publishedAt,
      durationSeconds,
      viewCount,
      publishedBy: "admin"
    });
    res.status(200).json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to publish.";
    res.status(500).json({ error: message });
  }
}
