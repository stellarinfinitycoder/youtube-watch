import {
  clearAdminSession,
  issueAdminSession,
  requireAdminSession
} from "../_lib/publisher-auth.js";
import {
  deletePublishedItem,
  getPublishedItem,
  listPublishedItems,
  updatePublishedItem,
  upsertPublishedItem
} from "../_lib/publisher-store.js";

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

function getRouteParts(req: any): string[] {
  const raw = req.query?.route;
  if (Array.isArray(raw)) {
    return raw.map((part) => String(part ?? "").trim()).filter((part) => part.length > 0);
  }
  const single = String(raw ?? "").trim();
  return single ? [single] : [];
}

export default async function handler(req: any, res: any) {
  const method = String(req.method || "").toUpperCase();
  const parts = getRouteParts(req);

  if (parts.length === 1 && parts[0] === "login") {
    if (method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const configuredPassword = String(process.env.PUBLISHER_ADMIN_PASSWORD ?? "").trim();
    if (!configuredPassword) {
      res.status(500).json({ error: "Missing PUBLISHER_ADMIN_PASSWORD." });
      return;
    }
    const body = parseBody(req);
    const password = typeof body.password === "string" ? body.password : "";
    if (password !== configuredPassword) {
      res.status(401).json({ error: "Invalid password." });
      return;
    }
    try {
      issueAdminSession(res);
      res.status(200).json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create session.";
      res.status(500).json({ error: message });
    }
    return;
  }

  if (parts.length === 1 && parts[0] === "logout") {
    if (method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    clearAdminSession(res);
    res.status(200).json({ ok: true });
    return;
  }

  if (parts.length === 1 && parts[0] === "publish") {
    if (method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    if (!requireAdminSession(req, res)) {
      return;
    }
    const body = parseBody(req);
    const videoId = typeof body.videoId === "string" ? body.videoId.trim() : "";
    const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const summary = typeof body.summary === "string" ? body.summary.trim() : "";
    const thumbnailUrl = typeof body.thumbnailUrl === "string" ? body.thumbnailUrl.trim() : "";
    const channelTitle = typeof body.channelTitle === "string" ? body.channelTitle.trim() : "";
    const publishedAt = typeof body.publishedAt === "string" ? body.publishedAt.trim() : "";
    const durationSeconds =
      typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds)
        ? Math.max(0, Math.floor(body.durationSeconds))
        : null;
    const viewCount =
      typeof body.viewCount === "number" && Number.isFinite(body.viewCount)
        ? Math.max(0, Math.floor(body.viewCount))
        : null;

    if (!videoId || !videoUrl || !title || !publishedAt) {
      res.status(400).json({ error: "Missing required fields." });
      return;
    }
    if (!summary) {
      res.status(400).json({ error: "Summary is required for publish." });
      return;
    }

    try {
      const item = await upsertPublishedItem({
        videoId,
        videoUrl,
        title,
        summary,
        thumbnailUrl,
        channelTitle,
        publishedAt,
        durationSeconds,
        viewCount,
        publishedBy: "admin"
      });
      res.status(200).json(item);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to publish.";
      res.status(500).json({ error: message });
    }
    return;
  }

  if (parts.length === 1 && parts[0] === "items") {
    if (method !== "GET") {
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
    return;
  }

  if (parts.length === 2 && parts[0] === "items") {
    if (!requireAdminSession(req, res)) {
      return;
    }
    const id = parts[1];
    if (!id) {
      res.status(400).json({ error: "Missing item id." });
      return;
    }

    if (method === "PATCH") {
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
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update item.";
        res.status(500).json({ error: message });
      }
      return;
    }

    if (method === "DELETE") {
      try {
        const existing = await getPublishedItem(id);
        if (!existing) {
          res.status(404).json({ error: "Published item not found." });
          return;
        }
        await deletePublishedItem(id);
        res.status(200).json({ ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete item.";
        res.status(500).json({ error: message });
      }
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (parts.length === 1 && parts[0] === "public") {
    if (method !== "GET") {
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
    return;
  }

  if (parts.length === 2 && parts[0] === "public") {
    if (method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const id = parts[1];
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
    return;
  }

  res.status(404).json({ error: "Not found." });
}
