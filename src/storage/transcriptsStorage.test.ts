import { beforeEach, describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { resetCacheDbForTests } from "./indexedDbCache";
import {
  readCachedTranscript,
  TRANSCRIPT_CACHE_KEY_PREFIX,
  writeCachedTranscript
} from "./transcriptsStorage";

describe("transcriptsStorage", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await resetCacheDbForTests();
  });

  it("round-trips transcripts through IndexedDB-backed storage", async () => {
    await writeCachedTranscript("video-1", "Transcript body");

    await expect(readCachedTranscript("video-1")).resolves.toBe("Transcript body");
  });

  it("migrates legacy localStorage transcript cache entries", async () => {
    window.localStorage.setItem(
      `${TRANSCRIPT_CACHE_KEY_PREFIX}video-legacy`,
      JSON.stringify({
        text: "Legacy transcript body",
        cachedAt: Date.now()
      })
    );

    await expect(readCachedTranscript("video-legacy")).resolves.toBe("Legacy transcript body");
    await waitFor(() => {
      expect(window.localStorage.getItem(`${TRANSCRIPT_CACHE_KEY_PREFIX}video-legacy`)).toBeNull();
    });
  });
});
