import { beforeEach, describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { resetCacheDbForTests } from "./indexedDbCache";
import {
  readCachedSummary,
  SUMMARY_CACHE_KEY_PREFIX,
  type SummaryCacheEntry,
  writeCachedSummary
} from "./summariesStorage";

const payload: SummaryCacheEntry = {
  summary: "Summary body",
  keyPoints: ["First point"],
  model: "openai/gpt-4o-mini",
  transcriptHash: "transcript-hash",
  promptHash: "prompt-hash",
  cachedAt: Date.now()
};

describe("summariesStorage", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await resetCacheDbForTests();
  });

  it("round-trips summaries through IndexedDB-backed storage", async () => {
    await writeCachedSummary("video-1", "prompt-hash", payload);

    await expect(readCachedSummary("video-1", "prompt-hash")).resolves.toEqual(payload);
  });

  it("migrates legacy localStorage summary cache entries", async () => {
    window.localStorage.setItem(
      `${SUMMARY_CACHE_KEY_PREFIX}video-legacy:prompt-hash`,
      JSON.stringify(payload)
    );

    await expect(readCachedSummary("video-legacy", "prompt-hash")).resolves.toEqual(payload);
    await waitFor(() => {
      expect(
        window.localStorage.getItem(`${SUMMARY_CACHE_KEY_PREFIX}video-legacy:prompt-hash`)
      ).toBeNull();
    });
  });
});
