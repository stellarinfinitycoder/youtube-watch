import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BoardSummaryBatchPage, type BoardSummaryBatchItem } from "./BoardSummaryBatchModal";

const baseItem: BoardSummaryBatchItem = {
  videoId: "video-1",
  video: {
    videoId: "video-1",
    title: "Example video",
    publishedAt: "2026-04-10T10:00:00Z",
    thumbnailUrl: "https://img.test/video-1.jpg",
    channelTitle: "Example Channel",
    videoUrl: "https://www.youtube.com/watch?v=video-1",
    viewCount: 100
  },
  column: {
    id: "column-1",
    handleInput: "@example",
    currentHandle: "@example",
    loading: false,
    error: null,
    videos: [],
    channelId: "channel-1",
    uploadsPlaylistId: "playlist-1",
    channelThumbnailUrl: "",
    lastGoodChannelThumbnailUrl: "",
    lastFetchAt: null,
    savedSortMode: "added_desc"
  },
  status: "done",
  summary: "Summary text",
  keyPoints: ["Point one"],
  error: null
};

describe("BoardSummaryBatchPage", () => {
  it("renders summarize shown summaries action after copy all", () => {
    const onSummarizeShown = vi.fn();

    render(
      <BoardSummaryBatchPage
        open
        onGoHome={() => undefined}
        boardName="Board"
        channelScopeLabel="All"
        videoFilterLabel="All"
        timeFilterLabel="Last 30D"
        lengthFilterLabel="Any"
        shownVideosLabel="1"
        summaryFormats={[{ id: "summary-default", name: "SUMMARY", prompt: "Prompt", model: "", isDefault: true, createdAt: 1, updatedAt: 1 }]}
        selectedSummaryFormatId="summary-default"
        isPreparing={false}
        isCopied={false}
        items={[baseItem]}
        onCopyAll={async () => undefined}
        onSummarizeShown={onSummarizeShown}
        isSummarizingShown={false}
        onSummaryFormatChange={() => undefined}
        activeBoardId="board-1"
        isSavedBoardActive={false}
        copiedLinkVideoId={null}
        saveDestinationColumnsLength={1}
        savedBoardColumnsLength={1}
        filteredVideosByColumnId={new Map([["column-1", [baseItem.video]]])}
        isVideoMarkedWatched={() => false}
        videoStatsBackfillInFlight={[]}
        videoMetaFeedbackById={{}}
        formatVideoMeta={() => "Meta"}
        backfillVideoStats={async () => undefined}
        getVideoThumbnailSrc={(video) => video.thumbnailUrl}
        onHandleVideoThumbnailError={() => undefined}
        onOpenTranscript={async () => undefined}
        onCopyVideoLink={async () => undefined}
        onOpenMoveSavedVideoModal={() => undefined}
        onSetDeletingSavedVideo={() => undefined}
        onMoveSavedVideoInManualOrder={() => undefined}
        onOpenSaveVideoModal={() => undefined}
        onToggleWatched={() => undefined}
        onOpenVideo={() => undefined}
      />
    );

    const copyAllButton = screen.getByRole("button", { name: "Copy all board summaries" });
    const summarizeButton = screen.getByRole("button", { name: "Summarize shown summaries" });

    expect(copyAllButton.compareDocumentPosition(summarizeButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(summarizeButton);

    expect(onSummarizeShown).toHaveBeenCalledTimes(1);
    expect(onSummarizeShown).toHaveBeenCalledWith([baseItem]);
  });
});
