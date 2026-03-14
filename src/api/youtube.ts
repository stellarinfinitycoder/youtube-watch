import type { VideoItem } from "../types/youtube";
import { normalizeHandle } from "../utils/handle";

const DEFAULT_LIMIT = 25;

export type ChannelLookupResult = {
  channelId: string;
  channelThumbnailUrl: string;
};

export type ChannelVideosResult = {
  channelThumbnailUrl: string;
  videos: VideoItem[];
};

type ApiErrorPayload = {
  error?: string;
};

function buildInternalUrl(path: string, params?: Record<string, string | number>): string {
  const url = new URL(path, window.location.origin);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });
  return `${url.pathname}${url.search}`;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;

  if (!response.ok) {
    const backendError = payload.error?.trim();
    if (response.status === 404 && backendError && /not found/i.test(backendError)) {
      throw new Error("Channel not found.");
    }
    if (response.status === 404 && input.startsWith("/api/")) {
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
