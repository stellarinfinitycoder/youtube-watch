import {
  deleteCacheValue,
  getAllCacheKeys,
  getCacheValue,
  setCacheValue,
  TRANSCRIPTS_STORE_NAME
} from "./indexedDbCache";

export const TRANSCRIPT_CACHE_KEY_PREFIX = "youtube-watch:transcript:v1:";
export const TRANSCRIPT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type TranscriptCacheEntry = {
  text: string;
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

function normalizeTranscriptCacheEntry(input: unknown): TranscriptCacheEntry | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const parsed = input as Partial<TranscriptCacheEntry>;
  if (typeof parsed.text !== "string" || typeof parsed.cachedAt !== "number") {
    return null;
  }
  const text = parsed.text.trim();
  return text
    ? {
        text,
        cachedAt: parsed.cachedAt
      }
    : null;
}

let migrateTranscriptCachePromise: Promise<void> | null = null;

async function migrateLegacyTranscriptCache(): Promise<void> {
  if (migrateTranscriptCachePromise) {
    return migrateTranscriptCachePromise;
  }

  migrateTranscriptCachePromise = (async () => {
    const storage = getStorage();
    if (!storage) {
      return;
    }
    const keysToDelete: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(TRANSCRIPT_CACHE_KEY_PREFIX)) {
        continue;
      }
      keysToDelete.push(key);
    }

    for (const key of keysToDelete) {
      const videoId = key.slice(TRANSCRIPT_CACHE_KEY_PREFIX.length).trim();
      if (!videoId) {
        storage.removeItem(key);
        continue;
      }
      try {
        const raw = storage.getItem(key);
        if (!raw) {
          storage.removeItem(key);
          continue;
        }
        const parsed = normalizeTranscriptCacheEntry(JSON.parse(raw) as unknown);
        if (!parsed || Date.now() - parsed.cachedAt > TRANSCRIPT_CACHE_TTL_MS) {
          storage.removeItem(key);
          continue;
        }
        await setCacheValue(TRANSCRIPTS_STORE_NAME, videoId, parsed);
      } catch {
        // Ignore malformed legacy entries.
      } finally {
        storage.removeItem(key);
      }
    }
  })().finally(() => {
    migrateTranscriptCachePromise = null;
  });

  return migrateTranscriptCachePromise;
}

export async function readCachedTranscript(videoId: string): Promise<string | null> {
  if (videoId.trim().length === 0) {
    return null;
  }

  await migrateLegacyTranscriptCache();
  const parsed = normalizeTranscriptCacheEntry(
    await getCacheValue<TranscriptCacheEntry>(TRANSCRIPTS_STORE_NAME, videoId)
  );
  if (parsed) {
    if (Date.now() - parsed.cachedAt > TRANSCRIPT_CACHE_TTL_MS) {
      await deleteCacheValue(TRANSCRIPTS_STORE_NAME, videoId);
      return null;
    }
    return parsed.text;
  }

  const storage = getStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(`${TRANSCRIPT_CACHE_KEY_PREFIX}${videoId}`);
    if (!raw) {
      return null;
    }
    const legacyParsed = normalizeTranscriptCacheEntry(JSON.parse(raw) as unknown);
    if (!legacyParsed || Date.now() - legacyParsed.cachedAt > TRANSCRIPT_CACHE_TTL_MS) {
      storage.removeItem(`${TRANSCRIPT_CACHE_KEY_PREFIX}${videoId}`);
      return null;
    }
    return legacyParsed.text;
  } catch {
    return null;
  }
}

export async function writeCachedTranscript(videoId: string, text: string): Promise<void> {
  if (videoId.trim().length === 0) {
    return;
  }

  await migrateLegacyTranscriptCache();
  const payload: TranscriptCacheEntry = {
    text,
    cachedAt: Date.now()
  };
  const didWrite = await setCacheValue(TRANSCRIPTS_STORE_NAME, videoId, payload);
  if (didWrite) {
    return;
  }

  const storage = getStorage();
  if (!storage || typeof storage.setItem !== "function") {
    return;
  }

  try {
    storage.setItem(`${TRANSCRIPT_CACHE_KEY_PREFIX}${videoId}`, JSON.stringify(payload));
  } catch {
    // Ignore fallback write failures.
  }
}

export async function pruneTranscriptCaches(): Promise<boolean> {
  await migrateLegacyTranscriptCache();
  const transcriptKeys = await getAllCacheKeys(TRANSCRIPTS_STORE_NAME);

  if (transcriptKeys.length > 0) {
    await Promise.all(
      transcriptKeys.map((key) => deleteCacheValue(TRANSCRIPTS_STORE_NAME, key))
    );
    return true;
  }

  const storage = getStorage();
  if (!storage) {
    return false;
  }

  const legacyKeys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(TRANSCRIPT_CACHE_KEY_PREFIX)) {
      legacyKeys.push(key);
    }
  }

  if (legacyKeys.length === 0) {
    return false;
  }

  legacyKeys.forEach((key) => storage.removeItem(key));
  return true;
}
