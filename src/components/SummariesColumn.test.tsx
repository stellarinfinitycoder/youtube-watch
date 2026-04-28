import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SummariesColumn } from "./SummariesColumn";
import type { SummariesBoardVideo } from "../domain/summariesBoard";

const summaryVideo: SummariesBoardVideo = {
  video: {
    videoId: "video-1",
    title: "Summarized Video",
    publishedAt: "2026-04-10T10:00:00Z",
    thumbnailUrl: "https://img.test/video-1.jpg",
    channelTitle: "Example Channel",
    videoUrl: "https://www.youtube.com/watch?v=video-1",
    viewCount: 100
  },
  sourceColumn: {
    id: "column-1",
    handleInput: "@example",
    currentHandle: "@example",
    channelThumbnailUrl: "",
    lastGoodChannelThumbnailUrl: "",
    videos: [],
    loading: false,
    error: null,
    savedSortMode: ""
  },
  latestSummaryCachedAt: 20,
  isWatched: false
};

describe("SummariesColumn", () => {
  it("renders channel-style video tiles, selected state, and stored summaries without column action buttons", async () => {
    const deleteStoredSummary = vi.fn();

    render(
      <SummariesColumn
        activeBoardId="__summaries_board__"
        videos={[summaryVideo]}
        selectedVideoId="video-1"
        selectedSummaryEntries={[
          {
            id: "summary-1",
            label: "TLDR - GPT-4O-MINI - 2026-04-28",
            summary: "Cached summary text",
            keyPoints: [],
            model: "openai/gpt-4o-mini",
            cachedAt: Date.parse("2026-04-28T10:00:00Z"),
            promptHash: "summary-1",
            summaryFormatId: "tldr"
          }
        ]}
        selectedSummaryLoading={false}
        selectedSummaryError={null}
        copiedLinkVideoId={null}
        saveDestinationColumnsLength={1}
        videoStatsBackfillInFlight={[]}
        videoMetaFeedbackById={{}}
        formatVideoMeta={() => "10.04 | -- | 100"}
        backfillVideoStats={async () => undefined}
        getVideoThumbnailSrc={(video) => video.thumbnailUrl}
        handleVideoThumbnailError={() => undefined}
        openTranscript={async () => undefined}
        copyVideoLink={async () => undefined}
        openSaveVideoModal={() => undefined}
        toggleWatched={() => undefined}
        openVideo={() => undefined}
        deleteStoredSummary={deleteStoredSummary}
      />
    );

    expect(screen.getByText("Summarized Video")).toBeInTheDocument();
    expect(screen.getByText("TLDR - GPT-4O-MINI - 2026-04-28")).toBeInTheDocument();
    expect(await screen.findByText("Cached summary text")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open transcript for Summarized Video" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Summarized Video" })).toBeInTheDocument();
    const deleteSummaryButton = screen.getByRole("button", {
      name: "Delete TLDR - GPT-4O-MINI - 2026-04-28"
    });
    const copySummaryButton = screen.getByRole("button", {
      name: "Copy TLDR - GPT-4O-MINI - 2026-04-28"
    });
    expect(copySummaryButton).toHaveClass("board-summary-row-copy-btn");
    expect(copySummaryButton.querySelector(".btn-icon-copy")).not.toBeNull();
    expect(deleteSummaryButton).toHaveClass("remove-column-btn");
    expect(deleteSummaryButton.querySelector(".btn-icon-delete")).not.toBeNull();
    expect(screen.getByText("Summarized Video").closest(".video-tile-item")).toHaveClass("is-active");
    expect(screen.queryByTestId("column-fetch")).not.toBeInTheDocument();
    expect(screen.queryByTestId("column-play")).not.toBeInTheDocument();
    expect(screen.queryByTestId("column-delete")).not.toBeInTheDocument();
  });

  it("selects videos from title and thumbnail clicks", async () => {
    const user = userEvent.setup();
    const openVideo = vi.fn();

    render(
      <SummariesColumn
        activeBoardId="__summaries_board__"
        videos={[summaryVideo]}
        selectedVideoId={null}
        selectedSummaryEntries={[]}
        selectedSummaryLoading={false}
        selectedSummaryError={null}
        copiedLinkVideoId={null}
        saveDestinationColumnsLength={1}
        videoStatsBackfillInFlight={[]}
        videoMetaFeedbackById={{}}
        formatVideoMeta={() => "10.04 | -- | 100"}
        backfillVideoStats={async () => undefined}
        getVideoThumbnailSrc={(video) => video.thumbnailUrl}
        handleVideoThumbnailError={() => undefined}
        openTranscript={async () => undefined}
        copyVideoLink={async () => undefined}
        openSaveVideoModal={() => undefined}
        toggleWatched={() => undefined}
        openVideo={openVideo}
        deleteStoredSummary={async () => undefined}
      />
    );

    const videoButtons = screen.getAllByRole("button", { name: "Summarized Video" });
    expect(videoButtons).toHaveLength(2);
    await user.click(videoButtons[1]);
    await user.click(videoButtons[0]);

    expect(openVideo).toHaveBeenCalledTimes(2);
    expect(openVideo).toHaveBeenNthCalledWith(1, summaryVideo.video);
    expect(openVideo).toHaveBeenNthCalledWith(2, summaryVideo.video);
  });

  it("deletes the selected stored summary", async () => {
    const user = userEvent.setup();
    const deleteStoredSummary = vi.fn().mockResolvedValue(undefined);

    render(
      <SummariesColumn
        activeBoardId="__summaries_board__"
        videos={[summaryVideo]}
        selectedVideoId="video-1"
        selectedSummaryEntries={[
          {
            id: "summary-1",
            label: "TLDR - GPT-4O-MINI - 2026-04-28",
            summary: "Cached summary text",
            keyPoints: [],
            model: "openai/gpt-4o-mini",
            cachedAt: Date.parse("2026-04-28T10:00:00Z"),
            promptHash: "summary-1",
            summaryFormatId: "tldr"
          }
        ]}
        selectedSummaryLoading={false}
        selectedSummaryError={null}
        copiedLinkVideoId={null}
        saveDestinationColumnsLength={1}
        videoStatsBackfillInFlight={[]}
        videoMetaFeedbackById={{}}
        formatVideoMeta={() => "10.04 | -- | 100"}
        backfillVideoStats={async () => undefined}
        getVideoThumbnailSrc={(video) => video.thumbnailUrl}
        handleVideoThumbnailError={() => undefined}
        openTranscript={async () => undefined}
        copyVideoLink={async () => undefined}
        openSaveVideoModal={() => undefined}
        toggleWatched={() => undefined}
        openVideo={() => undefined}
        deleteStoredSummary={deleteStoredSummary}
      />
    );

    await user.click(screen.getByRole("button", { name: "Delete TLDR - GPT-4O-MINI - 2026-04-28" }));

    expect(deleteStoredSummary).toHaveBeenCalledWith("summary-1");
  });

  it("copies the selected stored summary with copied feedback", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    render(
      <SummariesColumn
        activeBoardId="__summaries_board__"
        videos={[summaryVideo]}
        selectedVideoId="video-1"
        selectedSummaryEntries={[
          {
            id: "summary-1",
            label: "TLDR - GPT-4O-MINI - 2026-04-28",
            summary: "Cached summary text",
            keyPoints: [],
            model: "openai/gpt-4o-mini",
            cachedAt: Date.parse("2026-04-28T10:00:00Z"),
            promptHash: "summary-1",
            summaryFormatId: "tldr"
          }
        ]}
        selectedSummaryLoading={false}
        selectedSummaryError={null}
        copiedLinkVideoId={null}
        saveDestinationColumnsLength={1}
        videoStatsBackfillInFlight={[]}
        videoMetaFeedbackById={{}}
        formatVideoMeta={() => "10.04 | -- | 100"}
        backfillVideoStats={async () => undefined}
        getVideoThumbnailSrc={(video) => video.thumbnailUrl}
        handleVideoThumbnailError={() => undefined}
        openTranscript={async () => undefined}
        copyVideoLink={async () => undefined}
        openSaveVideoModal={() => undefined}
        toggleWatched={() => undefined}
        openVideo={() => undefined}
        deleteStoredSummary={async () => undefined}
      />
    );

    const copyButton = screen.getByRole("button", {
      name: "Copy TLDR - GPT-4O-MINI - 2026-04-28"
    });
    await user.click(copyButton);

    expect(writeText).toHaveBeenCalledWith("## TLDR - GPT-4O-MINI - 2026-04-28\n\nCached summary text");
    expect(copyButton).toHaveClass("is-copied");
    expect(copyButton.querySelector(".btn-icon-check")).not.toBeNull();
  });
});
