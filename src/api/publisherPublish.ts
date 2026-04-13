import type { PublishedItem } from "../types/publisher";

type ApiErrorPayload = {
  error?: string;
};

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    credentials: "include"
  });
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
  if (!response.ok) {
    const message = payload.error?.trim() || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

export async function publishVideoSummary(input: {
  videoId: string;
  videoUrl: string;
  title: string;
  summary: string;
  thumbnailUrl: string;
  channelTitle: string;
  publishedAt: string;
  durationSeconds?: number | null;
  viewCount?: number | null;
}): Promise<PublishedItem> {
  return fetchJson<PublishedItem>("/api/publisher?action=publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
}
