import { fetchYouTubeTranscript } from "../_lib/transcript.js";

function getVideoId(req: any): string {
  const queryVideoId = typeof req.query?.videoId === "string" ? req.query.videoId.trim() : "";
  if (queryVideoId) {
    return queryVideoId;
  }
  if (req.body && typeof req.body === "object" && typeof req.body.videoId === "string") {
    return req.body.videoId.trim();
  }
  if (typeof req.body === "string") {
    try {
      const parsed = JSON.parse(req.body) as { videoId?: unknown };
      if (typeof parsed.videoId === "string") {
        return parsed.videoId.trim();
      }
    } catch {
      // ignore malformed JSON body
    }
  }
  return "";
}

function isValidVideoId(value: string): boolean {
  return /^[A-Za-z0-9_-]{6,20}$/.test(value);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const videoId = getVideoId(req);
  if (!videoId || !isValidVideoId(videoId)) {
    res.status(400).json({ error: "Invalid videoId." });
    return;
  }

  try {
    const payload = await fetchYouTubeTranscript(videoId);
    res.status(200).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch transcript.";
    if (/transcript|caption|subtitles|disabled|unavailable|not available/i.test(message)) {
      res.status(404).json({ error: "No transcript available." });
      return;
    }
    res.status(502).json({ error: `Transcript fetch failed: ${message}` });
  }
}
