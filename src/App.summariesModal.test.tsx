import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  DEFAULT_SUMMARY_PROMPT,
  writeCachedSummaryForTranscript
} from "./hooks/useTranscriptSummary";
import { resetCacheDbForTests } from "./storage/indexedDbCache";
import { writeCachedTranscript } from "./storage/transcriptsStorage";

const originalFetch = global.fetch;
const defaultPromptCacheKey = `${DEFAULT_SUMMARY_PROMPT}\n__MODEL__:`;

function writeBoardWithVideo(): void {
  window.localStorage.setItem(
    "youtube-watch:boards:v1",
    JSON.stringify([
      {
        id: "board-1",
        name: "Board 1",
        kind: "channels",
        columnScopeFilter: ["__all__"],
        watchedVideos: {},
        viewCountRefreshedAtByVideoId: {},
        videoFilter: "all",
        videoDurationFilter: ["all"],
        videoWindowDays: 90,
        defaultPlaybackRate: 1.5,
        columns: [
          {
            id: "column-1",
            handleInput: "@one",
            currentHandle: "@one",
            channelId: "channel-1",
            uploadsPlaylistId: "uploads-1",
            channelThumbnailUrl: "",
            lastGoodChannelThumbnailUrl: "",
            videos: [
              {
                videoId: "video-1",
                title: "Summarizable Video",
                publishedAt: new Date().toISOString(),
                thumbnailUrl: "https://img.test/video-1.jpg",
                channelTitle: "One",
                videoUrl: "https://www.youtube.com/watch?v=video-1",
                viewCount: 1
              }
            ],
            lastFetchAt: null
          }
        ]
      }
    ])
  );
  window.localStorage.setItem("youtube-watch:active-board-id:v1", "board-1");
}

describe("App summaries modal", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({})
    } as Response) as typeof fetch;
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      ((element: Element) =>
        ({
          getPropertyValue: () => "",
          overflow: element instanceof HTMLElement ? element.style.overflow || "" : ""
        }) as CSSStyleDeclaration) as typeof window.getComputedStyle
    );
    await resetCacheDbForTests();
  });

  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    global.fetch = originalFetch;
    window.localStorage.clear();
    await resetCacheDbForTests();
  });

  it("opens board summaries as a modal from the topbar action", async () => {
    writeBoardWithVideo();
    await writeCachedTranscript("video-1", "Cached transcript body");
    await writeCachedSummaryForTranscript("video-1", "Cached transcript body", defaultPromptCacheKey, {
      summary: "Cached board summary",
      keyPoints: [],
      model: "openai/gpt-4o-mini"
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Summarize all shown videos" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy all board summaries" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Return to board" })).not.toBeInTheDocument();
    expect(screen.queryByText(/^SUMMARIES:/)).not.toBeInTheDocument();
  });
});
