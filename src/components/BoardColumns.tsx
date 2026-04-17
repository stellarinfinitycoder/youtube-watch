import { Button } from "antd";
import { memo } from "react";
import type { VideoItem } from "../types/youtube";
import type { ColumnStateLike, InlineMetaFeedback } from "./boardColumnsShared";
import { ChannelColumn } from "./ChannelColumn";
import { SavedListColumn } from "./SavedListColumn";

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
            const filteredVideos = filteredVideosByColumnId.get(column.id) ?? [];
            if (isSavedBoardActive) {
              return (
                <SavedListColumn
                  key={column.id}
                  activeBoardId={activeBoardId}
                  column={column}
                  columnIndex={index}
                  columnsLength={columns.length}
                  brokenChannelThumbnailKeys={brokenChannelThumbnailKeys}
                  savedListPlaceholderIcon={savedListPlaceholderIcon}
                  copiedLinkVideoId={copiedLinkVideoId}
                  savedBoardColumnsLength={savedBoardColumnsLength}
                  filteredVideos={filteredVideos}
                  isVideoMarkedWatched={isVideoMarkedWatched}
                  videoStatsBackfillInFlight={videoStatsBackfillInFlight}
                  videoMetaFeedbackById={videoMetaFeedbackById}
                  formatVideoMeta={formatVideoMeta}
                  backfillVideoStats={backfillVideoStats}
                  getVideoThumbnailSrc={getVideoThumbnailSrc}
                  handleVideoThumbnailError={handleVideoThumbnailError}
                  moveColumnById={moveColumnById}
                  setSavedSortMode={setSavedSortMode}
                  playChannelVideos={playChannelVideos}
                  openRemoveAllSavedColumnModal={openRemoveAllSavedColumnModal}
                  setDeletingColumnId={setDeletingColumnId}
                  openEditSavedListModal={openEditSavedListModal}
                  openTranscript={openTranscript}
                  copyVideoLink={copyVideoLink}
                  openVideo={openVideo}
                  openMoveSavedVideoModal={openMoveSavedVideoModal}
                  setDeletingSavedVideo={setDeletingSavedVideo}
                  moveSavedVideoInManualOrder={moveSavedVideoInManualOrder}
                  onBrokenChannelThumbnail={onBrokenChannelThumbnail}
                />
              );
            }

            return (
              <ChannelColumn
                key={column.id}
                activeBoardId={activeBoardId}
                column={column}
                columnIndex={index}
                visibleColumnsLength={visibleColumns.length}
                brokenChannelThumbnailKeys={brokenChannelThumbnailKeys}
                channelPlaceholderIcon={channelPlaceholderIcon}
                copiedLinkVideoId={copiedLinkVideoId}
                moveDestinationBoardsLength={moveDestinationBoardsLength}
                saveDestinationColumnsLength={saveDestinationColumnsLength}
                filteredVideos={filteredVideos}
                isVideoMarkedWatched={isVideoMarkedWatched}
                videoStatsBackfillInFlight={videoStatsBackfillInFlight}
                videoMetaFeedbackById={videoMetaFeedbackById}
                formatVideoMeta={formatVideoMeta}
                backfillVideoStats={backfillVideoStats}
                getVideoThumbnailSrc={getVideoThumbnailSrc}
                handleVideoThumbnailError={handleVideoThumbnailError}
                moveColumnById={moveColumnById}
                openMoveColumnModal={openMoveColumnModal}
                runFetch={runFetch}
                playChannelVideos={playChannelVideos}
                copyAllVideoLinks={copyAllVideoLinks}
                openBulkWatchColumnAction={openBulkWatchColumnAction}
                setDeletingColumnId={setDeletingColumnId}
                hideVisibleColumn={hideVisibleColumn}
                openEditChannelModal={openEditChannelModal}
                openTranscript={openTranscript}
                copyVideoLink={copyVideoLink}
                openSaveVideoModal={openSaveVideoModal}
                toggleWatched={toggleWatched}
                openVideo={openVideo}
                onBrokenChannelThumbnail={onBrokenChannelThumbnail}
                videoFilter={videoFilter}
              />
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
                    const hiddenThumbClassName = `hidden-channel-thumb${column.loading ? " is-fetching" : ""}`;
                    return (
                      <button
                        type="button"
                        key={column.id}
                        className={hiddenThumbClassName}
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
