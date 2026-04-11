export const BOARDS_STORAGE_KEY = "youtube-watch:boards:v1";
export const ACTIVE_BOARD_ID_STORAGE_KEY = "youtube-watch:active-board-id:v1";

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

export function readStoredBoardsPayload(): unknown[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(BOARDS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readStoredActiveBoardId(): string | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(ACTIVE_BOARD_ID_STORAGE_KEY);
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function persistBoardsPayload(
  boardsPayload: string,
  activeBoardId: string,
  pruneCaches: (storage: Storage) => boolean,
  maxAttempts = 6
): boolean {
  const storage = getStorage();
  if (!storage || typeof storage.setItem !== "function") {
    return false;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      storage.setItem(BOARDS_STORAGE_KEY, boardsPayload);
      storage.setItem(ACTIVE_BOARD_ID_STORAGE_KEY, activeBoardId);
      return true;
    } catch {
      if (!pruneCaches(storage)) {
        break;
      }
    }
  }

  return false;
}
