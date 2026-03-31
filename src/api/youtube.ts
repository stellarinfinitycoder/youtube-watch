import type { VideoItem } from "../types/youtube";
import { normalizeHandle } from "../utils/handle";

const DEFAULT_LIMIT = 25;
type VideoStatsMap = Record<
  string,
  { viewCount?: number; durationSeconds?: number; thumbnailUrl?: string }
>;

export type ChannelLookupResult = {
  channelId: string;
  channelThumbnailUrl: string;
  uploadsPlaylistId: string;
};

export type ChannelInputLookupResult = ChannelLookupResult & {
  normalizedHandle: string;
  resolutionType: "handle" | "video";
};

export type ChannelVideosResult = {
  channelThumbnailUrl: string;
  videos: VideoItem[];
};

export type PlaylistDiscoveryResult = {
  videos: VideoItem[];
  nextPageToken: string | null;
};

type ApiErrorPayload = {
  error?: string;
};

type ApiRequestListener = (meta: { path: string; method: string }) => void;
let apiRequestListener: ApiRequestListener | null = null;

export function setApiRequestListener(listener: ApiRequestListener | null): void {
  apiRequestListener = listener;
}

function buildInternalUrl(path: string, params?: Record<string, string | number>): string {
  const url = new URL(path, window.location.origin);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });
  return `${url.pathname}${url.search}`;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const url = new URL(input, window.location.origin);
  apiRequestListener?.({
    path: url.pathname,
    method: (init?.method ?? "GET").toUpperCase()
  });
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;

  if (!response.ok) {
    const backendError = payload.error?.trim();
    if (response.status === 404 && backendError && /not found/i.test(backendError)) {
      throw new Error("Channel not found.");
    }
    if (response.status === 404 && input.startsWith("/api/") && !backendError) {
      throw new Error(
        "API route unavailable. Deploy on Vercel or run with `vercel dev` for local API routes."
      );
    }
    throw new Error(backendError ?? `Request failed (${response.status})`);
  }

  return payload as T;
}

export async function resolveChannelByHandle(handle: string): Promise<string> {
  const result = await resolveChannelByHandleWithThumbnail(handle);
  return result.channelId;
}

export async function resolveChannelByHandleWithThumbnail(
  handle: string
): Promise<ChannelLookupResult> {
  const normalized = normalizeHandle(handle);
  return fetchJson<ChannelLookupResult>(
    buildInternalUrl("/api/youtube/resolve", { handle: normalized })
  );
}

export async function resolveChannelByInputWithThumbnail(
  input: string
): Promise<ChannelInputLookupResult> {
  return fetchJson<ChannelInputLookupResult>(
    buildInternalUrl("/api/youtube/resolve-input", { input: input.trim() })
  );
}

export async function fetchLatestVideos(
  channelId: string,
  limit = DEFAULT_LIMIT
): Promise<VideoItem[]> {
  const data = await fetchJson<{ videos: VideoItem[] }>(
    buildInternalUrl("/api/youtube/latest-by-channel", {
      channelId,
      limit: Math.min(limit, 50)
    })
  );
  return data.videos ?? [];
}

export async function fetchPlaylistDiscoveryPage(
  uploadsPlaylistId: string,
  pageToken = "",
  limit = 50
): Promise<PlaylistDiscoveryResult> {
  return fetchJson<PlaylistDiscoveryResult>(
    buildInternalUrl("/api/youtube/discover-by-playlist", {
      uploadsPlaylistId,
      pageToken,
      limit: Math.min(limit, 50)
    })
  );
}

export async function getLatestVideosByHandle(
  handle: string,
  limit = DEFAULT_LIMIT
): Promise<VideoItem[]> {
  const data = await getLatestVideosAndChannelByHandle(handle, limit);
  return data.videos;
}

export async function getLatestVideosAndChannelByHandle(
  handle: string,
  limit = DEFAULT_LIMIT
): Promise<ChannelVideosResult> {
  const normalized = normalizeHandle(handle);
  return fetchJson<ChannelVideosResult>(
    buildInternalUrl("/api/youtube/latest", {
      handle: normalized,
      limit: Math.min(limit, 50)
    })
  );
}

export async function fetchViewCountsByVideoIds(
  videoIds: string[]
): Promise<Record<string, number>> {
  const uniqueIds = [...new Set(videoIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return {};
  }

  return fetchJson<Record<string, number>>("/api/youtube/view-counts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ videoIds: uniqueIds })
  });
}

export async function fetchVideoStatsByVideoIds(
  videoIds: string[]
): Promise<VideoStatsMap> {
  const uniqueIds = [...new Set(videoIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return {};
  }

  return fetchJson<VideoStatsMap>(
    buildInternalUrl("/api/youtube/view-counts", {
      includeDuration: "true",
      videoIds: uniqueIds.join(","),
      ts: Date.now()
    }),
    {
      cache: "no-store"
    }
  );
}

export async function fetchTranscriptByVideoInput(
  input: { videoId?: string; videoUrl?: string }
): Promise<{ videoId: string; text: string }> {
  const trimmedUrl = (input.videoUrl ?? "").trim();
  const trimmedVideoId = (input.videoId ?? "").trim();
  if (!trimmedUrl && !trimmedVideoId) {
    throw new Error("Invalid video input.");
  }
  const url = trimmedUrl || `https://www.youtube.com/watch?v=${trimmedVideoId}`;
  return fetchJson<{ videoId: string; text: string }>("/api/transcript", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      url
    }),
    cache: "no-store"
  });
}

export async function fetchSummaryByVideoInput(input: {
  videoId?: string;
  videoUrl?: string;
  transcriptText?: string;
  mode?: "short" | "detailed" | "bullets";
  prompt?: string;
}): Promise<{
  videoId: string;
  model: string;
  summary: string;
  keyPoints: string[];
}> {
  const trimmedUrl = (input.videoUrl ?? "").trim();
  const trimmedVideoId = (input.videoId ?? "").trim();
  if (!trimmedUrl && !trimmedVideoId) {
    throw new Error("Invalid video input.");
  }
  return fetchJson<{
    videoId: string;
    model: string;
    summary: string;
    keyPoints: string[];
  }>("/api/summarize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      videoId: trimmedVideoId || undefined,
      url: trimmedUrl || undefined,
      transcriptText:
        typeof input.transcriptText === "string" && input.transcriptText.trim().length > 0
          ? input.transcriptText
          : undefined,
      mode: input.mode ?? "short",
      prompt:
        typeof input.prompt === "string" && input.prompt.trim().length > 0
          ? input.prompt
          : undefined
    }),
    cache: "no-store"
  });
}
