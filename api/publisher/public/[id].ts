import { getPublishedItem } from "../../_lib/publisher-store.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const id = String(req.query?.id ?? "").trim();
  if (!id) {
    res.status(400).json({ error: "Missing item id." });
    return;
  }

  try {
    const item = await getPublishedItem(id);
    if (!item) {
      res.status(404).json({ error: "Published item not found." });
      return;
    }
    res.status(200).json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch published item.";
    res.status(500).json({ error: message });
  }
}
