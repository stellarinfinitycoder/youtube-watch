import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { resetCacheDbForTests } from "./storage/indexedDbCache";
import { readCachedSummary, writeCachedSummary } from "./storage/summariesStorage";
import { writeCachedTranscript } from "./storage/transcriptsStorage";
import {
  DEFAULT_SUMMARY_PROMPT,
  writeCachedSummaryForTranscript
} from "./hooks/useTranscriptSummary";

const originalFetch = global.fetch;
const defaultPromptCacheKey = `${DEFAULT_SUMMARY_PROMPT}\n__MODEL__:`;

function getVideoTileByTitle(title: string): HTMLElement | undefined {
  return screen
    .getAllByText(title)
    .map((element) => element.closest(".video-tile-item"))
    .find((element): element is HTMLElement => element instanceof HTMLElement);
}

function writeBoards(options: {
  watchedVideos?: Record<string, number>;
  savedVideoIds?: string[];
  activeBoardId?: string;
} = {}): void {
  const videos = [
    {
      videoId: "older-video",
      title: "Older Summarized Video",
      publishedAt: "2026-04-10T10:00:00Z",
      thumbnailUrl: "https://img.test/older.jpg",
      channelTitle: "One",
      videoUrl: "https://www.youtube.com/watch?v=older-video",
      viewCount: 1
    },
    {
      videoId: "newer-video",
      title: "Newer Summarized Video",
      publishedAt: "2026-04-11T10:00:00Z",
      thumbnailUrl: "https://img.test/newer.jpg",
      channelTitle: "One",
      videoUrl: "https://www.youtube.com/watch?v=newer-video",
      viewCount: 2
    }
  ];
  const savedVideos = videos.filter((video) => options.savedVideoIds?.includes(video.videoId));
  window.localStorage.setItem(
    "youtube-watch:boards:v1",
    JSON.stringify([
      {
        id: "board-1",
        name: "Board 1",
        kind: "channels",
        columnScopeFilter: ["__all__"],
        watchedVideos: options.watchedVideos ?? {},
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
            videos,
            lastFetchAt: null
          }
        ]
      },
      {
        id: "saved-board-system",
        name: "SAVED LISTS",
        kind: "saved",
        columnScopeFilter: ["__all__"],
        watchedVideos: options.watchedVideos ?? {},
        viewCountRefreshedAtByVideoId: {},
        videoFilter: "all",
        videoDurationFilter: ["all"],
        videoWindowDays: "saved_all",
        defaultPlaybackRate: 1.5,
        columns: [
          {
            id: "saved-column-1",
            handleInput: "Saved",
            currentHandle: "Saved",
            channelId: "",
            uploadsPlaylistId: "",
            channelThumbnailUrl: "",
            lastGoodChannelThumbnailUrl: "",
            videos: savedVideos,
            lastFetchAt: null,
            savedSortMode: "added_desc",
            savedAddedAtByVideoId: Object.fromEntries(savedVideos.map((video) => [video.videoId, 1])),
            savedManualOrder: savedVideos.map((video) => video.videoId)
          }
        ]
      }
    ])
  );
  window.localStorage.setItem("youtube-watch:active-board-id:v1", options.activeBoardId ?? "board-1");
}

describe("App summaries board", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    global.fetch = originalFetch;
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      ((element: Element) =>
        ({
          getPropertyValue: () => "",
          overflow: element instanceof HTMLElement ? element.style.overflow || "" : ""
        }) as CSSStyleDeclaration) as typeof window.getComputedStyle
    );
    await resetCacheDbForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it("shows cached summaries in the right pane and selects videos instead of opening the player", async () => {
    const user = userEvent.setup();
    writeBoards();
    await writeCachedSummary("older-video", "older-prompt", {
      summary: "Older cached summary body",
      keyPoints: [],
      model: "openai/gpt-4o-mini",
      transcriptHash: "older-transcript",
      promptHash: "older-prompt",
      cachedAt: 10
    });
    await writeCachedSummary("newer-video", "newer-prompt", {
      summary: "Newer cached summary body",
      keyPoints: [],
      model: "openai/gpt-4o-mini",
      transcriptHash: "newer-transcript",
      promptHash: "newer-prompt",
      cachedAt: 20
    });

    render(<App />);

    const boardSelect = screen.getByTestId("topbar-board-select");
    fireEvent.mouseDown(boardSelect.querySelector(".ant-select-selector") ?? boardSelect);
    fireEvent.click(await screen.findByText("SUMMARIES"));

    const channelScopeSelect = screen.getByTestId("topbar-channel-scope-select");
    expect(channelScopeSelect).toHaveClass("ant-select-disabled");
    expect(screen.getByText("ALL CHANNELS")).toBeInTheDocument();
    expect(await screen.findByText("Newer cached summary body")).toBeInTheDocument();
    expect(getVideoTileByTitle("Newer Summarized Video")).toHaveClass("is-active");

    const olderVideoButtons = screen.getAllByRole("button", { name: "Older Summarized Video" });
    expect(olderVideoButtons).toHaveLength(2);
    await user.click(olderVideoButtons[1]);

    expect(await screen.findByText("Older cached summary body")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(getVideoTileByTitle("Older Summarized Video")).toHaveClass("is-active");

    await user.click(screen.getByRole("button", { name: "Delete STORED SUMMARY - GPT-4O-MINI - 1970-01-01" }));

    await waitFor(() => {
      expect(screen.queryByText("Older cached summary body")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Older Summarized Video")).not.toBeInTheDocument();
    expect(await screen.findByText("Newer cached summary body")).toBeInTheDocument();
    expect(getVideoTileByTitle("Newer Summarized Video")).toHaveClass("is-active");
  });

  it("refreshes the selected video summaries after generating a new individual summary", async () => {
    const user = userEvent.setup();
    writeBoards();
    await writeCachedTranscript("newer-video", "Existing transcript body");
    await writeCachedSummaryForTranscript("newer-video", "Existing transcript body", defaultPromptCacheKey, {
      summary: "Existing cached summary body",
      keyPoints: [],
      model: "openai/gpt-4o-mini"
    });

    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/summarize")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            videoId: "newer-video",
            model: "openai/gpt-5.4-nano",
            summary: "Fresh generated summary body",
            keyPoints: []
          })
        } as Response;
      }
      if (url.includes("/api/transcript")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            videoId: "newer-video",
            text: "Existing transcript body"
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

    const boardSelect = screen.getByTestId("topbar-board-select");
    fireEvent.mouseDown(boardSelect.querySelector(".ant-select-selector") ?? boardSelect);
    fireEvent.click(await screen.findByText("SUMMARIES"));

    const detailPane = screen.getByLabelText("Stored summaries");
    expect(await within(detailPane).findByText("Existing cached summary body")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open transcript for Newer Summarized Video" }));
    const dialog = await screen.findByRole("dialog");
    const regenerateButton = within(dialog).getByRole("button", { name: "Regenerate summary" });
    await waitFor(() => {
      expect(regenerateButton).toBeEnabled();
    });
    await user.click(regenerateButton);

    expect(await within(dialog).findByText("Fresh generated summary body")).toBeInTheDocument();
    expect(await within(detailPane).findByText("Fresh generated summary body")).toBeInTheDocument();
    expect(getVideoTileByTitle("Newer Summarized Video")).toHaveClass("is-active");
  });

  it("removes cached summaries when a non-saved summarized video is marked watched", async () => {
    const user = userEvent.setup();
    writeBoards();
    await writeCachedSummary("newer-video", "newer-prompt", {
      summary: "Newer cached summary body",
      keyPoints: [],
      model: "openai/gpt-4o-mini",
      transcriptHash: "newer-transcript",
      promptHash: "newer-prompt",
      cachedAt: 20
    });

    render(<App />);

    const boardSelect = screen.getByTestId("topbar-board-select");
    fireEvent.mouseDown(boardSelect.querySelector(".ant-select-selector") ?? boardSelect);
    fireEvent.click(await screen.findByText("SUMMARIES"));

    expect(await screen.findByText("Newer cached summary body")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark Newer Summarized Video as watched" }));

    await waitFor(() => {
      expect(screen.queryByText("Newer cached summary body")).not.toBeInTheDocument();
    });
    await waitFor(async () => {
      await expect(readCachedSummary("newer-video", "newer-prompt")).resolves.toBeNull();
    });
    expect(screen.queryByText("Newer Summarized Video")).not.toBeInTheDocument();
  });

  it("keeps cached summaries for saved videos when they are marked watched", async () => {
    const user = userEvent.setup();
    writeBoards({ savedVideoIds: ["newer-video"] });
    await writeCachedSummary("newer-video", "newer-prompt", {
      summary: "Saved cached summary body",
      keyPoints: [],
      model: "openai/gpt-4o-mini",
      transcriptHash: "newer-transcript",
      promptHash: "newer-prompt",
      cachedAt: 20
    });

    render(<App />);

    const boardSelect = screen.getByTestId("topbar-board-select");
    fireEvent.mouseDown(boardSelect.querySelector(".ant-select-selector") ?? boardSelect);
    fireEvent.click(await screen.findByText("SUMMARIES"));

    expect(await screen.findByText("Saved cached summary body")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark Newer Summarized Video as watched" }));

    expect(await screen.findByText("Saved cached summary body")).toBeInTheDocument();
    await expect(readCachedSummary("newer-video", "newer-prompt")).resolves.not.toBeNull();
    expect(getVideoTileByTitle("Newer Summarized Video")).toBeInTheDocument();
  });

  it("cleans existing watched non-saved cached summaries after app load", async () => {
    writeBoards({ watchedVideos: { "newer-video": 1 } });
    await writeCachedSummary("newer-video", "newer-prompt", {
      summary: "Stale watched summary body",
      keyPoints: [],
      model: "openai/gpt-4o-mini",
      transcriptHash: "newer-transcript",
      promptHash: "newer-prompt",
      cachedAt: 20
    });

    render(<App />);

    const boardSelect = screen.getByTestId("topbar-board-select");
    fireEvent.mouseDown(boardSelect.querySelector(".ant-select-selector") ?? boardSelect);
    fireEvent.click(await screen.findByText("SUMMARIES"));

    await waitFor(() => {
      expect(screen.queryByText("Stale watched summary body")).not.toBeInTheDocument();
    });
    await waitFor(async () => {
      await expect(readCachedSummary("newer-video", "newer-prompt")).resolves.toBeNull();
    });
    expect(screen.queryByText("Newer Summarized Video")).not.toBeInTheDocument();
  });
});
