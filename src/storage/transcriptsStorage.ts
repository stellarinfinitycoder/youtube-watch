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

export function readCachedTranscript(videoId: string): string | null {
  if (videoId.trim().length === 0) {
    return null;
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
    const parsed = JSON.parse(raw) as Partial<TranscriptCacheEntry>;
    if (typeof parsed.text !== "string" || typeof parsed.cachedAt !== "number") {
      storage.removeItem(`${TRANSCRIPT_CACHE_KEY_PREFIX}${videoId}`);
      return null;
    }
    if (Date.now() - parsed.cachedAt > TRANSCRIPT_CACHE_TTL_MS) {
      storage.removeItem(`${TRANSCRIPT_CACHE_KEY_PREFIX}${videoId}`);
      return null;
    }
    const text = parsed.text.trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

export function writeCachedTranscript(videoId: string, text: string): void {
  if (videoId.trim().length === 0) {
    return;
  }

  const storage = getStorage();
  if (!storage || typeof storage.setItem !== "function") {
    return;
  }

  try {
    const payload: TranscriptCacheEntry = {
      text,
      cachedAt: Date.now()
    };
    storage.setItem(`${TRANSCRIPT_CACHE_KEY_PREFIX}${videoId}`, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures.
  }
}

export function pruneTranscriptCaches(storage: Storage): boolean {
  const transcriptKeys: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(TRANSCRIPT_CACHE_KEY_PREFIX)) {
      transcriptKeys.push(key);
    }
  }

  if (transcriptKeys.length === 0) {
    return false;
  }

  transcriptKeys.forEach((key) => storage.removeItem(key));
  return true;
}
