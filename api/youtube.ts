import {
  fetchLatestVideos,
  fetchUploadsPlaylistPage,
  fetchVideoStatsByVideoIds,
  fetchViewCountsByVideoIds,
  getLatestVideosAndChannelByHandle,
  normalizeHandle,
  resolveChannelByHandleWithThumbnail,
  resolveChannelByInputWithThumbnail
} from "./_lib/youtube.js";
import { fetchYouTubeTranscript } from "./_lib/transcript.js";

const ALLOWED_AVATAR_HOST_SUFFIXES = [
  ".googleusercontent.com",
  ".ggpht.com",
  ".ytimg.com"
];

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

function getRoute(req: any): string {
  const route = req.query?.route;
  const value = Array.isArray(route) ? route.join("/") : String(route ?? "");
  return value.replace(/^\/+|\/+$/g, "");
}

function parseLimit(raw: unknown, fallback: number): number {
  const parsed = Number(raw ?? fallback);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.min(50, Math.floor(parsed)));
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

function isAllowedAvatarUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  return ALLOWED_AVATAR_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix)
  );
}

function getTranscriptVideoId(req: any): string {
  const queryVideoId = typeof req.query?.videoId === "string" ? req.query.videoId.trim() : "";
  if (queryVideoId) {
    return queryVideoId;
  }
  const body = parseBody(req);
  if (typeof body.videoId === "string") {
    return body.videoId.trim();
  }
  return "";
}

function isValidVideoId(value: string): boolean {
  return /^[A-Za-z0-9_-]{6,20}$/.test(value);
}

async function handleResolve(req: any, res: any): Promise<void> {
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

async function handleResolveInput(req: any, res: any): Promise<void> {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = parseBody(req);
    const input =
      req.method === "POST" ? String(body.input ?? "") : String(req.query.input ?? "");
    const data = await resolveChannelByInputWithThumbnail(input);
    res.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve channel.";
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ error: message });
  }
}

async function handleLatest(req: any, res: any): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const handle = normalizeHandle(String(req.query.handle ?? ""));
    const limit = parseLimit(req.query.limit, 25);
    const data = await getLatestVideosAndChannelByHandle(handle, limit);
    res.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch latest videos.";
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ error: message });
  }
}

async function handleLatestByChannel(req: any, res: any): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const channelId = String(req.query.channelId ?? "").trim();
    if (!channelId) {
      throw new Error("channelId is required.");
    }
    const limit = parseLimit(req.query.limit, 25);
    const videos = await fetchLatestVideos(channelId, limit);
    res.status(200).json({ videos });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch latest videos.";
    res.status(400).json({ error: message });
  }
}

async function handleDiscoverByPlaylist(req: any, res: any): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const uploadsPlaylistId = String(req.query.uploadsPlaylistId ?? "").trim();
    if (!uploadsPlaylistId) {
      throw new Error("uploadsPlaylistId is required.");
    }
    const pageToken = String(req.query.pageToken ?? "").trim();
    const limit = parseLimit(req.query.limit, 50);
    const data = await fetchUploadsPlaylistPage(uploadsPlaylistId, pageToken, limit);
    res.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to discover latest videos.";
    res.status(400).json({ error: message });
  }
}

async function handleViewCounts(req: any, res: any): Promise<void> {
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

async function handleChannelAvatar(req: any, res: any): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const sourceUrl = String(req.query.url ?? "").trim();
  if (!sourceUrl || !isAllowedAvatarUrl(sourceUrl)) {
    res.status(400).json({ error: "Invalid channel avatar URL." });
    return;
  }

  try {
    const upstream = await fetch(sourceUrl, {
      headers: {
        "User-Agent": "Youtube-Watch-Avatar-Proxy/1.0"
      }
    });

    if (!upstream.ok) {
      res.status(502).json({ error: "Failed to fetch upstream avatar." });
      return;
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const cacheControl =
      upstream.headers.get("cache-control") ||
      "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";
    const body = Buffer.from(await upstream.arrayBuffer());

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", cacheControl);
    res.setHeader("Content-Length", String(body.length));
    res.status(200).send(body);
  } catch {
    res.status(502).json({ error: "Failed to fetch upstream avatar." });
  }
}

async function handleTranscript(req: any, res: any): Promise<void> {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const videoId = getTranscriptVideoId(req);
  if (!videoId || !isValidVideoId(videoId)) {
    res.status(400).json({ error: "Invalid videoId." });
    return;
  }

  try {
    const payload = await fetchYouTubeTranscript(videoId);
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

export default async function handler(req: any, res: any): Promise<void> {
  const route = getRoute(req);

  if (route === "resolve") {
    await handleResolve(req, res);
    return;
  }
  if (route === "resolve-input") {
    await handleResolveInput(req, res);
    return;
  }
  if (route === "latest") {
    await handleLatest(req, res);
    return;
  }
  if (route === "latest-by-channel") {
    await handleLatestByChannel(req, res);
    return;
  }
  if (route === "discover-by-playlist") {
    await handleDiscoverByPlaylist(req, res);
    return;
  }
  if (route === "view-counts") {
    await handleViewCounts(req, res);
    return;
  }
  if (route === "channel-avatar") {
    await handleChannelAvatar(req, res);
    return;
  }
  if (route === "transcript") {
    await handleTranscript(req, res);
    return;
  }

  res.status(404).json({ error: "Not found." });
}
