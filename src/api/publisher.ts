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

export async function loginPublisherAdmin(password: string): Promise<void> {
  await fetchJson<{ ok: boolean }>("/api/publisher?action=login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
}

export async function logoutPublisherAdmin(): Promise<void> {
  await fetchJson<{ ok: boolean }>("/api/publisher?action=logout", {
    method: "POST"
  });
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

export async function fetchPublisherItems(): Promise<PublishedItem[]> {
  const payload = await fetchJson<{ items: PublishedItem[] }>("/api/publisher?scope=admin");
  return payload.items ?? [];
}

export async function updatePublisherItem(
  id: string,
  patch: { title?: string; summary?: string }
): Promise<PublishedItem> {
  return fetchJson<PublishedItem>(`/api/publisher?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
}

export async function deletePublisherItem(id: string): Promise<void> {
  await fetchJson<{ ok: boolean }>(`/api/publisher?id=${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

export async function fetchPublicPublishedItems(limit?: number): Promise<PublishedItem[]> {
  const suffix =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0
      ? `&limit=${Math.floor(limit)}`
      : "";
  const response = await fetch(`/api/publisher?scope=public${suffix}`, {
    credentials: "omit"
  });
  const payload = (await response.json().catch(() => ({}))) as
    | { items?: PublishedItem[]; error?: string }
    | undefined;
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return payload?.items ?? [];
}

export async function fetchPublicPublishedItem(id: string): Promise<PublishedItem> {
  const response = await fetch(
    `/api/publisher?scope=public&id=${encodeURIComponent(id)}`,
    {
      credentials: "omit"
    }
  );
  const payload = (await response.json().catch(() => ({}))) as PublishedItem & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload;
}
