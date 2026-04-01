import { listPublishedItems } from "../../_lib/publisher-store.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const limitRaw = String(req.query?.limit ?? "").trim();
  const limit =
    limitRaw.length > 0 && Number.isFinite(Number(limitRaw))
      ? Math.max(1, Math.floor(Number(limitRaw)))
      : undefined;
  try {
    const items = await listPublishedItems(limit);
    res.status(200).json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch public items.";
    res.status(500).json({ error: message });
  }
}
