import { requireAdminSession } from "../../_lib/publisher-auth.js";
import {
  deletePublishedItem,
  getPublishedItem,
  updatePublishedItem
} from "../../_lib/publisher-store.js";

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
  if (!requireAdminSession(req, res)) {
    return;
  }

  const id = String(req.query?.id ?? "").trim();
  if (!id) {
    res.status(400).json({ error: "Missing item id." });
    return;
  }

  if (req.method === "PATCH") {
    const body = parseBody(req);
    const title = typeof body.title === "string" ? body.title.trim() : undefined;
    const summary = typeof body.summary === "string" ? body.summary.trim() : undefined;
    if (!title && !summary) {
      res.status(400).json({ error: "No update fields provided." });
      return;
    }
    try {
      const next = await updatePublishedItem(id, { title, summary });
      if (!next) {
        res.status(404).json({ error: "Published item not found." });
        return;
      }
      res.status(200).json(next);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update item.";
      res.status(500).json({ error: message });
      return;
    }
  }

  if (req.method === "DELETE") {
    try {
      const existing = await getPublishedItem(id);
      if (!existing) {
        res.status(404).json({ error: "Published item not found." });
        return;
      }
      await deletePublishedItem(id);
      res.status(200).json({ ok: true });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete item.";
      res.status(500).json({ error: message });
      return;
    }
  }

  res.status(405).json({ error: "Method not allowed" });
}
