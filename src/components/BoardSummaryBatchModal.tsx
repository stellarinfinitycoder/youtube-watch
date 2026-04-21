import { Button, Select, Typography } from "antd";
import { memo, useEffect, useState } from "react";
import type { VideoItem } from "../types/youtube";
import { VideoTile } from "./VideoTile";
import type { ColumnStateLike, InlineMetaFeedback } from "./boardColumnsShared";
import type { SummaryFormat } from "../hooks/useTranscriptSummary";

const { Text } = Typography;
const BOARD_SUMMARY_BATCH_PAGE_SIZE = 5;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeBoardSummaryRowCopyContent(item: BoardSummaryBatchItem): {
  title: string;
  status: BoardSummaryBatchItem["status"];
  summary: string;
  keyPoints: string[];
  error: string | null;
  textBody: string;
  videoUrl: string;
} {
  const keyPoints = item.keyPoints
    .map((point) => point.trim())
    .filter((point) => point.length > 0);
  const textBody =
    item.status === "loading"
      ? "LOADING..."
      : item.status === "summarizing"
        ? "SUMMARIZING..."
        : item.error
          ? item.error
          : [item.summary.trim(), keyPoints.map((point) => `- ${point}`).join("\n")]
              .filter(Boolean)
              .join("\n\n")
              .trim();

  return {
    title: item.video.title.toUpperCase(),
    status: item.status,
    summary: item.summary.trim(),
    keyPoints,
    error: item.error,
    textBody,
    videoUrl: item.video.videoUrl.trim()
  };
}

function formatBoardSummaryRowCopyText(item: BoardSummaryBatchItem): string {
  const normalizedItem = normalizeBoardSummaryRowCopyContent(item);
  return [normalizedItem.title, normalizedItem.textBody, normalizedItem.videoUrl]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function formatBoardSummaryRowCopyHtml(item: BoardSummaryBatchItem): string {
  const normalizedItem = normalizeBoardSummaryRowCopyContent(item);
  if (normalizedItem.status === "loading" || normalizedItem.status === "summarizing") {
    return [
      "<div>",
      `<h3 style="margin:0 0 8px;font-size:16px;font-weight:700;">${escapeHtml(normalizedItem.title)}</h3>`,
      `<p style="margin:0;">${escapeHtml(normalizedItem.textBody)}</p>`,
      "</div>"
    ].join("");
  }
  if (normalizedItem.error) {
    return [
      "<div>",
      `<h3 style="margin:0 0 8px;font-size:16px;font-weight:700;">${escapeHtml(normalizedItem.title)}</h3>`,
      `<p style="margin:0;color:#c96c7e;">${escapeHtml(normalizedItem.error)}</p>`,
      "</div>"
    ].join("");
  }
  const summaryHtml = normalizedItem.summary
    ? `<p style="margin:0 0 10px;">${escapeHtml(normalizedItem.summary).replace(/\n/g, "<br />")}</p>`
    : "";
  const keyPointsHtml =
    normalizedItem.keyPoints.length > 0
      ? `<ul style="margin:0;padding-left:20px;">${normalizedItem.keyPoints
          .map((point) => `<li>${escapeHtml(point)}</li>`)
          .join("")}</ul>`
      : "";
  const linkHtml = normalizedItem.videoUrl
    ? `<p style="margin:10px 0 0;"><a href="${escapeHtml(normalizedItem.videoUrl)}">${escapeHtml(normalizedItem.videoUrl)}</a></p>`
    : "";
  return [
    "<div>",
    `<h3 style="margin:0 0 8px;font-size:16px;font-weight:700;">${escapeHtml(normalizedItem.title)}</h3>`,
    summaryHtml,
    keyPointsHtml,
    linkHtml,
    "</div>"
  ].join("");
}

export type BoardSummaryBatchItem = {
  videoId: string;
  video: VideoItem;
  column: ColumnStateLike;
  status: "loading" | "summarizing" | "done" | "error";
  summary: string;
  keyPoints: string[];
  error: string | null;
};

type BoardSummaryBatchPageProps = {
  open: boolean;
  onGoHome: () => void;
  boardName: string;
  channelScopeLabel: string;
  videoFilterLabel: string;
  timeFilterLabel: string;
  lengthFilterLabel: string;
  shownVideosLabel: string;
  summaryFormats: SummaryFormat[];
  selectedSummaryFormatId: string;
  isPreparing: boolean;
  isCopied: boolean;
  items: BoardSummaryBatchItem[];
  onCopyAll: () => Promise<void>;
  onSummarizeShown: (items: BoardSummaryBatchItem[]) => Promise<void>;
  isSummarizingShown: boolean;
  onSummaryFormatChange: (formatId: string) => void;
  activeBoardId: string;
  isSavedBoardActive: boolean;
  copiedLinkVideoId: string | null;
  saveDestinationColumnsLength: number;
  savedBoardColumnsLength: number;
  filteredVideosByColumnId: Map<string, VideoItem[]>;
  isVideoMarkedWatched: (videoId: string) => boolean;
  videoStatsBackfillInFlight: string[];
  videoMetaFeedbackById: Record<string, InlineMetaFeedback>;
  formatVideoMeta: (video: VideoItem) => string;
  backfillVideoStats: (videoId: string) => Promise<void>;
  getVideoThumbnailSrc: (video: VideoItem) => string;
  onHandleVideoThumbnailError: (video: VideoItem) => void;
  onOpenTranscript: (video: VideoItem, handle?: string) => Promise<void>;
  onCopyVideoLink: (video: VideoItem) => Promise<void>;
  onOpenMoveSavedVideoModal: (columnId: string, videoId: string) => void;
  onSetDeletingSavedVideo: (value: { columnId: string; videoId: string }) => void;
  onMoveSavedVideoInManualOrder: (
    columnId: string,
    videoId: string,
    direction: "up" | "down"
  ) => void;
  onOpenSaveVideoModal: (video: VideoItem) => void;
  onToggleWatched: (videoId: string) => void;
  onOpenVideo: (video: VideoItem) => void;
};

function BoardSummaryBatchPageComponent({
  open,
  onGoHome,
  boardName,
  channelScopeLabel,
  videoFilterLabel,
  timeFilterLabel,
  lengthFilterLabel,
  shownVideosLabel,
  summaryFormats,
  selectedSummaryFormatId,
  isPreparing,
  isCopied,
  items,
  onCopyAll,
  onSummarizeShown,
  isSummarizingShown,
  onSummaryFormatChange,
  activeBoardId,
  isSavedBoardActive,
  copiedLinkVideoId,
  saveDestinationColumnsLength,
  savedBoardColumnsLength,
  filteredVideosByColumnId,
  isVideoMarkedWatched,
  videoStatsBackfillInFlight,
  videoMetaFeedbackById,
  formatVideoMeta,
  backfillVideoStats,
  getVideoThumbnailSrc,
  onHandleVideoThumbnailError,
  onOpenTranscript,
  onCopyVideoLink,
  onOpenMoveSavedVideoModal,
  onSetDeletingSavedVideo,
  onMoveSavedVideoInManualOrder,
  onOpenSaveVideoModal,
  onToggleWatched,
  onOpenVideo
}: BoardSummaryBatchPageProps) {
  const [visibleCount, setVisibleCount] = useState(BOARD_SUMMARY_BATCH_PAGE_SIZE);
  const [copiedVideoId, setCopiedVideoId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setVisibleCount(BOARD_SUMMARY_BATCH_PAGE_SIZE);
    setCopiedVideoId(null);
  }, [open]);

  useEffect(() => {
    if (!copiedVideoId) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setCopiedVideoId(null);
    }, 1000);
    return () => window.clearTimeout(timeoutId);
  }, [copiedVideoId]);

  const visibleItems = items.slice(0, visibleCount);
  const hasMoreItems = visibleCount < items.length;
  const isEmpty = !isPreparing && items.length === 0;
  const hasSummarizableVisibleItems = visibleItems.some(
    (item) =>
      item.status === "done" &&
      (item.summary.trim().length > 0 || item.keyPoints.some((point) => point.trim().length > 0))
  );

  const copySummaryRow = async (item: BoardSummaryBatchItem): Promise<void> => {
    const text = formatBoardSummaryRowCopyText(item);
    const html = formatBoardSummaryRowCopyHtml(item);
    if (!text) {
      return;
    }

    try {
      if (
        navigator.clipboard &&
        typeof navigator.clipboard.write === "function" &&
        typeof ClipboardItem !== "undefined"
      ) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([text], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" })
          })
        ]);
      } else if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("Clipboard API unavailable.");
      }
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "true");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }

    setCopiedVideoId(item.videoId);
  };

  const pageTitle = [
    `SUMMARIES: ${boardName.toUpperCase()}`,
    channelScopeLabel.toUpperCase(),
    videoFilterLabel.toUpperCase(),
    timeFilterLabel.toUpperCase(),
    lengthFilterLabel.toUpperCase(),
    shownVideosLabel.toUpperCase()
  ].join(" > ");

  return (
    <section className="board-summary-page">
      <div className="board-summary-page-header">
        <div className="board-summary-page-title-row">
          <Button
            htmlType="button"
            className="column-move-btn board-summary-home-btn"
            aria-label="Return to board"
            onClick={onGoHome}
          >
            <span className="btn-icon btn-icon-home" aria-hidden />
          </Button>
          <h1 className="board-summary-page-title">{pageTitle}</h1>
        </div>
        <div className="board-summary-page-actions">
          <Select<string>
            value={selectedSummaryFormatId}
            onChange={onSummaryFormatChange}
            aria-label="Board summaries format"
            className="video-filter-select board-summary-format-select"
            popupClassName="summary-format-dropdown"
            popupMatchSelectWidth={false}
            optionLabelProp="title"
            showSearch={false}
          >
            {summaryFormats.map((format) => (
              <Select.Option key={format.id} value={format.id} title={format.name.toUpperCase()}>
                <div className="board-option-row">
                  <span className="board-option-name">{format.name.toUpperCase()}</span>
                </div>
              </Select.Option>
            ))}
          </Select>
          <Button
            htmlType="button"
            className={`column-move-btn transcript-copy-btn board-summary-copy-btn ${
              isCopied ? "is-copied" : ""
            }`}
            aria-label="Copy all board summaries"
            onClick={() => void onCopyAll()}
            disabled={items.length === 0}
          >
            {isCopied ? (
              <span className="btn-icon btn-icon-check" aria-hidden />
            ) : (
              <span className="btn-icon btn-icon-copy" aria-hidden />
            )}
          </Button>
          <Button
            htmlType="button"
            className="column-move-btn board-summary-copy-btn"
            aria-label="Summarize shown summaries"
            onClick={() => void onSummarizeShown(visibleItems)}
            disabled={isSummarizingShown || !hasSummarizableVisibleItems}
          >
            <span
              className={`btn-icon btn-icon-transcript ${isSummarizingShown ? "is-spinning" : ""}`}
              aria-hidden
            />
          </Button>
        </div>
      </div>

      <div className="board-summary-page-panel">
        <div className="board-summary-page-scroll-content">
          {isPreparing && items.length === 0 ? (
            <div className="board-summary-batch-preparing">PREPARING SUMMARIES...</div>
          ) : isEmpty ? (
            <div className="board-summary-page-empty">NO BOARD SUMMARIES YET.</div>
          ) : (
            <>
              <div className="board-summary-batch-list">
                {visibleItems.map((item) => {
                  const filteredVideos = filteredVideosByColumnId.get(item.column.id) ?? [];
                  const manualIndex = filteredVideos.findIndex(
                    (video) => video.videoId === item.video.videoId
                  );
                  return (
                    <section key={item.videoId} className="board-summary-batch-item board-summary-table-row">
                      <div className="board-summary-video-cell">
                        <VideoTile
                          boardId={activeBoardId}
                          column={item.column}
                          isSavedBoardActive={isSavedBoardActive}
                          video={item.video}
                          isWatched={isVideoMarkedWatched(item.video.videoId)}
                          isMetaRefreshInFlight={videoStatsBackfillInFlight.includes(item.video.videoId)}
                          metaFeedback={videoMetaFeedbackById[item.video.videoId]}
                          metaText={formatVideoMeta(item.video)}
                          copiedLinkVideoId={copiedLinkVideoId}
                          saveDestinationColumnsLength={saveDestinationColumnsLength}
                          savedBoardColumnsLength={savedBoardColumnsLength}
                          manualIndex={Math.max(0, manualIndex)}
                          filteredVideosLength={filteredVideos.length}
                          savedSortMode={item.column.savedSortMode}
                          onBackfillVideoStats={backfillVideoStats}
                          onOpenTranscript={onOpenTranscript}
                          onCopyVideoLink={onCopyVideoLink}
                          onOpenMoveSavedVideoModal={onOpenMoveSavedVideoModal}
                          onSetDeletingSavedVideo={onSetDeletingSavedVideo}
                          onMoveSavedVideoInManualOrder={onMoveSavedVideoInManualOrder}
                          onOpenSaveVideoModal={onOpenSaveVideoModal}
                          onToggleWatched={onToggleWatched}
                          onOpenVideo={onOpenVideo}
                          getVideoThumbnailSrc={getVideoThumbnailSrc}
                          onHandleVideoThumbnailError={onHandleVideoThumbnailError}
                        />
                      </div>
                      <div className="board-summary-summary-cell">
                        <div className="board-summary-row-toolbar">
                          <Button
                            htmlType="button"
                            className={`column-move-btn transcript-copy-btn board-summary-copy-btn board-summary-row-copy-btn ${
                              copiedVideoId === item.videoId ? "is-copied" : ""
                            }`}
                            aria-label={`Copy summary for ${item.video.title}`}
                            onClick={() => void copySummaryRow(item)}
                          >
                            {copiedVideoId === item.videoId ? (
                              <span className="btn-icon btn-icon-check" aria-hidden />
                            ) : (
                              <span className="btn-icon btn-icon-copy" aria-hidden />
                            )}
                          </Button>
                        </div>
                        <div className="board-summary-content-block">
                          <h3 className="board-summary-batch-title">{item.video.title.toUpperCase()}</h3>
                          {item.status === "loading" ? (
                            <Text className="board-summary-batch-status">LOADING...</Text>
                          ) : item.status === "summarizing" ? (
                            <Text className="board-summary-batch-status">SUMMARIZING...</Text>
                          ) : item.error ? (
                            <Text type="danger" className="board-summary-batch-error">
                              {item.error}
                            </Text>
                          ) : (
                            <div className="board-summary-batch-content">
                              {item.summary.trim() ? (
                                <p className="board-summary-batch-paragraph">{item.summary.trim()}</p>
                              ) : null}
                              {item.keyPoints.length > 0 ? (
                                <ul className="board-summary-batch-points">
                                  {item.keyPoints.map((point, index) => (
                                    <li key={`${item.videoId}-point-${index}`}>{point}</li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </div>
                    </section>
                  );
                })}
              </div>
              {hasMoreItems ? (
                <div className="board-summary-batch-more-row">
                  <Button
                    htmlType="button"
                    className="summary-prompt-action-btn board-summary-batch-more-btn"
                    onClick={() =>
                      setVisibleCount((previous) =>
                        Math.min(previous + BOARD_SUMMARY_BATCH_PAGE_SIZE, items.length)
                      )
                    }
                  >
                    SHOW MORE
                  </Button>
                  <Button
                    htmlType="button"
                    className="summary-prompt-action-btn board-summary-batch-more-btn"
                    onClick={() => setVisibleCount(items.length)}
                  >
                    SHOW ALL
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export const BoardSummaryBatchPage = memo(BoardSummaryBatchPageComponent);
