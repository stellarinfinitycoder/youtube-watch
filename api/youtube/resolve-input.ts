import { resolveChannelByInputWithThumbnail } from "../_lib/youtube.js";

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const input =
      req.method === "POST"
        ? String((req.body as { input?: unknown } | undefined)?.input ?? "")
        : String(req.query.input ?? "");
    const data = await resolveChannelByInputWithThumbnail(input);
    res.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve channel.";
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ error: message });
  }
}
