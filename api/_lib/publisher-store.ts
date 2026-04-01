import { kv } from "@vercel/kv";

export type PublishedItem = {
  id: string;
  videoId: string;
  videoUrl: string;
  title: string;
  summary: string;
  thumbnailUrl: string;
  channelTitle: string;
  publishedAt: string;
  durationSeconds?: number | null;
  viewCount?: number | null;
  publishedBy: string;
  createdAt: string;
  updatedAt: string;
};

type PublisherIndexEntry = {
  id: string;
  updatedAt: number;
};

const PUBLISHER_ITEM_PREFIX = "publisher:item:";
const PUBLISHER_INDEX_KEY = "publisher:index:v1";

function getItemKey(id: string): string {
  return `${PUBLISHER_ITEM_PREFIX}${id}`;
}

function normalizeItemId(idOrVideoId: string): string {
  const value = idOrVideoId.trim();
  return value.startsWith("pub:") ? value : `pub:${value}`;
}

async function readIndex(): Promise<PublisherIndexEntry[]> {
  const raw = (await kv.get(PUBLISHER_INDEX_KEY)) as unknown;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const item = entry as Partial<PublisherIndexEntry>;
      if (typeof item.id !== "string" || typeof item.updatedAt !== "number") {
        return null;
      }
      return {
        id: item.id,
        updatedAt: item.updatedAt
      };
    })
    .filter((entry): entry is PublisherIndexEntry => entry !== null);
}

async function writeIndex(entries: PublisherIndexEntry[]): Promise<void> {
  await kv.set(PUBLISHER_INDEX_KEY, entries);
}

function toEpochMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export async function getPublishedItem(idOrVideoId: string): Promise<PublishedItem | null> {
  const id = normalizeItemId(idOrVideoId);
  const raw = (await kv.get(getItemKey(id))) as PublishedItem | null;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  return raw;
}

export async function listPublishedItems(limit?: number): Promise<PublishedItem[]> {
  const index = await readIndex();
  const sorted = [...index].sort((a, b) => b.updatedAt - a.updatedAt);
  const sliced =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0
      ? sorted.slice(0, limit)
      : sorted;

  const items: PublishedItem[] = [];
  for (const entry of sliced) {
    const raw = (await kv.get(getItemKey(entry.id))) as PublishedItem | null;
    if (raw && typeof raw === "object") {
      items.push(raw);
    }
  }
  return items;
}

export async function upsertPublishedItem(input: {
  videoId: string;
  videoUrl: string;
  title: string;
  summary: string;
  thumbnailUrl: string;
  channelTitle: string;
  publishedAt: string;
  durationSeconds?: number | null;
  viewCount?: number | null;
  publishedBy: string;
}): Promise<PublishedItem> {
  const id = normalizeItemId(input.videoId);
  const existing = await getPublishedItem(id);
  const nowIso = new Date().toISOString();

  const next: PublishedItem = {
    id,
    videoId: input.videoId.trim(),
    videoUrl: input.videoUrl.trim(),
    title: input.title.trim(),
    summary: input.summary.trim(),
    thumbnailUrl: input.thumbnailUrl.trim(),
    channelTitle: input.channelTitle.trim(),
    publishedAt: input.publishedAt.trim(),
    durationSeconds:
      typeof input.durationSeconds === "number" && Number.isFinite(input.durationSeconds)
        ? Math.max(0, Math.floor(input.durationSeconds))
        : null,
    viewCount:
      typeof input.viewCount === "number" && Number.isFinite(input.viewCount)
        ? Math.max(0, Math.floor(input.viewCount))
        : null,
    publishedBy:
      existing?.publishedBy ??
      (input.publishedBy.trim().length > 0 ? input.publishedBy.trim() : "admin"),
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso
  };

  await kv.set(getItemKey(id), next);

  const index = await readIndex();
  const filtered = index.filter((entry) => entry.id !== id);
  filtered.unshift({ id, updatedAt: toEpochMs(next.updatedAt) });
  filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  await writeIndex(filtered);

  return next;
}

export async function updatePublishedItem(
  idOrVideoId: string,
  patch: { title?: string; summary?: string }
): Promise<PublishedItem | null> {
  const existing = await getPublishedItem(idOrVideoId);
  if (!existing) {
    return null;
  }

  const next: PublishedItem = {
    ...existing,
    title:
      typeof patch.title === "string" && patch.title.trim().length > 0
        ? patch.title.trim()
        : existing.title,
    summary:
      typeof patch.summary === "string" && patch.summary.trim().length > 0
        ? patch.summary.trim()
        : existing.summary,
    updatedAt: new Date().toISOString()
  };

  await kv.set(getItemKey(existing.id), next);
  const index = await readIndex();
  const filtered = index.filter((entry) => entry.id !== existing.id);
  filtered.unshift({ id: existing.id, updatedAt: toEpochMs(next.updatedAt) });
  filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  await writeIndex(filtered);

  return next;
}

export async function deletePublishedItem(idOrVideoId: string): Promise<boolean> {
  const id = normalizeItemId(idOrVideoId);
  const existing = await getPublishedItem(id);
  if (!existing) {
    return false;
  }
  await kv.del(getItemKey(id));
  const index = await readIndex();
  const next = index.filter((entry) => entry.id !== id);
  await writeIndex(next);
  return true;
}
