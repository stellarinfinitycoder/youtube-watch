const CACHE_DB_NAME = "youtube-watch-cache";
const CACHE_DB_VERSION = 2;

export const TRANSCRIPTS_STORE_NAME = "transcripts";
export const SUMMARIES_STORE_NAME = "summaries";
export const BOARDS_STORE_NAME = "boards";

type CacheStoreName =
  | typeof TRANSCRIPTS_STORE_NAME
  | typeof SUMMARIES_STORE_NAME
  | typeof BOARDS_STORE_NAME;

function getIndexedDbFactory(): IDBFactory | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return typeof window.indexedDB?.open === "function" ? window.indexedDB : null;
  } catch {
    return null;
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

let openDbPromise: Promise<IDBDatabase | null> | null = null;

export async function resetCacheDbForTests(): Promise<void> {
  const database = await openDbPromise;
  database?.close();
  openDbPromise = null;
  if (typeof window === "undefined" || typeof window.indexedDB?.deleteDatabase !== "function") {
    return;
  }
  try {
    await new Promise<void>((resolve) => {
      const request = window.indexedDB.deleteDatabase(CACHE_DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  } catch {
    // Ignore reset failures in non-test environments.
  }
}

export async function openCacheDb(): Promise<IDBDatabase | null> {
  if (openDbPromise) {
    return openDbPromise;
  }

  const indexedDbFactory = getIndexedDbFactory();
  if (!indexedDbFactory) {
    return null;
  }

  openDbPromise = new Promise((resolve) => {
    try {
      const request = indexedDbFactory.open(CACHE_DB_NAME, CACHE_DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(TRANSCRIPTS_STORE_NAME)) {
          database.createObjectStore(TRANSCRIPTS_STORE_NAME);
        }
        if (!database.objectStoreNames.contains(SUMMARIES_STORE_NAME)) {
          database.createObjectStore(SUMMARIES_STORE_NAME);
        }
        if (!database.objectStoreNames.contains(BOARDS_STORE_NAME)) {
          database.createObjectStore(BOARDS_STORE_NAME);
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          openDbPromise = null;
        };
        resolve(database);
      };
      request.onerror = () => {
        openDbPromise = null;
        resolve(null);
      };
      request.onblocked = () => {
        openDbPromise = null;
        resolve(null);
      };
    } catch {
      openDbPromise = null;
      resolve(null);
    }
  });

  return openDbPromise;
}

export async function getCacheValue<T>(
  storeName: CacheStoreName,
  key: string
): Promise<T | null> {
  const database = await openCacheDb();
  if (!database) {
    return null;
  }
  try {
    const transaction = database.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const result = await requestToPromise(store.get(key));
    return (result as T | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function setCacheValue<T>(
  storeName: CacheStoreName,
  key: string,
  value: T
): Promise<boolean> {
  const database = await openCacheDb();
  if (!database) {
    return false;
  }
  try {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value, key);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB write failed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB write aborted."));
    });
    return true;
  } catch {
    return false;
  }
}

export async function deleteCacheValue(
  storeName: CacheStoreName,
  key: string
): Promise<void> {
  const database = await openCacheDb();
  if (!database) {
    return;
  }
  try {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(key);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB delete failed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB delete aborted."));
    });
  } catch {
    // Ignore delete failures.
  }
}

export async function getAllCacheKeys(
  storeName: CacheStoreName
): Promise<string[]> {
  const database = await openCacheDb();
  if (!database) {
    return [];
  }
  try {
    const transaction = database.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const result = await requestToPromise(store.getAllKeys());
    return result.map((key) => String(key));
  } catch {
    return [];
  }
}
