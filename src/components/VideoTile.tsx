import { Button, List, Space, Typography } from "antd";
import { memo } from "react";
import type { VideoItem } from "../types/youtube";
import type { ColumnStateLike, InlineMetaFeedback } from "./boardColumnsShared";

const { Title, Text } = Typography;

export type VideoTileProps = {
  boardId: string;
  column: ColumnStateLike;
  isSavedBoardActive: boolean;
  video: VideoItem;
  isWatched: boolean;
  isMetaRefreshInFlight: boolean;
  metaFeedback?: InlineMetaFeedback;
  metaText: string;
  copiedLinkVideoId: string | null;
  saveDestinationColumnsLength: number;
  savedBoardColumnsLength: number;
  manualIndex: number;
  filteredVideosLength: number;
  savedSortMode: string;
  onBackfillVideoStats: (videoId: string) => Promise<void>;
  onOpenTranscript: (video: VideoItem, handle?: string) => Promise<void>;
  onCopyVideoLink: (video: VideoItem) => Promise<void>;
  onOpenMoveSavedVideoModal: (columnId: string, videoId: string) => void;
  onSetDeletingSavedVideo: (value: { columnId: string; videoId: string }) => void;
  onMoveSavedVideoInManualOrder: (columnId: string, videoId: string, direction: "up" | "down") => void;
  onOpenSaveVideoModal: (video: VideoItem) => void;
  onToggleWatched: (videoId: string) => void;
  onOpenVideo: (video: VideoItem) => void;
  getVideoThumbnailSrc: (video: VideoItem) => string;
  onHandleVideoThumbnailError: (video: VideoItem) => void;
};

function VideoTileComponent({
  boardId,
  column,
  isSavedBoardActive,
  video,
  isWatched,
  isMetaRefreshInFlight,
  metaFeedback,
  metaText,
  copiedLinkVideoId,
  saveDestinationColumnsLength,
  savedBoardColumnsLength,
  manualIndex,
  filteredVideosLength,
  savedSortMode,
  onBackfillVideoStats,
  onOpenTranscript,
  onCopyVideoLink,
  onOpenMoveSavedVideoModal,
  onSetDeletingSavedVideo,
  onMoveSavedVideoInManualOrder,
  onOpenSaveVideoModal,
  onToggleWatched,
  onOpenVideo,
  getVideoThumbnailSrc,
  onHandleVideoThumbnailError
}: VideoTileProps) {
  return (
    <List.Item
      key={video.videoId}
      className="video-tile-item"
      data-url={video.videoUrl}
      data-video-id={video.videoId}
      data-board-id={boardId}
      data-column-id={column.id}
      data-handle={(column.currentHandle || column.handleInput || "").trim()}
      data-state={isWatched ? "watched" : "new"}
    >
      <Space direction="vertical" size="small" className="full-width">
        <div className="video-meta-row">
          <button
            type="button"
            className="video-meta-btn"
            onClick={() => void onBackfillVideoStats(video.videoId)}
            aria-label={`Refresh metadata for ${video.title}`}
            disabled={isMetaRefreshInFlight}
            data-testid="video-meta-refresh"
          >
            <Text className="video-meta">
              {metaFeedback ? (
                <span className={`video-meta-feedback is-${metaFeedback.kind}`}>{metaFeedback.text}</span>
              ) : isMetaRefreshInFlight ? (
                <span className="video-meta-feedback is-info">FETCHING</span>
              ) : (
                metaText
              )}
            </Text>
          </button>
          {isSavedBoardActive ? (
            <>
              {savedSortMode === "manual" ? (
                <>
                  <Button
                    htmlType="button"
                    className="column-move-btn"
                    aria-label={`Move ${video.title} up`}
                    onClick={() => onMoveSavedVideoInManualOrder(column.id, video.videoId, "up")}
                    disabled={manualIndex === 0}
                  >
                    ↑
                  </Button>
                  <Button
                    htmlType="button"
                    className="column-move-btn"
                    aria-label={`Move ${video.title} down`}
                    onClick={() => onMoveSavedVideoInManualOrder(column.id, video.videoId, "down")}
                    disabled={manualIndex === filteredVideosLength - 1}
                  >
                    ↓
                  </Button>
                </>
              ) : null}
              <Button
                htmlType="button"
                className="column-move-btn"
                aria-label={`Open transcript for ${video.title}`}
                onClick={() => void onOpenTranscript(video)}
              >
                <span className="btn-icon btn-icon-transcript" aria-hidden />
              </Button>
              <Button
                htmlType="button"
                className={`column-move-btn link-copy-btn ${copiedLinkVideoId === video.videoId ? "is-copied" : ""}`}
                aria-label={`Copy link for ${video.title}`}
                onClick={() => void onCopyVideoLink(video)}
                data-testid="video-copy-link"
              >
                <span className="btn-icon btn-icon-link" aria-hidden />
              </Button>
              <Button
                htmlType="button"
                className="column-move-btn"
                aria-label={`Move ${video.title}`}
                onClick={() => onOpenMoveSavedVideoModal(column.id, video.videoId)}
                disabled={savedBoardColumnsLength <= 1}
              >
                <span className="btn-icon btn-icon-move" aria-hidden />
              </Button>
              <Button
                htmlType="button"
                className="remove-column-btn video-delete-btn"
                aria-label={`Delete ${video.title}`}
                onClick={() => onSetDeletingSavedVideo({ columnId: column.id, videoId: video.videoId })}
              >
                <span className="btn-icon btn-icon-remove" aria-hidden />
              </Button>
            </>
          ) : (
            <>
              <Button
                htmlType="button"
                className="column-move-btn"
                aria-label={`Open transcript for ${video.title}`}
                onClick={() => void onOpenTranscript(video, column.currentHandle || column.handleInput)}
              >
                <span className="btn-icon btn-icon-transcript" aria-hidden />
              </Button>
              <Button
                htmlType="button"
                className={`column-move-btn link-copy-btn ${copiedLinkVideoId === video.videoId ? "is-copied" : ""}`}
                aria-label={`Copy link for ${video.title}`}
                onClick={() => void onCopyVideoLink(video)}
              >
                <span className="btn-icon btn-icon-link" aria-hidden />
              </Button>
              <Button
                htmlType="button"
                className="column-move-btn"
                aria-label={`Save ${video.title}`}
                onClick={() => onOpenSaveVideoModal(video)}
                disabled={saveDestinationColumnsLength === 0}
                data-testid="video-save"
              >
                <span className="btn-icon btn-icon-star" aria-hidden />
              </Button>
              <Button
                htmlType="button"
                className="video-watch-btn"
                aria-label={`Mark ${video.title} as ${isWatched ? "new" : "watched"}`}
                onClick={() => onToggleWatched(video.videoId)}
                data-testid="video-mark-toggle"
              >
                {isWatched ? (
                  <span className="btn-icon btn-icon-undo" aria-hidden />
                ) : (
                  <span className="btn-icon btn-icon-check" aria-hidden />
                )}
              </Button>
            </>
          )}
        </div>
        {getVideoThumbnailSrc(video) ? (
          <button type="button" className="video-thumb-btn" onClick={() => onOpenVideo(video)}>
            <img
              src={getVideoThumbnailSrc(video)}
              alt={video.title}
              className="video-thumb"
              onError={() => onHandleVideoThumbnailError(video)}
            />
          </button>
        ) : null}
        <button type="button" className="video-link-btn" onClick={() => onOpenVideo(video)}>
          <Title level={5} className="video-title">
            {video.title}
          </Title>
        </button>
      </Space>
    </List.Item>
  );
}

function areEqual(prev: VideoTileProps, next: VideoTileProps): boolean {
  return (
    prev.boardId === next.boardId &&
    prev.column.id === next.column.id &&
    prev.column.currentHandle === next.column.currentHandle &&
    prev.column.handleInput === next.column.handleInput &&
    prev.isSavedBoardActive === next.isSavedBoardActive &&
    prev.video === next.video &&
    prev.isWatched === next.isWatched &&
    prev.isMetaRefreshInFlight === next.isMetaRefreshInFlight &&
    prev.metaFeedback === next.metaFeedback &&
    prev.metaText === next.metaText &&
    prev.copiedLinkVideoId === next.copiedLinkVideoId &&
    prev.saveDestinationColumnsLength === next.saveDestinationColumnsLength &&
    prev.savedBoardColumnsLength === next.savedBoardColumnsLength &&
    prev.manualIndex === next.manualIndex &&
    prev.filteredVideosLength === next.filteredVideosLength &&
    prev.savedSortMode === next.savedSortMode
  );
}

export const VideoTile = memo(VideoTileComponent, areEqual);
