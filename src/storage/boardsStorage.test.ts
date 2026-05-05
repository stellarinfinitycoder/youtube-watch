import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetCacheDbForTests } from "./indexedDbCache";
import {
  ACTIVE_BOARD_ID_STORAGE_KEY,
  BOARDS_STORAGE_KEY,
  persistBoardsPayload,
  readStoredActiveBoardId,
  readStoredBoardsPayload,
  readStoredBoardsState
} from "./boardsStorage";

describe("boards storage", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await resetCacheDbForTests();
  });

  it("round-trips boards and active board id through IndexedDB-backed storage", async () => {
    const boardsPayload = [{ id: "board-1", name: "Board 1", watchedVideos: { "vid-1": 1 } }];

    await expect(
      persistBoardsPayload(JSON.stringify(boardsPayload), "board-1")
    ).resolves.toBe(true);
    window.localStorage.clear();

    await expect(readStoredBoardsState()).resolves.toEqual({
      boardsPayload,
      activeBoardId: "board-1"
    });
  });

  it("migrates legacy localStorage board entries into IndexedDB", async () => {
    const boardsPayload = [{ id: "legacy-board", name: "Legacy Board", watchedVideos: {} }];
    window.localStorage.setItem(BOARDS_STORAGE_KEY, JSON.stringify(boardsPayload));
    window.localStorage.setItem(ACTIVE_BOARD_ID_STORAGE_KEY, "legacy-board");

    await expect(readStoredBoardsState()).resolves.toEqual({
      boardsPayload,
      activeBoardId: "legacy-board"
    });

    window.localStorage.clear();
    await expect(readStoredBoardsState()).resolves.toEqual({
      boardsPayload,
      activeBoardId: "legacy-board"
    });
  });

  it("falls back to localStorage when IndexedDB is unavailable", async () => {
    const originalIndexedDb = window.indexedDB;
    await resetCacheDbForTests();
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: undefined
    });

    try {
      const boardsPayload = [{ id: "fallback-board", watchedVideos: {} }];
      await expect(
        persistBoardsPayload(JSON.stringify(boardsPayload), "fallback-board")
      ).resolves.toBe(true);

      expect(readStoredBoardsPayload()).toEqual(boardsPayload);
      expect(readStoredActiveBoardId()).toBe("fallback-board");
    } finally {
      Object.defineProperty(window, "indexedDB", {
        configurable: true,
        value: originalIndexedDb
      });
      await resetCacheDbForTests();
    }
  });

  it("reports failure when IndexedDB and fallback localStorage writes both fail", async () => {
    const originalIndexedDb = window.indexedDB;
    await resetCacheDbForTests();
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: undefined
    });
    const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
    Object.defineProperty(window.localStorage, "setItem", {
      configurable: true,
      value: () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }
    });

    try {
      await expect(
        persistBoardsPayload(JSON.stringify([{ id: "failed-board" }]), "failed-board")
      ).resolves.toBe(false);
    } finally {
      Object.defineProperty(window.localStorage, "setItem", {
        configurable: true,
        value: originalSetItem
      });
      Object.defineProperty(window, "indexedDB", {
        configurable: true,
        value: originalIndexedDb
      });
      await resetCacheDbForTests();
    }
  });
});
