import type { VideoItem } from "../types/youtube";
import { normalizeHandle, stripHandlePrefix } from "../utils/handle";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const DEFAULT_LIMIT = 15;

type ChannelByHandleResponse = {
  items?: Array<{
    id?: string;
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
    contentDetails?: {
      relatedPlaylists?: {
        uploads?: string;
      };
    };
  }>;
};

type PlaylistItemsResponse = {
  items?: PlaylistItem[];
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

export type ChannelLookupResult = {
  channelId: string;
  channelThumbnailUrl: string;
};

export type ChannelVideosResult = {
  channelThumbnailUrl: string;
  videos: VideoItem[];
};

function getApiKey(): string {
  const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing VITE_YOUTUBE_API_KEY in environment.");
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
    thumbnailUrl: normalizeImageUrl(pickThumbnailUrl(snippet)),
    channelTitle: snippet.channelTitle ?? "",
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`
  };
}

function normalizeImageUrl(url: string): string {
  if (!url) {
    return "";
  }
  if (url.startsWith("//")) {
    return `https:${url}`;
  }
  if (url.startsWith("http://")) {
    return `https://${url.slice("http://".length)}`;
  }
  return url;
}

export async function resolveChannelByHandle(handle: string): Promise<string> {
  const result = await resolveChannelByHandleWithThumbnail(handle);
  return result.channelId;
}

export async function resolveChannelByHandleWithThumbnail(
  handle: string
): Promise<ChannelLookupResult> {
  const apiKey = getApiKey();
  const normalized = normalizeHandle(handle);
  const cleanHandle = stripHandlePrefix(normalized);

  const url = buildUrl("/channels", {
    part: "id,snippet",
    forHandle: cleanHandle,
    key: apiKey
  });

  const data = await fetchJson<ChannelByHandleResponse>(url);
  const channel = data.items?.[0];
  const channelId = channel?.id;

  if (!channelId) {
    throw new Error(`Channel not found for handle ${normalized}.`);
  }

  let channelThumbnailUrl =
    channel?.snippet?.thumbnails?.high?.url ??
    channel?.snippet?.thumbnails?.medium?.url ??
    channel?.snippet?.thumbnails?.default?.url ??
    "";

  // Some handle lookups return sparse snippet data, so fetch by channel id as fallback.
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

  return { channelId, channelThumbnailUrl: normalizeImageUrl(channelThumbnailUrl) };
}

export async function fetchLatestVideos(
  channelId: string,
  limit = DEFAULT_LIMIT
): Promise<VideoItem[]> {
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

  const playlistUrl = buildUrl("/playlistItems", {
    part: "snippet",
    playlistId: uploadsPlaylistId,
    maxResults: Math.min(limit, 50),
    key: apiKey
  });

  const playlistData = await fetchJson<PlaylistItemsResponse>(playlistUrl);

  return (playlistData.items ?? [])
    .map(mapPlaylistItemToVideoItem)
    .filter((item): item is VideoItem => item !== null)
    .slice(0, limit);
}

export async function getLatestVideosByHandle(
  handle: string,
  limit = DEFAULT_LIMIT
): Promise<VideoItem[]> {
  const channelId = await resolveChannelByHandle(handle);
  return fetchLatestVideos(channelId, limit);
}

export async function getLatestVideosAndChannelByHandle(
  handle: string,
  limit = DEFAULT_LIMIT
): Promise<ChannelVideosResult> {
  const { channelId, channelThumbnailUrl } =
    await resolveChannelByHandleWithThumbnail(handle);
  const videos = await fetchLatestVideos(channelId, limit);
  return { channelThumbnailUrl, videos };
}
