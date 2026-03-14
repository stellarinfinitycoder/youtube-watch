import { normalizeHandle, resolveChannelByHandleWithThumbnail } from "../_lib/youtube.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const handle = normalizeHandle(String(req.query.handle ?? ""));
    const data = await resolveChannelByHandleWithThumbnail(handle);
    res.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve channel.";
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ error: message });
  }
}
