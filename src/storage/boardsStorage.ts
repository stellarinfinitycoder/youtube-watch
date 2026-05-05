import {
  BOARDS_STORE_NAME,
  getCacheValue,
  setCacheValue
} from "./indexedDbCache";

export const BOARDS_STORAGE_KEY = "youtube-watch:boards:v1";
export const ACTIVE_BOARD_ID_STORAGE_KEY = "youtube-watch:active-board-id:v1";

const BOARDS_CACHE_KEY = "boardsPayload";
const ACTIVE_BOARD_ID_CACHE_KEY = "activeBoardId";

export type StoredBoardsState = {
  boardsPayload: unknown[];
  activeBoardId: string | null;
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

export async function readStoredBoardsState(): Promise<StoredBoardsState> {
  const indexedDbBoardsPayload = await getCacheValue<unknown[]>(
    BOARDS_STORE_NAME,
    BOARDS_CACHE_KEY
  );
  if (Array.isArray(indexedDbBoardsPayload)) {
    const indexedDbActiveBoardId = await getCacheValue<string>(
      BOARDS_STORE_NAME,
      ACTIVE_BOARD_ID_CACHE_KEY
    );
    return {
      boardsPayload: indexedDbBoardsPayload,
      activeBoardId:
        typeof indexedDbActiveBoardId === "string" && indexedDbActiveBoardId.length > 0
          ? indexedDbActiveBoardId
          : readStoredActiveBoardId()
    };
  }

  const legacyBoardsPayload = readStoredBoardsPayload();
  const legacyActiveBoardId = readStoredActiveBoardId();
  if (legacyBoardsPayload.length > 0) {
    await persistBoardsPayload(JSON.stringify(legacyBoardsPayload), legacyActiveBoardId ?? "");
  }
  return {
    boardsPayload: legacyBoardsPayload,
    activeBoardId: legacyActiveBoardId
  };
}

export async function persistBoardsPayload(
  boardsPayload: string,
  activeBoardId: string,
  pruneCaches: (storage: Storage) => boolean = () => false,
  maxAttempts = 6
): Promise<boolean> {
  try {
    const parsedBoardsPayload = JSON.parse(boardsPayload) as unknown;
    const didWriteBoards = Array.isArray(parsedBoardsPayload)
      ? await setCacheValue(BOARDS_STORE_NAME, BOARDS_CACHE_KEY, parsedBoardsPayload)
      : false;
    const didWriteActiveBoardId = await setCacheValue(
      BOARDS_STORE_NAME,
      ACTIVE_BOARD_ID_CACHE_KEY,
      activeBoardId
    );
    if (didWriteBoards && didWriteActiveBoardId) {
      return true;
    }
  } catch {
    // Fall back to localStorage below.
  }

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
