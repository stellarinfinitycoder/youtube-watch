import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardSummaryBatchModal, type BoardSummaryBatchItem } from "./BoardSummaryBatchModal";

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

describe("BoardSummaryBatchModal", () => {
  beforeEach(() => {
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      ((element: Element) =>
        ({
          getPropertyValue: () => "",
          overflow: element instanceof HTMLElement ? element.style.overflow || "" : ""
        }) as CSSStyleDeclaration) as typeof window.getComputedStyle
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders modal actions without the old page breadcrumb header", () => {
    const onSummarizeShown = vi.fn();

    render(
      <BoardSummaryBatchModal
        open
        onCancel={() => undefined}
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
    expect(screen.queryByRole("button", { name: "Return to board" })).not.toBeInTheDocument();
    expect(screen.queryByText(/^SUMMARIES:/)).not.toBeInTheDocument();

    fireEvent.click(summarizeButton);

    expect(onSummarizeShown).toHaveBeenCalledTimes(1);
    expect(onSummarizeShown).toHaveBeenCalledWith([baseItem]);
  });

  it("renders generated summary markdown instead of raw markdown text", async () => {
    const markdownItem: BoardSummaryBatchItem = {
      ...baseItem,
      summary: "**Markdown lead**\n\nPlain detail.",
      keyPoints: []
    };
    render(
      <BoardSummaryBatchModal
        open
        onCancel={() => undefined}
        summaryFormats={[{ id: "summary-default", name: "SUMMARY", prompt: "Prompt", model: "", isDefault: true, createdAt: 1, updatedAt: 1 }]}
        selectedSummaryFormatId="summary-default"
        isPreparing={false}
        isCopied={false}
        items={[markdownItem]}
        onCopyAll={async () => undefined}
        onSummarizeShown={async () => undefined}
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

    await waitFor(() => {
      expect(document.body.querySelector(".summary-markdown strong")).toHaveTextContent("Markdown lead");
    });
    expect(screen.queryByText("**Markdown lead**")).not.toBeInTheDocument();
  });
});
