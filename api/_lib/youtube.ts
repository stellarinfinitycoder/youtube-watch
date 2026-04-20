export type VideoItem = {
  videoId: string;
  title: string;
  publishedAt: string;
  durationSeconds?: number | null;
  embeddable?: boolean;
  thumbnailUrl: string;
  channelTitle: string;
  videoUrl: string;
  viewCount: number | null;
};

type ChannelByHandleResponse = {
  items?: Array<{
    id?: string;
    contentDetails?: {
      relatedPlaylists?: {
        uploads?: string;
      };
    };
    snippet?: {
      thumbnails?: {
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
  }>;
};

type ChannelSnippetByIdResponse = {
  items?: Array<{
    snippet?: {
      thumbnails?: {
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
  }>;
};

type ChannelDetailsResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      customUrl?: string;
      thumbnails?: {
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
    contentDetails?: {
      relatedPlaylists?: {
        uploads?: string;
      };
    };
  }>;
};

type VideoByIdResponse = {
  items?: Array<{
    snippet?: {
      channelId?: string;
    };
  }>;
};

type PlaylistItemsResponse = {
  items?: PlaylistItem[];
  nextPageToken?: string;
};

type PlaylistSnippet = {
  title?: string;
  channelTitle?: string;
  publishedAt?: string;
  resourceId?: {
    videoId?: string;
  };
  thumbnails?: {
    maxres?: { url?: string };
    standard?: { url?: string };
    high?: { url?: string };
    medium?: { url?: string };
    default?: { url?: string };
  };
};

type PlaylistItem = {
  snippet?: PlaylistSnippet;
};

type VideoStatisticsResponse = {
  items?: Array<{
    id?: string;
    statistics?: {
      viewCount?: string;
    };
  }>;
};

type VideoMetadataResponse = {
  items?: Array<{
    id?: string;
    statistics?: {
      viewCount?: string;
    };
    contentDetails?: {
      duration?: string;
    };
    snippet?: {
      thumbnails?: {
        maxres?: { url?: string };
        standard?: { url?: string };
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
    status?: {
      embeddable?: boolean;
    };
  }>;
};

type VideoSnippet = {
  thumbnails?: {
    maxres?: { url?: string };
    standard?: { url?: string };
    high?: { url?: string };
    medium?: { url?: string };
    default?: { url?: string };
  };
};

type ViewCountMap = Record<string, number>;
type VideoMetadataMap = Record<
  string,
  {
    viewCount?: number;
    durationSeconds?: number;
    thumbnailUrl?: string;
    embeddable?: boolean;
  }
>;

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

function getApiKey(): string {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing YOUTUBE_API_KEY on server.");
  }
  return apiKey;
}

function buildUrl(path: string, params: Record<string, string | number>): string {
  const url = new URL(`${YOUTUBE_API_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  };

  if (!response.ok) {
    const apiMessage = payload.error?.message ?? `Request failed (${response.status})`;
    throw new Error(apiMessage);
  }

  return payload as T;
}

function pickThumbnailUrl(snippet?: PlaylistSnippet): string {
  return (
    snippet?.thumbnails?.maxres?.url ??
    snippet?.thumbnails?.standard?.url ??
    snippet?.thumbnails?.high?.url ??
    snippet?.thumbnails?.medium?.url ??
    snippet?.thumbnails?.default?.url ??
    ""
  );
}

function pickVideoSnippetThumbnailUrl(snippet?: VideoSnippet): string {
  return (
    snippet?.thumbnails?.maxres?.url ??
    snippet?.thumbnails?.standard?.url ??
    snippet?.thumbnails?.high?.url ??
    snippet?.thumbnails?.medium?.url ??
    snippet?.thumbnails?.default?.url ??
    ""
  );
}

function normalizeImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (trimmed.startsWith("http://")) {
    return `https://${trimmed.slice("http://".length)}`;
  }
  return trimmed;
}

function mapPlaylistItemToVideoItem(item: PlaylistItem): VideoItem | null {
  const snippet = item.snippet;
  const videoId = snippet?.resourceId?.videoId;

  if (!snippet || !videoId) {
    return null;
  }

  return {
    videoId,
    title: snippet.title ?? "Untitled video",
    publishedAt: snippet.publishedAt ?? "",
    durationSeconds: null,
    thumbnailUrl: normalizeImageUrl(pickThumbnailUrl(snippet)),
    channelTitle: snippet.channelTitle ?? "",
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    viewCount: null
  };
}

function parseIsoDurationToSeconds(value: string | undefined): number | undefined {
  if (!value || typeof value !== "string") {
    return undefined;
  }
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(value);
  if (!match) {
    return undefined;
  }
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  if (![hours, minutes, seconds].every((part) => Number.isFinite(part))) {
    return undefined;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

export function stripHandlePrefix(input: string): string {
  return input.startsWith("@") ? input.slice(1) : input;
}

export function normalizeHandle(input: string): string {
  const raw = input.trim();
  if (!raw) {
    throw new Error("Handle is required in @name format.");
  }

  const prefixed = raw.startsWith("@") ? raw : `@${raw}`;
  const handle = stripHandlePrefix(prefixed);
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(handle)) {
    throw new Error("Invalid handle format. Use @name.");
  }

  return `@${handle}`;
}

export async function resolveChannelByHandleWithThumbnail(
  handle: string
): Promise<{
  channelId: string;
  channelThumbnailUrl: string;
  uploadsPlaylistId: string;
}> {
  const apiKey = getApiKey();
  const normalized = normalizeHandle(handle);
  const cleanHandle = stripHandlePrefix(normalized);

  const url = buildUrl("/channels", {
    part: "id,snippet,contentDetails",
    forHandle: cleanHandle,
    key: apiKey
  });

  const data = await fetchJson<ChannelByHandleResponse>(url);
  const channel = data.items?.[0];
  const channelId = channel?.id;

  if (!channelId) {
    throw new Error(`Channel not found for handle ${normalized}.`);
  }
  const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    throw new Error("Uploads playlist not found for this channel.");
  }

  let channelThumbnailUrl =
    channel?.snippet?.thumbnails?.high?.url ??
    channel?.snippet?.thumbnails?.medium?.url ??
    channel?.snippet?.thumbnails?.default?.url ??
    "";

  if (!channelThumbnailUrl) {
    const snippetUrl = buildUrl("/channels", {
      part: "snippet",
      id: channelId,
      key: apiKey
    });
    const snippetData = await fetchJson<ChannelSnippetByIdResponse>(snippetUrl);
    const snippet = snippetData.items?.[0]?.snippet;
    channelThumbnailUrl =
      snippet?.thumbnails?.high?.url ??
      snippet?.thumbnails?.medium?.url ??
      snippet?.thumbnails?.default?.url ??
      "";
  }

  const normalizedThumbnailUrl = normalizeImageUrl(channelThumbnailUrl);
  return {
    channelId,
    channelThumbnailUrl: normalizedThumbnailUrl,
    uploadsPlaylistId
  };
}

function extractYouTubeVideoId(input: string): string | null {
  const raw = input
    .trim()
    .replace(/^[<(\["']+/, "")
    .replace(/[>)\]"',.;:!?]+$/, "");
  if (!raw) {
    return null;
  }

  const directVideoIdMatch = raw.match(/^[A-Za-z0-9_-]{11}$/);
  if (directVideoIdMatch) {
    return raw;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const isYouTubeHost =
    host === "youtube.com" ||
    host === "www.youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtu.be" ||
    host === "www.youtu.be";
  if (!isYouTubeHost) {
    return null;
  }

  if (host.includes("youtu.be")) {
    const segment = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return /^[A-Za-z0-9_-]{11}$/.test(segment) ? segment : null;
  }

  const watchId = url.searchParams.get("v") ?? "";
  if (/^[A-Za-z0-9_-]{11}$/.test(watchId)) {
    return watchId;
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const shortsIndex = parts.findIndex((part) => part === "shorts");
  if (shortsIndex >= 0) {
    const maybeId = parts[shortsIndex + 1] ?? "";
    return /^[A-Za-z0-9_-]{11}$/.test(maybeId) ? maybeId : null;
  }

  const embedIndex = parts.findIndex((part) => part === "embed");
  if (embedIndex >= 0) {
    const maybeId = parts[embedIndex + 1] ?? "";
    return /^[A-Za-z0-9_-]{11}$/.test(maybeId) ? maybeId : null;
  }

  return null;
}

export async function resolveChannelByInputWithThumbnail(input: string): Promise<{
  normalizedHandle: string;
  channelId: string;
  channelThumbnailUrl: string;
  uploadsPlaylistId: string;
  resolutionType: "handle" | "video";
}> {
  const raw = input.trim();
  if (!raw) {
    throw new Error("Channel not found.");
  }

  try {
    const normalizedHandle = normalizeHandle(raw);
    const data = await resolveChannelByHandleWithThumbnail(normalizedHandle);
    return {
      normalizedHandle,
      channelId: data.channelId,
      channelThumbnailUrl: data.channelThumbnailUrl,
      uploadsPlaylistId: data.uploadsPlaylistId,
      resolutionType: "handle"
    };
  } catch {
    // Fall through to video-link resolution.
  }

  const videoId = extractYouTubeVideoId(raw);
  if (!videoId) {
    throw new Error("Channel not found.");
  }

  const apiKey = getApiKey();
  const videoUrl = buildUrl("/videos", {
    part: "snippet",
    id: videoId,
    key: apiKey
  });
  const videoData = await fetchJson<VideoByIdResponse>(videoUrl);
  const channelId = videoData.items?.[0]?.snippet?.channelId;
  if (!channelId) {
    throw new Error("Channel not found.");
  }

  const channelUrl = buildUrl("/channels", {
    part: "snippet,contentDetails",
    id: channelId,
    key: apiKey
  });
  const channelData = await fetchJson<ChannelDetailsResponse>(channelUrl);
  const channel = channelData.items?.[0];
  const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    throw new Error("Uploads playlist not found for this channel.");
  }

  const handleCandidate = channel?.snippet?.customUrl?.trim() ?? "";
  const normalizedHandle = normalizeHandle(
    handleCandidate.startsWith("@") ? handleCandidate : `@${handleCandidate}`
  );

  const channelThumbnailUrl = normalizeImageUrl(
    channel?.snippet?.thumbnails?.high?.url ??
      channel?.snippet?.thumbnails?.medium?.url ??
      channel?.snippet?.thumbnails?.default?.url ??
      ""
  );

  return {
    normalizedHandle,
    channelId,
    channelThumbnailUrl,
    uploadsPlaylistId,
    resolutionType: "video"
  };
}

export async function fetchViewCountsByVideoIds(videoIds: string[]): Promise<ViewCountMap> {
  const apiKey = getApiKey();
  const uniqueIds = Array.from(new Set(videoIds.filter(Boolean)));
  const result: ViewCountMap = {};

  for (let index = 0; index < uniqueIds.length; index += 50) {
    const chunk = uniqueIds.slice(index, index + 50);
    if (chunk.length === 0) {
      continue;
    }

    const statsUrl = buildUrl("/videos", {
      part: "statistics",
      id: chunk.join(","),
      key: apiKey
    });
    const statsData = await fetchJson<VideoStatisticsResponse>(statsUrl);

    for (const item of statsData.items ?? []) {
      if (!item.id) {
        continue;
      }
      const parsed = Number(item.statistics?.viewCount ?? "");
      if (Number.isFinite(parsed)) {
        result[item.id] = parsed;
      }
    }
  }

  return result;
}

export async function fetchVideoStatsByVideoIds(videoIds: string[]): Promise<VideoMetadataMap> {
  const apiKey = getApiKey();
  const uniqueIds = Array.from(new Set(videoIds.filter(Boolean)));
  const result: VideoMetadataMap = {};

  for (let index = 0; index < uniqueIds.length; index += 50) {
    const chunk = uniqueIds.slice(index, index + 50);
    if (chunk.length === 0) {
      continue;
    }

    const metadataUrl = buildUrl("/videos", {
      part: "statistics,contentDetails,snippet,status",
      id: chunk.join(","),
      key: apiKey
    });
    const metadataData = await fetchJson<VideoMetadataResponse>(metadataUrl);

    for (const item of metadataData.items ?? []) {
      if (!item.id) {
        continue;
      }
      const parsedViewCount = Number(item.statistics?.viewCount ?? "");
      const parsedDurationSeconds = parseIsoDurationToSeconds(item.contentDetails?.duration);
      const parsedThumbnailUrl = normalizeImageUrl(pickVideoSnippetThumbnailUrl(item.snippet));
      const embeddable = item.status?.embeddable;
      result[item.id] = {
        ...(Number.isFinite(parsedViewCount) ? { viewCount: parsedViewCount } : {}),
        ...(typeof parsedDurationSeconds === "number"
          ? { durationSeconds: parsedDurationSeconds }
          : {}),
        ...(parsedThumbnailUrl ? { thumbnailUrl: parsedThumbnailUrl } : {}),
        ...(typeof embeddable === "boolean" ? { embeddable } : {})
      };
    }
  }

  return result;
}

export async function fetchLatestVideos(channelId: string, limit = 25): Promise<VideoItem[]> {
  const apiKey = getApiKey();

  const channelUrl = buildUrl("/channels", {
    part: "contentDetails",
    id: channelId,
    key: apiKey
  });
  const channelData = await fetchJson<ChannelDetailsResponse>(channelUrl);
  const uploadsPlaylistId =
    channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  if (!uploadsPlaylistId) {
    throw new Error("Uploads playlist not found for this channel.");
  }

  const videos: VideoItem[] = [];
  const cappedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  let nextPageToken = "";

  while (videos.length < cappedLimit) {
    const params: Record<string, string | number> = {
      part: "snippet",
      playlistId: uploadsPlaylistId,
      maxResults: Math.min(cappedLimit - videos.length, 50),
      key: apiKey
    };
    if (nextPageToken) {
      params.pageToken = nextPageToken;
    }

    const playlistUrl = buildUrl("/playlistItems", params);
    const playlistData = await fetchJson<PlaylistItemsResponse>(playlistUrl);
    const batch = (playlistData.items ?? [])
      .map(mapPlaylistItemToVideoItem)
      .filter((item): item is VideoItem => item !== null);

    videos.push(...batch);
    nextPageToken = playlistData.nextPageToken ?? "";

    if (!nextPageToken || batch.length === 0) {
      break;
    }
  }

  const limitedVideos = videos.slice(0, cappedLimit);

  return limitedVideos;
}

export async function fetchUploadsPlaylistPage(
  uploadsPlaylistId: string,
  pageToken = "",
  maxResults = 50
): Promise<{ videos: VideoItem[]; nextPageToken: string | null }> {
  const apiKey = getApiKey();
  const params: Record<string, string | number> = {
    part: "snippet",
    playlistId: uploadsPlaylistId,
    maxResults: Math.max(1, Math.min(50, Math.floor(maxResults))),
    key: apiKey
  };
  if (pageToken) {
    params.pageToken = pageToken;
  }

  const playlistUrl = buildUrl("/playlistItems", params);
  const playlistData = await fetchJson<PlaylistItemsResponse>(playlistUrl);
  const videos = (playlistData.items ?? [])
    .map(mapPlaylistItemToVideoItem)
    .filter((item): item is VideoItem => item !== null);

  return {
    videos,
    nextPageToken: playlistData.nextPageToken ?? null
  };
}

export async function getLatestVideosAndChannelByHandle(handle: string, limit = 25): Promise<{
  channelThumbnailUrl: string;
  videos: VideoItem[];
}> {
  const { channelId, channelThumbnailUrl } = await resolveChannelByHandleWithThumbnail(handle);
  const videos = await fetchLatestVideos(channelId, limit);
  return { channelThumbnailUrl, videos };
}
