import { fetchViewCountsByVideoIds } from "../_lib/youtube";

function parseVideoIds(req: any): string[] {
  const bodyIds = Array.isArray(req.body?.videoIds) ? req.body.videoIds : null;
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

    const data = await fetchViewCountsByVideoIds(videoIds);
    res.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch view counts.";
    res.status(400).json({ error: message });
  }
}
