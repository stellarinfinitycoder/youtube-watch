import { requireAdminSession } from "../../_lib/publisher-auth.js";
import { listPublishedItems } from "../../_lib/publisher-store.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!requireAdminSession(req, res)) {
    return;
  }

  try {
    const items = await listPublishedItems();
    res.status(200).json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch published items.";
    res.status(500).json({ error: message });
  }
}
