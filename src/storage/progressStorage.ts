export const ERROR_LOGS_STORAGE_KEY = "youtube-watch:error-logs:v1";
export const QUOTA_ESTIMATE_STORAGE_KEY = "youtube-watch:quota-estimate:v1";
export const VIDEO_PROGRESS_STORAGE_KEY = "youtube-watch:video-progress:v1";
export const BOARD_RUNTIME_STORAGE_KEY = "youtube-watch:board-runtime:v1";

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

export function readStoredJson<T>(key: string, fallback: T): T {
  const storage = getStorage();
  if (!storage) {
    return fallback;
  }

  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
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
