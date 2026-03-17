import { fetchVideoStatsByVideoIds, fetchViewCountsByVideoIds } from "../_lib/youtube.js";

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
      // Ignore malformed body.
    }
  }
  return {};
}

function parseVideoIds(req: any): string[] {
  const body = parseBody(req);
  const bodyIds = Array.isArray(body.videoIds) ? body.videoIds : null;
  if (bodyIds) {
    return bodyIds.filter(
      (id: unknown): id is string => typeof id === "string" && id.length > 0
    );
  }

  const queryIdsRaw = String(req.query.videoIds ?? "");
  if (!queryIdsRaw) {
    return [];
  }

  return queryIdsRaw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function parseIncludeDuration(req: any): boolean {
  const body = parseBody(req);
  const bodyValue = body.includeDuration;
  const queryValue = req.query?.includeDuration;
  const normalize = (value: unknown): boolean =>
    value === true ||
    value === "true" ||
    (Array.isArray(value) && value.some((item) => item === true || item === "true"));
  return normalize(bodyValue) || normalize(queryValue);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const videoIds = parseVideoIds(req);
    if (videoIds.length === 0) {
      res.status(200).json({});
      return;
    }

    const includeDuration = req.method === "GET" ? true : parseIncludeDuration(req);
    const data = includeDuration
      ? await fetchVideoStatsByVideoIds(videoIds)
      : await fetchViewCountsByVideoIds(videoIds);
    res.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch view counts.";
    res.status(400).json({ error: message });
  }
}
