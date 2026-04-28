import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { resetCacheDbForTests } from "./storage/indexedDbCache";
import { writeCachedSummary } from "./storage/summariesStorage";

function writeBoards(): void {
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
            ],
            lastFetchAt: null
          }
        ]
      }
    ])
  );
  window.localStorage.setItem("youtube-watch:active-board-id:v1", "board-1");
}

describe("App summaries board", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await resetCacheDbForTests();
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
    expect(screen.getByText("Newer Summarized Video").closest(".video-tile-item")).toHaveClass("is-active");

    const olderVideoButtons = screen.getAllByRole("button", { name: "Older Summarized Video" });
    expect(olderVideoButtons).toHaveLength(2);
    await user.click(olderVideoButtons[1]);

    expect(await screen.findByText("Older cached summary body")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Older Summarized Video").closest(".video-tile-item")).toHaveClass("is-active");

    await user.click(screen.getByRole("button", { name: "Delete STORED SUMMARY - GPT-4O-MINI - 1970-01-01" }));

    await waitFor(() => {
      expect(screen.queryByText("Older cached summary body")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Older Summarized Video")).not.toBeInTheDocument();
    expect(await screen.findByText("Newer cached summary body")).toBeInTheDocument();
    expect(screen.getByText("Newer Summarized Video").closest(".video-tile-item")).toHaveClass("is-active");
  });
});
