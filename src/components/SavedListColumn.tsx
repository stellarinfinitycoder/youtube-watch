import { Alert, Button, Empty, Form, Input, List, Select, Skeleton, Space, Spin, Typography } from "antd";
import { memo, useMemo } from "react";
import type { VideoItem } from "../types/youtube";
import { LazyRender } from "./LazyRender";
import type { ColumnStateLike, InlineMetaFeedback } from "./boardColumnsShared";
import { VideoTile } from "./VideoTile";

const { Text } = Typography;

type SavedListColumnProps = {
  activeBoardId: string;
  column: ColumnStateLike;
  columnIndex: number;
  columnsLength: number;
  brokenChannelThumbnailKeys: string[];
  savedListPlaceholderIcon: string;
  copiedLinkVideoId: string | null;
  savedBoardColumnsLength: number;
  filteredVideos: VideoItem[];
  isVideoMarkedWatched: (videoId: string) => boolean;
  videoStatsBackfillInFlight: string[];
  videoMetaFeedbackById: Record<string, InlineMetaFeedback>;
  formatVideoMeta: (video: VideoItem) => string;
  backfillVideoStats: (videoId: string) => Promise<void>;
  getVideoThumbnailSrc: (video: VideoItem) => string;
  handleVideoThumbnailError: (video: VideoItem) => void;
  moveColumnById: (columnId: string, direction: "left" | "right") => void;
  setSavedSortMode: (columnId: string, value: string) => void;
  playChannelVideos: (column: ColumnStateLike) => void;
  openRemoveAllSavedColumnModal: (column: ColumnStateLike) => void;
  setDeletingColumnId: (columnId: string) => void;
  openEditSavedListModal: (column: ColumnStateLike) => void;
  openTranscript: (video: VideoItem, handle?: string) => Promise<void>;
  copyVideoLink: (video: VideoItem) => Promise<void>;
  openVideo: (video: VideoItem) => void;
  openMoveSavedVideoModal: (columnId: string, videoId: string) => void;
  setDeletingSavedVideo: (value: { columnId: string; videoId: string }) => void;
  moveSavedVideoInManualOrder: (columnId: string, videoId: string, direction: "up" | "down") => void;
  onBrokenChannelThumbnail: (boardId: string, columnId: string, src: string) => void;
};

function SavedListColumnComponent(props: SavedListColumnProps) {
  const {
    activeBoardId,
    column,
    columnIndex,
    columnsLength,
    brokenChannelThumbnailKeys,
    savedListPlaceholderIcon,
    copiedLinkVideoId,
    savedBoardColumnsLength,
    filteredVideos,
    isVideoMarkedWatched,
    videoStatsBackfillInFlight,
    videoMetaFeedbackById,
    formatVideoMeta,
    backfillVideoStats,
    getVideoThumbnailSrc,
    handleVideoThumbnailError,
    moveColumnById,
    setSavedSortMode,
    playChannelVideos,
    openRemoveAllSavedColumnModal,
    setDeletingColumnId,
    openEditSavedListModal,
    openTranscript,
    copyVideoLink,
    openVideo,
    openMoveSavedVideoModal,
    setDeletingSavedVideo,
    moveSavedVideoInManualOrder,
    onBrokenChannelThumbnail
  } = props;

  const brokenThumbKey = `${activeBoardId}:${column.id}`;
  const channelThumbToShow = brokenChannelThumbnailKeys.includes(brokenThumbKey)
    ? column.videos[0]?.thumbnailUrl ?? ""
    : column.channelThumbnailUrl || column.videos[0]?.thumbnailUrl || "";
  const hasChannelPlaylistVideos = filteredVideos.length > 0;
  const manualOrderIndexByVideoId =
    column.savedSortMode === "manual"
      ? new Map(filteredVideos.map((video, itemIndex) => [video.videoId, itemIndex]))
      : new Map<string, number>();

  const videoItems = useMemo(
    () =>
      filteredVideos.map((video) => (
        <VideoTile
          key={video.videoId}
          boardId={activeBoardId}
          column={column}
          isSavedBoardActive
          video={video}
          isWatched={isVideoMarkedWatched(video.videoId)}
          isMetaRefreshInFlight={videoStatsBackfillInFlight.includes(video.videoId)}
          metaFeedback={videoMetaFeedbackById[video.videoId]}
          metaText={formatVideoMeta(video)}
          copiedLinkVideoId={copiedLinkVideoId}
          saveDestinationColumnsLength={0}
          savedBoardColumnsLength={savedBoardColumnsLength}
          manualIndex={manualOrderIndexByVideoId.get(video.videoId) ?? 0}
          filteredVideosLength={filteredVideos.length}
          savedSortMode={column.savedSortMode}
          onBackfillVideoStats={backfillVideoStats}
          onOpenTranscript={openTranscript}
          onCopyVideoLink={copyVideoLink}
          onOpenMoveSavedVideoModal={openMoveSavedVideoModal}
          onSetDeletingSavedVideo={setDeletingSavedVideo}
          onMoveSavedVideoInManualOrder={moveSavedVideoInManualOrder}
          onOpenSaveVideoModal={() => undefined}
          onToggleWatched={() => undefined}
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
      savedBoardColumnsLength,
      manualOrderIndexByVideoId,
      backfillVideoStats,
      openTranscript,
      copyVideoLink,
      openMoveSavedVideoModal,
      setDeletingSavedVideo,
      moveSavedVideoInManualOrder,
      openVideo,
      getVideoThumbnailSrc,
      handleVideoThumbnailError
    ]
  );

  return (
    <article
      className="channel-column is-saved-column"
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
            disabled={columnIndex === columnsLength - 1 || column.loading}
            aria-label={`Move column ${columnIndex + 1} right`}
            className="column-move-btn"
          >
            {"›"}
          </Button>
        </div>
        <div className="column-actions-right">
          <Select<string>
            value={column.savedSortMode}
            onChange={(value) => setSavedSortMode(column.id, value)}
            aria-label={`Sort list ${columnIndex + 1}`}
            className="video-filter-select saved-sort-select"
            options={[
              { value: "time_desc", label: "CREATED ↓" },
              { value: "time_asc", label: "CREATED ↑" },
              { value: "added_desc", label: "ADDED ↓" },
              { value: "added_asc", label: "ADDED ↑" },
              { value: "manual", label: "MANUAL" }
            ]}
          />
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
            onClick={() => openRemoveAllSavedColumnModal(column)}
            disabled={column.loading || column.videos.length === 0}
            aria-label={`Remove videos from list ${columnIndex + 1}`}
            className="remove-column-btn"
          >
            <span className="btn-icon btn-icon-remove" aria-hidden />
          </Button>
          <Button
            htmlType="button"
            onClick={() => setDeletingColumnId(column.id)}
            disabled={column.loading || columnsLength <= 1}
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
          {channelThumbToShow ? (
            <img
              src={channelThumbToShow}
              alt={`Channel ${columnIndex + 1}`}
              className="channel-avatar"
              loading="eager"
              decoding="async"
              onError={(event) =>
                onBrokenChannelThumbnail(
                  activeBoardId,
                  column.id,
                  event.currentTarget.currentSrc || event.currentTarget.src
                )
              }
            />
          ) : (
            <div className="channel-avatar channel-avatar-placeholder" aria-label={`Channel ${columnIndex + 1} placeholder`}>
              <img
                src={savedListPlaceholderIcon}
                alt=""
                className="channel-avatar-placeholder-icon"
                loading="eager"
                decoding="async"
              />
            </div>
          )}
          <Input
            placeholder="List name"
            value={column.handleInput}
            className="channel-handle-input"
            aria-label={`Channel ${columnIndex + 1} handle`}
            readOnly
            onClick={() => openEditSavedListModal(column)}
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

function areEqual(prev: SavedListColumnProps, next: SavedListColumnProps): boolean {
  return (
    prev.activeBoardId === next.activeBoardId &&
    prev.column === next.column &&
    prev.columnIndex === next.columnIndex &&
    prev.columnsLength === next.columnsLength &&
    prev.brokenChannelThumbnailKeys === next.brokenChannelThumbnailKeys &&
    prev.savedListPlaceholderIcon === next.savedListPlaceholderIcon &&
    prev.copiedLinkVideoId === next.copiedLinkVideoId &&
    prev.savedBoardColumnsLength === next.savedBoardColumnsLength &&
    prev.filteredVideos === next.filteredVideos &&
    prev.videoStatsBackfillInFlight === next.videoStatsBackfillInFlight &&
    prev.videoMetaFeedbackById === next.videoMetaFeedbackById
  );
}

export const SavedListColumn = memo(SavedListColumnComponent, areEqual);
