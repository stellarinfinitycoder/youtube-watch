import { render, screen, within } from "@testing-library/react";
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
    const deleteAllStoredSummaries = vi.fn();

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
        deleteAllStoredSummaries={deleteAllStoredSummaries}
      />
    );

    expect(within(screen.getByLabelText("Stored summaries")).getByText("Summarized Video")).toBeInTheDocument();
    expect(screen.getByText("TLDR")).toBeInTheDocument();
    const summaryMeta = screen.getByText("GPT-4O-MINI | 27.04");
    expect(summaryMeta).toBeInTheDocument();
    expect(summaryMeta).toHaveClass("video-meta");
    expect(await screen.findByText("Cached summary text")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open transcript for Summarized Video" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Summarized Video" })).toBeInTheDocument();
    const deleteSummaryButton = screen.getByRole("button", {
      name: "Delete TLDR - GPT-4O-MINI - 2026-04-28"
    });
    const copySummaryButton = screen.getByRole("button", {
      name: "Copy TLDR - GPT-4O-MINI - 2026-04-28"
    });
    const copySlackSummaryButton = screen.getByRole("button", {
      name: "Copy Slack-ready TLDR - GPT-4O-MINI - 2026-04-28"
    });
    const copyAllButton = screen.getByRole("button", {
      name: "Copy all summaries for Summarized Video"
    });
    const copyAllSlackButton = screen.getByRole("button", {
      name: "Copy Slack-ready summaries for Summarized Video"
    });
    const deleteAllButton = screen.getByRole("button", {
      name: "Delete all summaries for Summarized Video"
    });
    expect(copyAllButton).toHaveClass("board-summary-row-copy-btn");
    expect(copyAllButton.querySelector(".btn-icon-copy")).not.toBeNull();
    expect(deleteAllButton).toHaveClass("remove-column-btn");
    expect(deleteAllButton.querySelector(".btn-icon-delete")).not.toBeNull();
    expect(copySummaryButton).toHaveClass("board-summary-row-copy-btn");
    expect(copySummaryButton.querySelector(".btn-icon-copy")).not.toBeNull();
    expect(copySlackSummaryButton).toHaveClass("board-summary-row-copy-btn");
    expect(copySlackSummaryButton.querySelector(".btn-icon-slack")).toHaveClass("anticon-slack");
    expect(copyAllSlackButton).toHaveClass("board-summary-row-copy-btn");
    expect(copyAllSlackButton.querySelector(".btn-icon-slack")).toHaveClass("anticon-slack");
    expect(deleteSummaryButton).toHaveClass("remove-column-btn");
    expect(deleteSummaryButton.querySelector(".btn-icon-delete")).not.toBeNull();
    const selectedTile = screen
      .getAllByText("Summarized Video")
      .map((element) => element.closest(".video-tile-item"))
      .find((element): element is HTMLElement => element instanceof HTMLElement);
    expect(selectedTile).toHaveClass("is-active");
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
        deleteAllStoredSummaries={async () => undefined}
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
        deleteAllStoredSummaries={async () => undefined}
      />
    );

    await user.click(screen.getByRole("button", { name: "Delete TLDR - GPT-4O-MINI - 2026-04-28" }));

    expect(deleteStoredSummary).toHaveBeenCalledWith("summary-1");
  });

  it("deletes all selected stored summaries from the title row", async () => {
    const user = userEvent.setup();
    const deleteAllStoredSummaries = vi.fn().mockResolvedValue(undefined);

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
        deleteAllStoredSummaries={deleteAllStoredSummaries}
      />
    );

    await user.click(screen.getByRole("button", { name: "Delete all summaries for Summarized Video" }));

    expect(deleteAllStoredSummaries).toHaveBeenCalledTimes(1);
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
        deleteAllStoredSummaries={async () => undefined}
      />
    );

    const copyButton = screen.getByRole("button", {
      name: "Copy TLDR - GPT-4O-MINI - 2026-04-28"
    });
    await user.click(copyButton);

    expect(writeText).toHaveBeenCalledWith("## TLDR\nGPT-4O-MINI | 27.04\n\nCached summary text");
    expect(copyButton).toHaveClass("is-copied");
    expect(copyButton.querySelector(".btn-icon-check")).not.toBeNull();
  });

  it("copies all selected stored summaries from the title row", async () => {
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
          },
          {
            id: "summary-2",
            label: "KEYPOINTS - GPT-4O-MINI - 2026-04-28",
            summary: "Second summary text",
            keyPoints: [],
            model: "openai/gpt-4o-mini",
            cachedAt: Date.parse("2026-04-28T11:00:00Z"),
            promptHash: "summary-2",
            summaryFormatId: "keypoints"
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
        deleteAllStoredSummaries={async () => undefined}
      />
    );

    const copyAllButton = screen.getByRole("button", { name: "Copy all summaries for Summarized Video" });
    await user.click(copyAllButton);

    expect(writeText).toHaveBeenCalledWith(
      "## TLDR\nGPT-4O-MINI | 27.04\n\nCached summary text\n\n---\n\n## KEYPOINTS\nGPT-4O-MINI | 27.04\n\nSecond summary text"
    );
    expect(copyAllButton).toHaveClass("is-copied");
    expect(copyAllButton.querySelector(".btn-icon-check")).not.toBeNull();
  });

  it("copies a stored summary as Slack-ready plain text", async () => {
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
        deleteAllStoredSummaries={async () => undefined}
      />
    );

    const copySlackButton = screen.getByRole("button", {
      name: "Copy Slack-ready TLDR - GPT-4O-MINI - 2026-04-28"
    });
    await user.click(copySlackButton);

    expect(writeText).toHaveBeenCalledWith(
      "Summarized Video\n\nCached summary text\n\nhttps://www.youtube.com/watch?v=video-1"
    );
    expect(copySlackButton).toHaveClass("is-copied");
  });

  it("copies all selected stored summaries as Slack-ready plain text", async () => {
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
          },
          {
            id: "summary-2",
            label: "KEYPOINTS - GPT-4O-MINI - 2026-04-28",
            summary: "Second summary text",
            keyPoints: [],
            model: "openai/gpt-4o-mini",
            cachedAt: Date.parse("2026-04-28T11:00:00Z"),
            promptHash: "summary-2",
            summaryFormatId: "keypoints"
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
        deleteAllStoredSummaries={async () => undefined}
      />
    );

    const copyAllSlackButton = screen.getByRole("button", {
      name: "Copy Slack-ready summaries for Summarized Video"
    });
    await user.click(copyAllSlackButton);

    expect(writeText).toHaveBeenCalledWith(
      [
        "Summarized Video\n\nCached summary text\n\nhttps://www.youtube.com/watch?v=video-1",
        "Summarized Video\n\nSecond summary text\n\nhttps://www.youtube.com/watch?v=video-1"
      ].join("\n\n---\n\n")
    );
    expect(copyAllSlackButton).toHaveClass("is-copied");
  });
});
