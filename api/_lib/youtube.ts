export type VideoItem = {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  channelTitle: string;
  videoUrl: string;
  viewCount: number | null;
};

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

type ViewCountMap = Record<string, number>;

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
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    viewCount: null
  };
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
): Promise<{ channelId: string; channelThumbnailUrl: string }> {
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

  if (limitedVideos.length === 0) {
    return limitedVideos;
  }

  const viewCounts = await fetchViewCountsByVideoIds(
    limitedVideos.map((video) => video.videoId)
  );

  return limitedVideos.map((video) => ({
    ...video,
    viewCount: viewCounts[video.videoId] ?? null
  }));
}

export async function getLatestVideosAndChannelByHandle(handle: string, limit = 25): Promise<{
  channelThumbnailUrl: string;
  videos: VideoItem[];
}> {
  const { channelId, channelThumbnailUrl } = await resolveChannelByHandleWithThumbnail(handle);
  const videos = await fetchLatestVideos(channelId, limit);
  return { channelThumbnailUrl, videos };
}
