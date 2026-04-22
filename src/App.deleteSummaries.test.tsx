import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { resetCacheDbForTests } from "./storage/indexedDbCache";
import {
  readCachedSummary,
  SUMMARY_CACHE_KEY_PREFIX,
  SUMMARY_FORMATS_STORAGE_KEY,
  type SummaryCacheEntry,
  writeCachedSummary
} from "./storage/summariesStorage";

const originalFetch = global.fetch;

describe("App delete summaries", () => {
  beforeEach(async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({})
    } as Response) as typeof fetch;

    window.localStorage.removeItem(SUMMARY_FORMATS_STORAGE_KEY);
    window.localStorage.removeItem(`${SUMMARY_CACHE_KEY_PREFIX}video-legacy:prompt-hash`);
    await resetCacheDbForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it("clears cached summaries and closes the modal without resetting summary formats", async () => {
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      ((element: Element) =>
        ({
          getPropertyValue: () => "",
          overflow: element instanceof HTMLElement ? element.style.overflow || "" : ""
        }) as CSSStyleDeclaration) as typeof window.getComputedStyle
    );

    const payload: SummaryCacheEntry = {
      summary: "Summary body",
      keyPoints: ["First point"],
      model: "openai/gpt-4o-mini",
      transcriptHash: "transcript-hash",
      promptHash: "prompt-hash",
      cachedAt: Date.now()
    };

    await writeCachedSummary("video-1", "prompt-hash", payload);
    window.localStorage.setItem(
      `${SUMMARY_CACHE_KEY_PREFIX}video-legacy:prompt-hash`,
      JSON.stringify(payload)
    );
    window.localStorage.setItem(
      SUMMARY_FORMATS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "summary-default",
          name: "Summary",
          prompt: "Prompt",
          model: "openai/gpt-4o-mini",
          isDefault: true,
          createdAt: 1,
          updatedAt: 1
        }
      ])
    );

    render(<App />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Open maintenance menu" }));
    });
    act(() => {
      fireEvent.click(screen.getByText("DELETE SUMMARIES"));
    });

    const dialog = screen.getByRole("dialog", { name: "Delete Summaries" });
    expect(within(dialog).getByText("Delete all cached summaries?")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(
        (screen.getByRole("dialog", { name: "Delete Summaries", hidden: true }) as HTMLElement).style.display
      ).toBe("none");
    });

    await expect(readCachedSummary("video-1", "prompt-hash")).resolves.toBeNull();
    expect(window.localStorage.getItem(`${SUMMARY_CACHE_KEY_PREFIX}video-legacy:prompt-hash`)).toBeNull();
    expect(window.localStorage.getItem(SUMMARY_FORMATS_STORAGE_KEY)).toContain(
      "\"model\":\"openai/gpt-4o-mini\""
    );
  });
});
