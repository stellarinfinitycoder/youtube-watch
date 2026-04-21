import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false
  })
});

if (typeof window.localStorage?.setItem !== "function") {
  const memoryStorage = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    writable: true,
    value: {
      getItem: (key: string) => memoryStorage.get(key) ?? null,
      key: (index: number) => [...memoryStorage.keys()][index] ?? null,
      get length() {
        return memoryStorage.size;
      },
      setItem: (key: string, value: string) => {
        memoryStorage.set(key, value);
      },
      removeItem: (key: string) => {
        memoryStorage.delete(key);
      },
      clear: () => {
        memoryStorage.clear();
      }
    }
  });
}

if (typeof window.indexedDB?.open !== "function") {
  class FakeIdbRequest<T> {
    result!: T;
    error: Error | null = null;
    onsuccess: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onupgradeneeded: ((event: Event) => void) | null = null;
    onblocked: ((event: Event) => void) | null = null;
  }

  class FakeObjectStore {
    constructor(private readonly store: Map<string, unknown>) {}

    get(key: string): FakeIdbRequest<unknown> {
      const request = new FakeIdbRequest<unknown>();
      queueMicrotask(() => {
        request.result = this.store.get(key);
        request.onsuccess?.(new Event("success"));
      });
      return request;
    }

    put(value: unknown, key: string): FakeIdbRequest<string> {
      const request = new FakeIdbRequest<string>();
      queueMicrotask(() => {
        this.store.set(key, value);
        request.result = key;
        request.onsuccess?.(new Event("success"));
      });
      return request;
    }

    delete(key: string): FakeIdbRequest<undefined> {
      const request = new FakeIdbRequest<undefined>();
      queueMicrotask(() => {
        this.store.delete(key);
        request.result = undefined;
        request.onsuccess?.(new Event("success"));
      });
      return request;
    }

    getAllKeys(): FakeIdbRequest<IDBValidKey[]> {
      const request = new FakeIdbRequest<IDBValidKey[]>();
      queueMicrotask(() => {
        request.result = [...this.store.keys()];
        request.onsuccess?.(new Event("success"));
      });
      return request;
    }
  }

  class FakeTransaction {
    oncomplete: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    error: Error | null = null;

    constructor(private readonly stores: Map<string, Map<string, unknown>>) {
      queueMicrotask(() => {
        this.oncomplete?.();
      });
    }

    objectStore(name: string): FakeObjectStore {
      const store = this.stores.get(name);
      if (!store) {
        throw new Error(`Missing store ${name}`);
      }
      return new FakeObjectStore(store);
    }
  }

  class FakeDatabase {
    onversionchange: (() => void) | null = null;
    objectStoreNames = {
      contains: (name: string) => this.stores.has(name)
    };

    constructor(private readonly stores: Map<string, Map<string, unknown>>) {}

    createObjectStore(name: string): void {
      if (!this.stores.has(name)) {
        this.stores.set(name, new Map<string, unknown>());
      }
    }

    transaction(name: string, _mode: IDBTransactionMode): FakeTransaction {
      return new FakeTransaction(this.stores);
    }

    close(): void {
      // noop
    }
  }

  const databases = new Map<string, { version: number; stores: Map<string, Map<string, unknown>> }>();

  Object.defineProperty(window, "indexedDB", {
    writable: true,
    value: {
      open: (name: string, version?: number) => {
        const request = new FakeIdbRequest<FakeDatabase>();
        queueMicrotask(() => {
          const existing = databases.get(name);
          const nextVersion = version ?? existing?.version ?? 1;
          const stores = existing?.stores ?? new Map<string, Map<string, unknown>>();
          const database = new FakeDatabase(stores);
          if (!existing || nextVersion > existing.version) {
            databases.set(name, { version: nextVersion, stores });
            request.result = database;
            request.onupgradeneeded?.(new Event("upgradeneeded"));
          } else {
            request.result = database;
          }
          request.onsuccess?.(new Event("success"));
        });
        return request;
      },
      deleteDatabase: (name: string) => {
        const request = new FakeIdbRequest<undefined>();
        queueMicrotask(() => {
          databases.delete(name);
          request.result = undefined;
          request.onsuccess?.(new Event("success"));
        });
        return request;
      }
    }
  });
}
