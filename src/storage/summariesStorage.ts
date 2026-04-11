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

export function readCachedSummary(videoId: string, promptHash: string): SummaryCacheEntry | null {
  if (videoId.trim().length === 0) {
    return null;
  }

  const storage = getStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(getSummaryCacheKey(videoId, promptHash));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<SummaryCacheEntry>;
    if (
      typeof parsed.summary !== "string" ||
      !Array.isArray(parsed.keyPoints) ||
      typeof parsed.model !== "string" ||
      typeof parsed.transcriptHash !== "string" ||
      typeof parsed.promptHash !== "string" ||
      typeof parsed.cachedAt !== "number"
    ) {
      storage.removeItem(getSummaryCacheKey(videoId, promptHash));
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
  } catch {
    return null;
  }
}

export function writeCachedSummary(
  videoId: string,
  promptHash: string,
  payload: SummaryCacheEntry
): void {
  if (videoId.trim().length === 0) {
    return;
  }

  const storage = getStorage();
  if (!storage || typeof storage.setItem !== "function") {
    return;
  }

  try {
    storage.setItem(getSummaryCacheKey(videoId, promptHash), JSON.stringify(payload));
  } catch {
    // Ignore storage write failures.
  }
}

export function pruneSummaryCaches(storage: Storage): boolean {
  const summaryEntries: Array<{ key: string; cachedAt: number }> = [];

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
    summaryEntries.push({ key, cachedAt });
  }

  if (summaryEntries.length === 0) {
    return false;
  }

  summaryEntries.sort((a, b) => a.cachedAt - b.cachedAt);
  const removeCount = Math.max(1, Math.ceil(summaryEntries.length * 0.25));
  summaryEntries.slice(0, removeCount).forEach((entry) => storage.removeItem(entry.key));
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
