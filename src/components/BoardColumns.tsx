import { memo } from "react";
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  List,
  Select,
  Skeleton,
  Space,
  Spin,
  Typography
} from "antd";
import type { VideoItem } from "../types/youtube";
import { LazyRender } from "./LazyRender";

const { Title, Text } = Typography;

type ColumnStateLike = {
  id: string;
  handleInput: string;
  currentHandle: string;
  channelThumbnailUrl: string;
  videos: VideoItem[];
  loading: boolean;
  error: string | null;
  savedSortMode: string;
  channelId?: string;
  uploadsPlaylistId?: string;
  lastFetchAt?: string | null;
  savedAddedAtByVideoId?: Record<string, number>;
  savedManualOrder?: string[];
};

type InlineMetaFeedback = {
  kind: "info" | "success" | "error" | "warning";
  text: string;
};

type BoardColumnsProps = {
  scrollRef: React.RefObject<HTMLDivElement>;
  activeBoardId: string;
  isSavedBoardActive: boolean;
  columns: ColumnStateLike[];
  visibleColumns: ColumnStateLike[];
  hiddenColumns: ColumnStateLike[];
  hiddenColumnIdSet: Set<string>;
  brokenChannelThumbnailKeys: string[];
  savedListPlaceholderIcon: string;
  channelPlaceholderIcon: string;
  copiedLinkVideoId: string | null;
  videoFilter: "all" | "new" | "watched";
  saveDestinationColumnsLength: number;
  moveDestinationBoardsLength: number;
  savedBoardColumnsLength: number;
  filteredVideosByColumnId: Map<string, VideoItem[]>;
  isVideoMarkedWatched: (videoId: string) => boolean;
  videoStatsBackfillInFlight: string[];
  videoMetaFeedbackById: Record<string, InlineMetaFeedback>;
  formatVideoMeta: (video: VideoItem) => string;
  backfillVideoStats: (videoId: string) => Promise<void>;
  getVideoThumbnailSrc: (video: VideoItem) => string;
  handleVideoThumbnailError: (video: VideoItem) => void;
  moveColumnById: (columnId: string, direction: "left" | "right") => void;
  openMoveColumnModal: (columnId: string) => void;
  setSavedSortMode: (columnId: string, value: string) => void;
  runFetch: (boardId: string, columnId: string, handle: string) => void;
  playChannelVideos: (column: ColumnStateLike) => void;
  copyAllVideoLinks: (columnId: string, videos: VideoItem[]) => Promise<void>;
  openRemoveAllSavedColumnModal: (column: ColumnStateLike) => void;
  openBulkWatchColumnAction: (column: ColumnStateLike, videoIds: string[], watched: boolean) => void;
  setDeletingColumnId: (columnId: string) => void;
  hideVisibleColumn: (columnId: string) => void;
  revealHiddenColumn: (columnId: string) => void;
  openEditSavedListModal: (column: ColumnStateLike) => void;
  openEditChannelModal: (column: ColumnStateLike) => void;
  openTranscript: (video: VideoItem, handle?: string) => Promise<void>;
  copyVideoLink: (video: VideoItem) => Promise<void>;
  openSaveVideoModal: (video: VideoItem) => void;
  toggleWatched: (videoId: string) => void;
  openVideo: (video: VideoItem) => void;
  openMoveSavedVideoModal: (columnId: string, videoId: string) => void;
  setDeletingSavedVideo: (value: { columnId: string; videoId: string }) => void;
  moveSavedVideoInManualOrder: (columnId: string, videoId: string, direction: "up" | "down") => void;
  addColumn: () => void;
  onBrokenChannelThumbnail: (boardId: string, columnId: string) => void;
};

type VideoTileProps = {
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

const VideoTile = memo(function VideoTile({
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
      <LazyRender minHeight={320} className="full-width">
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
      </LazyRender>
    </List.Item>
  );
});

function BoardColumnsComponent({
  scrollRef,
  activeBoardId,
  isSavedBoardActive,
  columns,
  visibleColumns,
  hiddenColumns,
  hiddenColumnIdSet,
  brokenChannelThumbnailKeys,
  savedListPlaceholderIcon,
  channelPlaceholderIcon,
  copiedLinkVideoId,
  videoFilter,
  saveDestinationColumnsLength,
  moveDestinationBoardsLength,
  savedBoardColumnsLength,
  filteredVideosByColumnId,
  isVideoMarkedWatched,
  videoStatsBackfillInFlight,
  videoMetaFeedbackById,
  formatVideoMeta,
  backfillVideoStats,
  getVideoThumbnailSrc,
  handleVideoThumbnailError,
  moveColumnById,
  openMoveColumnModal,
  setSavedSortMode,
  runFetch,
  playChannelVideos,
  copyAllVideoLinks,
  openRemoveAllSavedColumnModal,
  openBulkWatchColumnAction,
  setDeletingColumnId,
  hideVisibleColumn,
  revealHiddenColumn,
  openEditSavedListModal,
  openEditChannelModal,
  openTranscript,
  copyVideoLink,
  openSaveVideoModal,
  toggleWatched,
  openVideo,
  openMoveSavedVideoModal,
  setDeletingSavedVideo,
  moveSavedVideoInManualOrder,
  addColumn,
  onBrokenChannelThumbnail
}: BoardColumnsProps) {
  return (
    <div ref={scrollRef} className="columns-scroll">
      <div className="columns-layout">
        <section className="columns-grid">
          {visibleColumns.map((column, index) => {
            const brokenThumbKey = `${activeBoardId}:${column.id}`;
            const channelThumbToShow =
              isSavedBoardActive
                ? ""
                : brokenChannelThumbnailKeys.includes(brokenThumbKey)
                  ? column.videos[0]?.thumbnailUrl ?? ""
                  : column.channelThumbnailUrl || column.videos[0]?.thumbnailUrl || "";
            const hasHandleInput = column.handleInput.trim().length > 0;
            const filteredVideos = filteredVideosByColumnId.get(column.id) ?? [];
            const manualOrderIndexByVideoId =
              isSavedBoardActive && column.savedSortMode === "manual"
                ? new Map(filteredVideos.map((video, itemIndex) => [video.videoId, itemIndex]))
                : new Map<string, number>();
            const hasChannelPlaylistVideos = filteredVideos.length > 0;

            return (
              <article
                key={column.id}
                className={`channel-column ${isSavedBoardActive ? "is-saved-column" : "is-channel-column"}`}
                data-board-id={activeBoardId}
                data-column-id={column.id}
                data-handle={(column.currentHandle || column.handleInput || "").trim()}
                data-hidden={hiddenColumnIdSet.has(column.id) ? "true" : "false"}
              >
                <div className="column-actions">
                  <div className="column-actions-left">
                    <Button
                      htmlType="button"
                      onClick={() => moveColumnById(column.id, "left")}
                      disabled={index === 0 || column.loading}
                      aria-label={`Move column ${index + 1} left`}
                      className="column-move-btn"
                    >
                      {"‹"}
                    </Button>
                    <Button
                      htmlType="button"
                      onClick={() => moveColumnById(column.id, "right")}
                      disabled={index === visibleColumns.length - 1 || column.loading}
                      aria-label={`Move column ${index + 1} right`}
                      className="column-move-btn"
                    >
                      {"›"}
                    </Button>
                    {!isSavedBoardActive ? (
                      <Button
                        htmlType="button"
                        onClick={() => openMoveColumnModal(column.id)}
                        disabled={column.loading || moveDestinationBoardsLength === 0 || !hasChannelPlaylistVideos}
                        aria-label={`Move column ${index + 1} to board`}
                        className="column-move-btn"
                      >
                        <span className="btn-icon btn-icon-move" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                  <div className="column-actions-right">
                    {isSavedBoardActive ? (
                      <Select<string>
                        value={column.savedSortMode}
                        onChange={(value) => setSavedSortMode(column.id, value)}
                        aria-label={`Sort list ${index + 1}`}
                        className="video-filter-select saved-sort-select"
                        options={[
                          { value: "time_desc", label: "CREATED ↓" },
                          { value: "time_asc", label: "CREATED ↑" },
                          { value: "added_desc", label: "ADDED ↓" },
                          { value: "added_asc", label: "ADDED ↑" },
                          { value: "manual", label: "MANUAL" }
                        ]}
                      />
                    ) : null}
                    {!isSavedBoardActive ? (
                      <Button
                        htmlType="button"
                        onClick={() => runFetch(activeBoardId, column.id, column.handleInput)}
                        disabled={column.loading || !hasHandleInput}
                        aria-label={`Fetch column ${index + 1}`}
                        className="inline-fetch-btn"
                        data-testid="column-fetch"
                      >
                        <span className="btn-icon btn-icon-fetch" aria-hidden />
                      </Button>
                    ) : null}
                    <Button
                      htmlType="button"
                      onClick={() => playChannelVideos(column)}
                      disabled={column.loading || !hasChannelPlaylistVideos}
                      aria-label={`Play channel ${index + 1} playlist`}
                      className="column-move-btn"
                      data-testid="column-play"
                    >
                      <span className="btn-icon btn-icon-play" aria-hidden />
                    </Button>
                    {!isSavedBoardActive ? (
                      <Button
                        htmlType="button"
                        onClick={() => void copyAllVideoLinks(column.id, filteredVideos)}
                        disabled={column.loading || filteredVideos.length === 0}
                        aria-label={`Copy all shown links in channel ${index + 1}`}
                        className={`column-move-btn link-copy-btn ${
                          copiedLinkVideoId === `column-links:${column.id}` ? "is-copied" : ""
                        }`}
                      >
                        <span className="btn-icon btn-icon-link" aria-hidden />
                      </Button>
                    ) : null}
                    {isSavedBoardActive ? (
                      <Button
                        htmlType="button"
                        onClick={() => openRemoveAllSavedColumnModal(column)}
                        disabled={column.loading || column.videos.length === 0}
                        aria-label={`Remove videos from list ${index + 1}`}
                        className="remove-column-btn"
                      >
                        <span className="btn-icon btn-icon-remove" aria-hidden />
                      </Button>
                    ) : null}
                    {!isSavedBoardActive ? (
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
                        aria-label={`Mark all shown videos in channel ${index + 1} as ${videoFilter === "watched" ? "new" : "watched"}`}
                        className="bulk-watch-column-btn"
                        data-testid="column-mark-all"
                      >
                        {videoFilter === "watched" ? (
                          <span className="btn-icon btn-icon-undo" aria-hidden />
                        ) : (
                          <span className="btn-icon btn-icon-check" aria-hidden />
                        )}
                      </Button>
                    ) : null}
                    <Button
                      htmlType="button"
                      onClick={() => setDeletingColumnId(column.id)}
                      disabled={column.loading || (isSavedBoardActive && columns.length <= 1)}
                      aria-label={`Remove column ${index + 1}`}
                      className="remove-column-btn"
                      data-testid="column-delete"
                    >
                      <span className="btn-icon btn-icon-delete" aria-hidden />
                    </Button>
                  </div>
                </div>

                <Form layout="vertical" className="full-width">
                  <div className="column-header">
                    {isSavedBoardActive ? (
                      channelThumbToShow ? (
                        <img
                          src={channelThumbToShow}
                          alt={`Channel ${index + 1}`}
                          className="channel-avatar"
                          onError={() => onBrokenChannelThumbnail(activeBoardId, column.id)}
                        />
                      ) : (
                        <div className="channel-avatar channel-avatar-placeholder" aria-label={`Channel ${index + 1} placeholder`}>
                          <img src={savedListPlaceholderIcon} alt="" className="channel-avatar-placeholder-icon" />
                        </div>
                      )
                    ) : (
                      <button
                        type="button"
                        className="channel-avatar-toggle-btn"
                        aria-label={`Hide ${column.handleInput || column.currentHandle || `channel ${index + 1}`}`}
                        onClick={() => hideVisibleColumn(column.id)}
                      >
                        {channelThumbToShow ? (
                          <img
                            src={channelThumbToShow}
                            alt={`Channel ${index + 1}`}
                            className="channel-avatar"
                            onError={() => onBrokenChannelThumbnail(activeBoardId, column.id)}
                          />
                        ) : (
                          <div className="channel-avatar channel-avatar-placeholder" aria-label={`Channel ${index + 1} placeholder`}>
                            <img src={channelPlaceholderIcon} alt="" className="channel-avatar-placeholder-icon" />
                          </div>
                        )}
                      </button>
                    )}
                    <Input
                      placeholder={isSavedBoardActive ? "List name" : "@channel"}
                      value={column.handleInput}
                      className="channel-handle-input"
                      aria-label={`Channel ${index + 1} handle`}
                      readOnly
                      onClick={() => {
                        if (isSavedBoardActive) {
                          openEditSavedListModal(column);
                          return;
                        }
                        openEditChannelModal(column);
                      }}
                      onPressEnter={(event) => event.preventDefault()}
                    />
                    <Text className={`column-video-count ${filteredVideos.length === 0 ? "is-zero" : ""}`}>
                      {filteredVideos.length}
                    </Text>
                  </div>
                </Form>

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
                  <List
                    itemLayout="vertical"
                    dataSource={filteredVideos}
                    renderItem={(video) => (
                      <VideoTile
                        key={video.videoId}
                        boardId={activeBoardId}
                        column={column}
                        isSavedBoardActive={isSavedBoardActive}
                        video={video}
                        isWatched={isVideoMarkedWatched(video.videoId)}
                        isMetaRefreshInFlight={videoStatsBackfillInFlight.includes(video.videoId)}
                        metaFeedback={videoMetaFeedbackById[video.videoId]}
                        metaText={formatVideoMeta(video)}
                        copiedLinkVideoId={copiedLinkVideoId}
                        saveDestinationColumnsLength={saveDestinationColumnsLength}
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
                        onOpenSaveVideoModal={openSaveVideoModal}
                        onToggleWatched={toggleWatched}
                        onOpenVideo={openVideo}
                        getVideoThumbnailSrc={getVideoThumbnailSrc}
                        onHandleVideoThumbnailError={handleVideoThumbnailError}
                      />
                    )}
                  />
                ) : null}
              </article>
            );
          })}
          <aside className="add-column-rail">
            <div className="add-column-stack">
              <Button htmlType="button" onClick={addColumn} aria-label="Add column" className="add-column-btn add-column-plus-btn">
                +
              </Button>
              {!isSavedBoardActive && hiddenColumns.length > 0 ? (
                <div className="hidden-channel-thumbs">
                  {hiddenColumns.map((column, index) => {
                    const brokenKey = `${activeBoardId}:${column.id}`;
                    const thumbnailUrl = brokenChannelThumbnailKeys.includes(brokenKey)
                      ? column.videos[0]?.thumbnailUrl ?? ""
                      : column.channelThumbnailUrl || column.videos[0]?.thumbnailUrl || "";
                    const rawName = column.currentHandle.trim() || column.handleInput.trim();
                    const displayName = rawName ? (rawName.startsWith("@") ? rawName : `@${rawName}`) : `CHANNEL ${index + 1}`;
                    return (
                      <button
                        type="button"
                        key={column.id}
                        className="hidden-channel-thumb"
                        title={displayName.toUpperCase()}
                        aria-label={`Hidden ${displayName}`}
                        onClick={() => revealHiddenColumn(column.id)}
                      >
                        {thumbnailUrl ? (
                          <img
                            src={thumbnailUrl}
                            alt={displayName}
                            className="hidden-channel-thumb-image"
                            onError={() => onBrokenChannelThumbnail(activeBoardId, column.id)}
                          />
                        ) : (
                          <div className="hidden-channel-thumb-placeholder">
                            <img src={channelPlaceholderIcon} alt="" className="channel-avatar-placeholder-icon" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}

export const BoardColumns = memo(BoardColumnsComponent);
