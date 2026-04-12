import { Alert, Button, Empty, Form, Input, List, Skeleton, Space, Spin, Typography } from "antd";
import { memo, useMemo } from "react";
import type { VideoItem } from "../types/youtube";
import { LazyRender } from "./LazyRender";
import type { ColumnStateLike, InlineMetaFeedback } from "./boardColumnsShared";
import { VideoTile } from "./VideoTile";

const { Text } = Typography;

type ChannelColumnProps = {
  activeBoardId: string;
  column: ColumnStateLike;
  columnIndex: number;
  visibleColumnsLength: number;
  brokenChannelThumbnailKeys: string[];
  channelPlaceholderIcon: string;
  copiedLinkVideoId: string | null;
  moveDestinationBoardsLength: number;
  saveDestinationColumnsLength: number;
  filteredVideos: VideoItem[];
  isVideoMarkedWatched: (videoId: string) => boolean;
  videoStatsBackfillInFlight: string[];
  videoMetaFeedbackById: Record<string, InlineMetaFeedback>;
  formatVideoMeta: (video: VideoItem) => string;
  backfillVideoStats: (videoId: string) => Promise<void>;
  getVideoThumbnailSrc: (video: VideoItem) => string;
  handleVideoThumbnailError: (video: VideoItem) => void;
  moveColumnById: (columnId: string, direction: "left" | "right") => void;
  openMoveColumnModal: (columnId: string) => void;
  runFetch: (boardId: string, columnId: string, handle: string) => void;
  playChannelVideos: (column: ColumnStateLike) => void;
  copyAllVideoLinks: (columnId: string, videos: VideoItem[]) => Promise<void>;
  openBulkWatchColumnAction: (column: ColumnStateLike, videoIds: string[], watched: boolean) => void;
  setDeletingColumnId: (columnId: string) => void;
  hideVisibleColumn: (columnId: string) => void;
  openEditChannelModal: (column: ColumnStateLike) => void;
  openTranscript: (video: VideoItem, handle?: string) => Promise<void>;
  copyVideoLink: (video: VideoItem) => Promise<void>;
  openSaveVideoModal: (video: VideoItem) => void;
  toggleWatched: (videoId: string) => void;
  openVideo: (video: VideoItem) => void;
  onBrokenChannelThumbnail: (boardId: string, columnId: string) => void;
  videoFilter: "all" | "new" | "watched";
};

function ChannelColumnComponent(props: ChannelColumnProps) {
  const {
    activeBoardId,
    column,
    columnIndex,
    visibleColumnsLength,
    brokenChannelThumbnailKeys,
    channelPlaceholderIcon,
    copiedLinkVideoId,
    moveDestinationBoardsLength,
    saveDestinationColumnsLength,
    filteredVideos,
    isVideoMarkedWatched,
    videoStatsBackfillInFlight,
    videoMetaFeedbackById,
    formatVideoMeta,
    backfillVideoStats,
    getVideoThumbnailSrc,
    handleVideoThumbnailError,
    moveColumnById,
    openMoveColumnModal,
    runFetch,
    playChannelVideos,
    copyAllVideoLinks,
    openBulkWatchColumnAction,
    setDeletingColumnId,
    hideVisibleColumn,
    openEditChannelModal,
    openTranscript,
    copyVideoLink,
    openSaveVideoModal,
    toggleWatched,
    openVideo,
    onBrokenChannelThumbnail,
    videoFilter
  } = props;

  const brokenThumbKey = `${activeBoardId}:${column.id}`;
  const channelThumbToShow = brokenChannelThumbnailKeys.includes(brokenThumbKey)
    ? column.videos[0]?.thumbnailUrl ?? ""
    : column.channelThumbnailUrl || column.videos[0]?.thumbnailUrl || "";
  const hasHandleInput = column.handleInput.trim().length > 0;
  const hasChannelPlaylistVideos = filteredVideos.length > 0;

  const videoItems = useMemo(
    () =>
      filteredVideos.map((video) => (
        <VideoTile
          key={video.videoId}
          boardId={activeBoardId}
          column={column}
          isSavedBoardActive={false}
          video={video}
          isWatched={isVideoMarkedWatched(video.videoId)}
          isMetaRefreshInFlight={videoStatsBackfillInFlight.includes(video.videoId)}
          metaFeedback={videoMetaFeedbackById[video.videoId]}
          metaText={formatVideoMeta(video)}
          copiedLinkVideoId={copiedLinkVideoId}
          saveDestinationColumnsLength={saveDestinationColumnsLength}
          savedBoardColumnsLength={0}
          manualIndex={0}
          filteredVideosLength={filteredVideos.length}
          savedSortMode=""
          onBackfillVideoStats={backfillVideoStats}
          onOpenTranscript={openTranscript}
          onCopyVideoLink={copyVideoLink}
          onOpenMoveSavedVideoModal={() => undefined}
          onSetDeletingSavedVideo={() => undefined}
          onMoveSavedVideoInManualOrder={() => undefined}
          onOpenSaveVideoModal={openSaveVideoModal}
          onToggleWatched={toggleWatched}
          onOpenVideo={openVideo}
          getVideoThumbnailSrc={getVideoThumbnailSrc}
          onHandleVideoThumbnailError={handleVideoThumbnailError}
        />
      )),
    [
      activeBoardId,
      column,
      filteredVideos,
      isVideoMarkedWatched,
      videoStatsBackfillInFlight,
      videoMetaFeedbackById,
      formatVideoMeta,
      copiedLinkVideoId,
      saveDestinationColumnsLength,
      backfillVideoStats,
      openTranscript,
      copyVideoLink,
      openSaveVideoModal,
      toggleWatched,
      openVideo,
      getVideoThumbnailSrc,
      handleVideoThumbnailError
    ]
  );

  return (
    <article
      className="channel-column is-channel-column"
      data-board-id={activeBoardId}
      data-column-id={column.id}
      data-handle={(column.currentHandle || column.handleInput || "").trim()}
      data-hidden="false"
    >
      <div className="column-actions">
        <div className="column-actions-left">
          <Button
            htmlType="button"
            onClick={() => moveColumnById(column.id, "left")}
            disabled={columnIndex === 0 || column.loading}
            aria-label={`Move column ${columnIndex + 1} left`}
            className="column-move-btn"
          >
            {"‹"}
          </Button>
          <Button
            htmlType="button"
            onClick={() => moveColumnById(column.id, "right")}
            disabled={columnIndex === visibleColumnsLength - 1 || column.loading}
            aria-label={`Move column ${columnIndex + 1} right`}
            className="column-move-btn"
          >
            {"›"}
          </Button>
          <Button
            htmlType="button"
            onClick={() => openMoveColumnModal(column.id)}
            disabled={column.loading || moveDestinationBoardsLength === 0 || !hasChannelPlaylistVideos}
            aria-label={`Move column ${columnIndex + 1} to board`}
            className="column-move-btn"
          >
            <span className="btn-icon btn-icon-move" aria-hidden />
          </Button>
        </div>
        <div className="column-actions-right">
          <Button
            htmlType="button"
            onClick={() => runFetch(activeBoardId, column.id, column.handleInput)}
            disabled={column.loading || !hasHandleInput}
            aria-label={`Fetch column ${columnIndex + 1}`}
            className="inline-fetch-btn"
            data-testid="column-fetch"
          >
            <span className="btn-icon btn-icon-fetch" aria-hidden />
          </Button>
          <Button
            htmlType="button"
            onClick={() => playChannelVideos(column)}
            disabled={column.loading || !hasChannelPlaylistVideos}
            aria-label={`Play channel ${columnIndex + 1} playlist`}
            className="column-move-btn"
            data-testid="column-play"
          >
            <span className="btn-icon btn-icon-play" aria-hidden />
          </Button>
          <Button
            htmlType="button"
            onClick={() => void copyAllVideoLinks(column.id, filteredVideos)}
            disabled={column.loading || filteredVideos.length === 0}
            aria-label={`Copy all shown links in channel ${columnIndex + 1}`}
            className={`column-move-btn link-copy-btn ${
              copiedLinkVideoId === `column-links:${column.id}` ? "is-copied" : ""
            }`}
          >
            <span className="btn-icon btn-icon-link" aria-hidden />
          </Button>
          <Button
            htmlType="button"
            onClick={() =>
              openBulkWatchColumnAction(
                column,
                filteredVideos.map((video) => video.videoId),
                videoFilter !== "watched"
              )
            }
            disabled={column.loading || filteredVideos.length === 0 || videoFilter === "all"}
            aria-label={`Mark all shown videos in channel ${columnIndex + 1} as ${videoFilter === "watched" ? "new" : "watched"}`}
            className="bulk-watch-column-btn"
            data-testid="column-mark-all"
          >
            {videoFilter === "watched" ? (
              <span className="btn-icon btn-icon-undo" aria-hidden />
            ) : (
              <span className="btn-icon btn-icon-check" aria-hidden />
            )}
          </Button>
          <Button
            htmlType="button"
            onClick={() => setDeletingColumnId(column.id)}
            disabled={column.loading}
            aria-label={`Remove column ${columnIndex + 1}`}
            className="remove-column-btn"
            data-testid="column-delete"
          >
            <span className="btn-icon btn-icon-delete" aria-hidden />
          </Button>
        </div>
      </div>

      <Form layout="vertical" className="full-width">
        <div className="column-header">
          <button
            type="button"
            className="channel-avatar-toggle-btn"
            aria-label={`Hide ${column.handleInput || column.currentHandle || `channel ${columnIndex + 1}`}`}
            onClick={() => hideVisibleColumn(column.id)}
          >
            {channelThumbToShow ? (
              <img
                src={channelThumbToShow}
                alt={`Channel ${columnIndex + 1}`}
                className="channel-avatar"
                onError={() => onBrokenChannelThumbnail(activeBoardId, column.id)}
              />
            ) : (
              <div className="channel-avatar channel-avatar-placeholder" aria-label={`Channel ${columnIndex + 1} placeholder`}>
                <img src={channelPlaceholderIcon} alt="" className="channel-avatar-placeholder-icon" />
              </div>
            )}
          </button>
          <Input
            placeholder="@channel"
            value={column.handleInput}
            className="channel-handle-input"
            aria-label={`Channel ${columnIndex + 1} handle`}
            readOnly
            onClick={() => openEditChannelModal(column)}
            onPressEnter={(event) => event.preventDefault()}
          />
          <Text className={`column-video-count ${filteredVideos.length === 0 ? "is-zero" : ""}`}>
            {filteredVideos.length}
          </Text>
        </div>
      </Form>

      <LazyRender minHeight={420} className="full-width">
        {column.loading ? (
          <Space direction="vertical" className="full-width">
            <Text>Loading...</Text>
            <Spin />
            <Skeleton active paragraph={{ rows: 2 }} />
          </Space>
        ) : null}

        {column.error ? <Alert type="error" message={column.error} showIcon={false} /> : null}

        {!column.loading && !column.error && filteredVideos.length === 0 ? (
          <Empty description="Empty" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : null}

        {!column.loading && filteredVideos.length > 0 ? (
          <List itemLayout="vertical" dataSource={filteredVideos} renderItem={(_, idx) => videoItems[idx] ?? null} />
        ) : null}
      </LazyRender>
    </article>
  );
}

function areEqual(prev: ChannelColumnProps, next: ChannelColumnProps): boolean {
  return (
    prev.activeBoardId === next.activeBoardId &&
    prev.column === next.column &&
    prev.columnIndex === next.columnIndex &&
    prev.visibleColumnsLength === next.visibleColumnsLength &&
    prev.brokenChannelThumbnailKeys === next.brokenChannelThumbnailKeys &&
    prev.channelPlaceholderIcon === next.channelPlaceholderIcon &&
    prev.copiedLinkVideoId === next.copiedLinkVideoId &&
    prev.moveDestinationBoardsLength === next.moveDestinationBoardsLength &&
    prev.saveDestinationColumnsLength === next.saveDestinationColumnsLength &&
    prev.filteredVideos === next.filteredVideos &&
    prev.videoStatsBackfillInFlight === next.videoStatsBackfillInFlight &&
    prev.videoMetaFeedbackById === next.videoMetaFeedbackById &&
    prev.videoFilter === next.videoFilter
  );
}

export const ChannelColumn = memo(ChannelColumnComponent, areEqual);
