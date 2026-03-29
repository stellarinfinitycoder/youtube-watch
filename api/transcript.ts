import { fetchYouTubeTranscript } from "./_lib/transcript.js";

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

function parseVideoInput(req: any): string {
  const body = parseBody(req);
  const queryVideoId = String(req.query?.videoId ?? "").trim();
  const queryUrl = String(req.query?.url ?? "").trim();
  if (queryVideoId) {
    return queryVideoId;
  }
  if (queryUrl) {
    return queryUrl;
  }
  if (typeof body.videoId === "string" && body.videoId.trim()) {
    return body.videoId.trim();
  }
  if (typeof body.url === "string" && body.url.trim()) {
    return body.url.trim();
  }
  return "";
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const input = parseVideoInput(req);
  if (!input) {
    res.status(400).json({ error: "Missing videoId or url." });
    return;
  }

  try {
    const payload = await fetchYouTubeTranscript(input);
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
