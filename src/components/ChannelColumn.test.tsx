import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChannelColumn } from "./ChannelColumn";
import type { ColumnStateLike } from "./boardColumnsShared";
import type { VideoItem } from "../types/youtube";

const loadingColumn: ColumnStateLike = {
  id: "column-1",
  handleInput: "@channel",
  currentHandle: "@channel",
  channelThumbnailUrl: "",
  lastGoodChannelThumbnailUrl: "",
  videos: [],
  loading: true,
  error: null,
  savedSortMode: ""
};

const readyColumn: ColumnStateLike = {
  ...loadingColumn,
  loading: false
};

const video: VideoItem = {
  videoId: "video-1",
  title: "Only Video",
  publishedAt: "2026-05-05T08:00:00Z",
  durationSeconds: 120,
  thumbnailUrl: "https://img.test/video.jpg",
  channelTitle: "Channel",
  videoUrl: "https://www.youtube.com/watch?v=video-1",
  viewCount: 2000
};

describe("ChannelColumn", () => {
  it("marks the video count as fetching while the column is loading", () => {
    const { container } = render(
      <ChannelColumn
        activeBoardId="board-1"
        column={loadingColumn}
        columnIndex={0}
        visibleColumnsLength={1}
        brokenChannelThumbnailKeys={[]}
        channelPlaceholderIcon="/svg/placeholder-channel.svg"
        copiedLinkVideoId={null}
        moveDestinationBoardsLength={0}
        saveDestinationColumnsLength={0}
        filteredVideos={[]}
        isVideoMarkedWatched={() => false}
        videoStatsBackfillInFlight={[]}
        videoMetaFeedbackById={{}}
        formatVideoMeta={() => ""}
        backfillVideoStats={async () => undefined}
        getVideoThumbnailSrc={(video) => video.thumbnailUrl}
        handleVideoThumbnailError={() => undefined}
        moveColumnById={() => undefined}
        openMoveColumnModal={() => undefined}
        runFetch={() => undefined}
        playChannelVideos={() => undefined}
        copyAllVideoLinks={async () => undefined}
        openBulkWatchColumnAction={() => undefined}
        setDeletingColumnId={() => undefined}
        hideVisibleColumn={() => undefined}
        openEditChannelModal={() => undefined}
        openTranscript={async () => undefined}
        copyVideoLink={async () => undefined}
        openSaveVideoModal={() => undefined}
        toggleWatched={() => undefined}
        openVideo={() => undefined}
        onLoadedChannelThumbnail={() => undefined}
        onBrokenChannelThumbnail={async () => undefined}
        videoFilter="new"
      />
    );

    const count = container.querySelector(".column-video-count");
    const avatarToggle = container.querySelector(".channel-avatar-toggle-btn");
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(count).toHaveClass("is-fetching");
    expect(count).toBeEmptyDOMElement();
    expect(avatarToggle).not.toHaveClass("is-fetching");
  });

  it("fetches the channel from the video count", () => {
    const runFetch = vi.fn();

    render(
      <ChannelColumn
        activeBoardId="board-1"
        column={readyColumn}
        columnIndex={0}
        visibleColumnsLength={1}
        brokenChannelThumbnailKeys={[]}
        channelPlaceholderIcon="/svg/placeholder-channel.svg"
        copiedLinkVideoId={null}
        moveDestinationBoardsLength={0}
        saveDestinationColumnsLength={0}
        filteredVideos={[]}
        isVideoMarkedWatched={() => false}
        videoStatsBackfillInFlight={[]}
        videoMetaFeedbackById={{}}
        formatVideoMeta={() => ""}
        backfillVideoStats={async () => undefined}
        getVideoThumbnailSrc={(video) => video.thumbnailUrl}
        handleVideoThumbnailError={() => undefined}
        moveColumnById={() => undefined}
        openMoveColumnModal={() => undefined}
        runFetch={runFetch}
        playChannelVideos={() => undefined}
        copyAllVideoLinks={async () => undefined}
        openBulkWatchColumnAction={() => undefined}
        setDeletingColumnId={() => undefined}
        hideVisibleColumn={() => undefined}
        openEditChannelModal={() => undefined}
        openTranscript={async () => undefined}
        copyVideoLink={async () => undefined}
        openSaveVideoModal={() => undefined}
        toggleWatched={() => undefined}
        openVideo={() => undefined}
        onLoadedChannelThumbnail={() => undefined}
        onBrokenChannelThumbnail={async () => undefined}
        videoFilter="new"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Fetch column 1 from video count" }));

    expect(runFetch).toHaveBeenCalledWith("board-1", "column-1", "@channel");
  });

  it("marks a loaded one-video column for compact bottom spacing", () => {
    const { container } = render(
      <ChannelColumn
        activeBoardId="board-1"
        column={{ ...readyColumn, videos: [video] }}
        columnIndex={0}
        visibleColumnsLength={1}
        brokenChannelThumbnailKeys={[]}
        channelPlaceholderIcon="/svg/placeholder-channel.svg"
        copiedLinkVideoId={null}
        moveDestinationBoardsLength={0}
        saveDestinationColumnsLength={0}
        filteredVideos={[video]}
        isVideoMarkedWatched={() => false}
        videoStatsBackfillInFlight={[]}
        videoMetaFeedbackById={{}}
        formatVideoMeta={() => "03.05 | 2:00 | 2k"}
        backfillVideoStats={async () => undefined}
        getVideoThumbnailSrc={(item) => item.thumbnailUrl}
        handleVideoThumbnailError={() => undefined}
        moveColumnById={() => undefined}
        openMoveColumnModal={() => undefined}
        runFetch={() => undefined}
        playChannelVideos={() => undefined}
        copyAllVideoLinks={async () => undefined}
        openBulkWatchColumnAction={() => undefined}
        setDeletingColumnId={() => undefined}
        hideVisibleColumn={() => undefined}
        openEditChannelModal={() => undefined}
        openTranscript={async () => undefined}
        copyVideoLink={async () => undefined}
        openSaveVideoModal={() => undefined}
        toggleWatched={() => undefined}
        openVideo={() => undefined}
        onLoadedChannelThumbnail={() => undefined}
        onBrokenChannelThumbnail={async () => undefined}
        videoFilter="new"
      />
    );

    expect(container.querySelector(".channel-column")).toHaveClass("has-single-video");
    expect(screen.getByText("Only Video")).toBeInTheDocument();
  });
});
