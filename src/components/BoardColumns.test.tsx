import { createRef } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BoardColumns } from "./BoardColumns";
import type { ColumnStateLike } from "./boardColumnsShared";

const column: ColumnStateLike = {
  id: "column-1",
  handleInput: "@channel",
  currentHandle: "@channel",
  channelThumbnailUrl: "https://img.test/channel.jpg",
  lastGoodChannelThumbnailUrl: "",
  videos: [],
  loading: false,
  error: null,
  savedSortMode: ""
};

function renderBoardColumns({
  visibleColumns,
  hiddenColumns
}: {
  visibleColumns: ColumnStateLike[];
  hiddenColumns: ColumnStateLike[];
}) {
  return render(
    <BoardColumns
      scrollRef={createRef<HTMLDivElement>()}
      activeBoardId="board-1"
      isSavedBoardActive={false}
      columns={[...visibleColumns, ...hiddenColumns]}
      visibleColumns={visibleColumns}
      hiddenColumns={hiddenColumns}
      hiddenColumnIdSet={new Set(hiddenColumns.map((item) => item.id))}
      brokenChannelThumbnailKeys={[]}
      savedListPlaceholderIcon="/svg/placeholder-saved-list.svg"
      channelPlaceholderIcon="/svg/placeholder-channel.svg"
      copiedLinkVideoId={null}
      videoFilter="new"
      saveDestinationColumnsLength={0}
      moveDestinationBoardsLength={0}
      savedBoardColumnsLength={0}
      filteredVideosByColumnId={new Map()}
      isVideoMarkedWatched={() => false}
      videoStatsBackfillInFlight={[]}
      videoMetaFeedbackById={{}}
      formatVideoMeta={() => ""}
      backfillVideoStats={async () => undefined}
      getVideoThumbnailSrc={(video) => video.thumbnailUrl}
      handleVideoThumbnailError={() => undefined}
      moveColumnById={() => undefined}
      openMoveColumnModal={() => undefined}
      setSavedSortMode={() => undefined}
      runFetch={() => undefined}
      playChannelVideos={() => undefined}
      copyAllVideoLinks={async () => undefined}
      openRemoveAllSavedColumnModal={() => undefined}
      openBulkWatchColumnAction={() => undefined}
      setDeletingColumnId={() => undefined}
      hideVisibleColumn={() => undefined}
      revealHiddenColumn={() => undefined}
      openEditSavedListModal={() => undefined}
      openEditChannelModal={() => undefined}
      openTranscript={async () => undefined}
      copyVideoLink={async () => undefined}
      openSaveVideoModal={() => undefined}
      toggleWatched={() => undefined}
      openVideo={() => undefined}
      openMoveSavedVideoModal={() => undefined}
      setDeletingSavedVideo={() => undefined}
      moveSavedVideoInManualOrder={() => undefined}
      addColumn={() => undefined}
      onLoadedChannelThumbnail={() => undefined}
      onBrokenChannelThumbnail={async () => undefined}
    />
  );
}

describe("BoardColumns", () => {
  it("marks the hidden channel rail when every channel is hidden", () => {
    const { container } = renderBoardColumns({
      visibleColumns: [],
      hiddenColumns: [column]
    });

    expect(container.querySelector(".add-column-rail")).toHaveClass(
      "has-hidden-channels",
      "has-no-active-channels"
    );
  });

  it("keeps the compact hidden channel rail when active channels are visible", () => {
    const { container } = renderBoardColumns({
      visibleColumns: [column],
      hiddenColumns: [{ ...column, id: "column-2" }]
    });

    expect(container.querySelector(".add-column-rail")).toHaveClass("has-hidden-channels");
    expect(container.querySelector(".add-column-rail")).not.toHaveClass("has-no-active-channels");
  });
});
