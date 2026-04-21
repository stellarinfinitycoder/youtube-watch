import {
  deleteCacheValue,
  getAllCacheKeys,
  getCacheValue,
  setCacheValue,
  SUMMARIES_STORE_NAME
} from "./indexedDbCache";

export const SUMMARY_CACHE_KEY_PREFIX = "youtube-watch:summary:v2:";
export const SUMMARY_PROMPT_STORAGE_KEY = "youtube-watch:summary-prompt:v1";
export const SUMMARY_FORMATS_STORAGE_KEY = "youtube-watch:summary-formats:v1";
export const SUMMARY_MODEL_PRESETS_STORAGE_KEY = "youtube-watch:summary-model-presets:v1";

export type SummaryCacheEntry = {
  summary: string;
  keyPoints: string[];
  model: string;
  transcriptHash: string;
  promptHash: string;
  cachedAt: number;
};

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") {
      return null;
    }
    return storage;
  } catch {
    return null;
  }
}

function getSummaryCacheKey(videoId: string, promptHash: string): string {
  return `${SUMMARY_CACHE_KEY_PREFIX}${videoId}:${promptHash}`;
}

function normalizeSummaryCacheEntry(input: unknown): SummaryCacheEntry | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const parsed = input as Partial<SummaryCacheEntry>;
  if (
    typeof parsed.summary !== "string" ||
    !Array.isArray(parsed.keyPoints) ||
    typeof parsed.model !== "string" ||
    typeof parsed.transcriptHash !== "string" ||
    typeof parsed.promptHash !== "string" ||
    typeof parsed.cachedAt !== "number"
  ) {
    return null;
  }
  const keyPoints = parsed.keyPoints
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const summary = parsed.summary.trim();
  if (!summary && keyPoints.length === 0) {
    return null;
  }
  return {
    summary,
    keyPoints,
    model: parsed.model.trim(),
    transcriptHash: parsed.transcriptHash,
    promptHash: parsed.promptHash,
    cachedAt: parsed.cachedAt
  };
}

let migrateSummaryCachePromise: Promise<void> | null = null;

async function migrateLegacySummaryCache(): Promise<void> {
  if (migrateSummaryCachePromise) {
    return migrateSummaryCachePromise;
  }

  migrateSummaryCachePromise = (async () => {
    const storage = getStorage();
    if (!storage) {
      return;
    }
    const keysToDelete: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(SUMMARY_CACHE_KEY_PREFIX)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      const raw = storage.getItem(key);
      const compositeKey = key.slice(SUMMARY_CACHE_KEY_PREFIX.length).trim();
      try {
        if (!raw || !compositeKey) {
          continue;
        }
        const parsed = normalizeSummaryCacheEntry(JSON.parse(raw) as unknown);
        if (!parsed) {
          continue;
        }
        await setCacheValue(SUMMARIES_STORE_NAME, compositeKey, parsed);
      } catch {
        // Ignore malformed legacy entries.
      } finally {
        storage.removeItem(key);
      }
    }
  })().finally(() => {
    migrateSummaryCachePromise = null;
  });

  return migrateSummaryCachePromise;
}

export async function readCachedSummary(
  videoId: string,
  promptHash: string
): Promise<SummaryCacheEntry | null> {
  if (videoId.trim().length === 0) {
    return null;
  }

  await migrateLegacySummaryCache();
  const compositeKey = `${videoId}:${promptHash}`;
  const parsed = normalizeSummaryCacheEntry(
    await getCacheValue<SummaryCacheEntry>(SUMMARIES_STORE_NAME, compositeKey)
  );
  if (parsed) {
    return parsed;
  }

  const storage = getStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(getSummaryCacheKey(videoId, promptHash));
    return raw ? normalizeSummaryCacheEntry(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export async function writeCachedSummary(
  videoId: string,
  promptHash: string,
  payload: SummaryCacheEntry
): Promise<void> {
  if (videoId.trim().length === 0) {
    return;
  }

  await migrateLegacySummaryCache();
  const compositeKey = `${videoId}:${promptHash}`;
  const didWrite = await setCacheValue(SUMMARIES_STORE_NAME, compositeKey, payload);
  if (didWrite) {
    return;
  }

  const storage = getStorage();
  if (!storage || typeof storage.setItem !== "function") {
    return;
  }

  try {
    storage.setItem(getSummaryCacheKey(videoId, promptHash), JSON.stringify(payload));
  } catch {
    // Ignore fallback write failures.
  }
}

export async function pruneSummaryCaches(): Promise<boolean> {
  await migrateLegacySummaryCache();
  const summaryEntries = await getAllCacheKeys(SUMMARIES_STORE_NAME);

  if (summaryEntries.length > 0) {
    const parsedEntries = await Promise.all(
      summaryEntries.map(async (key) => ({
        key,
        cachedAt:
          normalizeSummaryCacheEntry(
            await getCacheValue<SummaryCacheEntry>(SUMMARIES_STORE_NAME, key)
          )?.cachedAt ?? 0
      }))
    );
    parsedEntries.sort((a, b) => a.cachedAt - b.cachedAt);
    const removeCount = Math.max(1, Math.ceil(parsedEntries.length * 0.25));
    await Promise.all(
      parsedEntries.slice(0, removeCount).map((entry) => deleteCacheValue(SUMMARIES_STORE_NAME, entry.key))
    );
    return true;
  }

  const storage = getStorage();
  if (!storage) {
    return false;
  }

  const legacyEntries: Array<{ key: string; cachedAt: number }> = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(SUMMARY_CACHE_KEY_PREFIX)) {
      continue;
    }
    let cachedAt = 0;
    try {
      const raw = storage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as { cachedAt?: unknown };
        if (typeof parsed.cachedAt === "number" && Number.isFinite(parsed.cachedAt)) {
          cachedAt = parsed.cachedAt;
        }
      }
    } catch {
      cachedAt = 0;
    }
    legacyEntries.push({ key, cachedAt });
  }

  if (legacyEntries.length === 0) {
    return false;
  }

  legacyEntries.sort((a, b) => a.cachedAt - b.cachedAt);
  const removeCount = Math.max(1, Math.ceil(legacyEntries.length * 0.25));
  legacyEntries.slice(0, removeCount).forEach((entry) => storage.removeItem(entry.key));
  return true;
}

export function readStoredString(key: string, fallback: string): string {
  const storage = getStorage();
  if (!storage) {
    return fallback;
  }

  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return fallback;
    }
    const parsed = String(raw).trim();
    return parsed.length > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function readStoredJson<T>(
  key: string,
  fallback: T,
  normalize?: (input: unknown) => T
): T {
  const storage = getStorage();
  if (!storage) {
    return fallback;
  }

  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as unknown;
    return normalize ? normalize(parsed) : (parsed as T);
  } catch {
    return fallback;
  }
}

export function writeStoredJson(key: string, value: unknown): void {
  const storage = getStorage();
  if (!storage || typeof storage.setItem !== "function") {
    return;
  }

  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage write failures.
  }
}
