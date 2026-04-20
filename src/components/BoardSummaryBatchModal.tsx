import { Button, Typography } from "antd";
import { memo, useEffect, useState } from "react";
import type { VideoItem } from "../types/youtube";
import { VideoTile } from "./VideoTile";
import type { ColumnStateLike, InlineMetaFeedback } from "./boardColumnsShared";

const { Text } = Typography;
const BOARD_SUMMARY_BATCH_PAGE_SIZE = 3;

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
  boardName: string;
  isPreparing: boolean;
  isCopied: boolean;
  items: BoardSummaryBatchItem[];
  onCopyAll: () => Promise<void>;
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
  boardName,
  isPreparing,
  isCopied,
  items,
  onCopyAll,
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

  useEffect(() => {
    if (!open) {
      return;
    }
    setVisibleCount(BOARD_SUMMARY_BATCH_PAGE_SIZE);
  }, [open]);

  const visibleItems = items.slice(0, visibleCount);
  const hasMoreItems = visibleCount < items.length;
  const isEmpty = !isPreparing && items.length === 0;

  return (
    <section className="board-summary-page">
      <div className="board-summary-page-header">
        <h1 className="board-summary-page-title">{`SUMMARIES: ${boardName.toUpperCase()}`}</h1>
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
                    MORE
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
