import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  DEFAULT_SUMMARY_PROMPT,
  readCachedSummaryForTranscript,
  writeCachedSummaryForTranscript
} from "./hooks/useTranscriptSummary";
import { resetCacheDbForTests } from "./storage/indexedDbCache";
import { writeCachedTranscript } from "./storage/transcriptsStorage";

const originalFetch = global.fetch;
const defaultPromptCacheKey = `${DEFAULT_SUMMARY_PROMPT}\n__MODEL__:`;

function getFetchCalls(path: string): Array<{ input: RequestInfo | URL; init?: RequestInit }> {
  const mockFetch = vi.mocked(global.fetch);
  return mockFetch.mock.calls
    .filter(([input]) => String(input).includes(path))
    .map(([input, init]) => ({ input, init }));
}

function writeBoardWithVideo(videoFilter: "all" | "new" | "watched" = "all"): void {
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
        videoFilter,
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
    expect(await screen.findByText("Cached board summary")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy all board summaries" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Return to board" })).not.toBeInTheDocument();
    expect(screen.queryByText(/^SUMMARIES:/)).not.toBeInTheDocument();
    expect(getFetchCalls("/api/transcript")).toHaveLength(0);
    expect(getFetchCalls("/api/summarize")).toHaveLength(0);
  });

  it("opens a cached individual summary without fetching transcript or summary", async () => {
    writeBoardWithVideo();
    await writeCachedSummaryForTranscript("video-1", "Cached transcript body", defaultPromptCacheKey, {
      summary: "Cached individual summary",
      keyPoints: [],
      model: "openai/gpt-4o-mini"
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open transcript for Summarizable Video" }));

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => {
      expect(screen.getByText("Cached individual summary")).toBeInTheDocument();
    });
    expect(dialog).toHaveTextContent("MODEL: openai/gpt-4o-mini");
    expect(getFetchCalls("/api/transcript")).toHaveLength(0);
    expect(getFetchCalls("/api/summarize")).toHaveLength(0);
  });

  it("generates board summaries from a cached transcript without refetching transcript", async () => {
    writeBoardWithVideo();
    await writeCachedTranscript("video-1", "Cached transcript body");
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/summarize")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            videoId: "video-1",
            model: "openai/gpt-5.4-nano",
            summary: "Generated board summary",
            keyPoints: []
          })
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({})
      } as Response;
    }) as typeof fetch;

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Summarize all shown videos" }));

    expect(await screen.findByText("Generated board summary")).toBeInTheDocument();
    expect(getFetchCalls("/api/transcript")).toHaveLength(0);
    const summaryCalls = getFetchCalls("/api/summarize");
    expect(summaryCalls).toHaveLength(1);
    expect(JSON.parse(String(summaryCalls[0]?.init?.body))).toMatchObject({
      transcriptText: "Cached transcript body",
      prompt: DEFAULT_SUMMARY_PROMPT
    });
    await expect(
      readCachedSummaryForTranscript("video-1", "Cached transcript body", defaultPromptCacheKey)
    ).resolves.toMatchObject({
      summary: "Generated board summary",
      model: "openai/gpt-5.4-nano"
    });
  });

  it("fetches transcript once before generating an uncached board summary", async () => {
    writeBoardWithVideo();
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/transcript")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            videoId: "video-1",
            text: "Fetched transcript body"
          })
        } as Response;
      }
      if (String(input).includes("/api/summarize")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            videoId: "video-1",
            model: "openai/gpt-5.4-nano",
            summary: "Fresh board summary",
            keyPoints: []
          })
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({})
      } as Response;
    }) as typeof fetch;

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Summarize all shown videos" }));

    expect(await screen.findByText("Fresh board summary")).toBeInTheDocument();
    const transcriptCalls = getFetchCalls("/api/transcript");
    expect(transcriptCalls).toHaveLength(1);
    expect(JSON.parse(String(transcriptCalls[0]?.init?.body))).toEqual({
      url: "https://www.youtube.com/watch?v=video-1"
    });
    const summaryCalls = getFetchCalls("/api/summarize");
    expect(summaryCalls).toHaveLength(1);
    expect(JSON.parse(String(summaryCalls[0]?.init?.body))).toMatchObject({
      transcriptText: "Fetched transcript body",
      prompt: DEFAULT_SUMMARY_PROMPT
    });
  });

  it("removes summary rows after bulk marking shown videos watched from the modal", async () => {
    writeBoardWithVideo("new");
    await writeCachedTranscript("video-1", "Cached transcript body");
    await writeCachedSummaryForTranscript("video-1", "Cached transcript body", defaultPromptCacheKey, {
      summary: "Cached board summary",
      keyPoints: [],
      model: "openai/gpt-4o-mini"
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Summarize all shown videos" }));

    expect(await screen.findByText("SUMMARIZABLE VIDEO")).toBeInTheDocument();

    const markAllWatchedButtons = screen.getAllByRole("button", {
      name: "Mark all shown videos watched"
    });
    fireEvent.click(markAllWatchedButtons[markAllWatchedButtons.length - 1]);
    fireEvent.click(await screen.findByRole("button", { name: "WATCHED" }));

    await waitFor(() => {
      expect(screen.queryByText("SUMMARIZABLE VIDEO")).not.toBeInTheDocument();
    });
  });
});
