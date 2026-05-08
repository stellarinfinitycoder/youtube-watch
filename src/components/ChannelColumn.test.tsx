import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
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

type ChannelColumnProps = ComponentProps<typeof ChannelColumn>;

function renderChannelColumn(overrides: Partial<ChannelColumnProps> = {}) {
  const props: ChannelColumnProps = {
    activeBoardId: "board-1",
    column: readyColumn,
    columnIndex: 0,
    visibleColumnsLength: 1,
    brokenChannelThumbnailKeys: [],
    channelPlaceholderIcon: "/svg/placeholder-channel.svg",
    copiedLinkVideoId: null,
    moveDestinationBoardsLength: 0,
    saveDestinationColumnsLength: 0,
    filteredVideos: [],
    isVideoMarkedWatched: () => false,
    videoStatsBackfillInFlight: [],
    videoMetaFeedbackById: {},
    formatVideoMeta: () => "",
    backfillVideoStats: async () => undefined,
    getVideoThumbnailSrc: (video) => video.thumbnailUrl,
    handleVideoThumbnailError: () => undefined,
    moveColumnById: () => undefined,
    openMoveColumnModal: () => undefined,
    runFetch: () => undefined,
    playChannelVideos: () => undefined,
    copyAllVideoLinks: async () => undefined,
    openBulkWatchColumnAction: () => undefined,
    setDeletingColumnId: () => undefined,
    isChannelOnlySelected: false,
    hideVisibleColumn: () => undefined,
    selectChannelFromThumbnail: () => undefined,
    openEditChannelModal: () => undefined,
    openTranscript: async () => undefined,
    copyVideoLink: async () => undefined,
    openSaveVideoModal: () => undefined,
    toggleWatched: () => undefined,
    openVideo: () => undefined,
    onLoadedChannelThumbnail: () => undefined,
    onBrokenChannelThumbnail: async () => undefined,
    videoFilter: "new",
    ...overrides
  };

  return render(<ChannelColumn {...props} />);
}

describe("ChannelColumn", () => {
  it("marks the video count as fetching while the column is loading", () => {
    const { container } = renderChannelColumn({ column: loadingColumn });

    const count = container.querySelector(".column-video-count");
    const avatarToggle = container.querySelector(".channel-avatar-toggle-btn");
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(count).toHaveClass("is-fetching");
    expect(count).toBeEmptyDOMElement();
    expect(avatarToggle).not.toHaveClass("is-fetching");
  });

  it("fetches the channel from the video count", () => {
    const runFetch = vi.fn();

    renderChannelColumn({ runFetch });

    const countButton = screen.getByRole("button", { name: "Fetch column 1" });

    expect(countButton).toHaveClass("is-zero");
    expect(countButton).toContainElement(countButton.querySelector(".btn-icon-fetch"));

    fireEvent.click(countButton);

    expect(runFetch).toHaveBeenCalledWith("board-1", "column-1", "@channel");
  });

  it("hides the channel from the hide action", () => {
    const hideVisibleColumn = vi.fn();

    renderChannelColumn({ hideVisibleColumn });

    const hideButton = screen.getByTestId("column-hide");

    expect(hideButton.querySelector(".btn-icon-hide")).not.toBeNull();

    fireEvent.click(hideButton);

    expect(hideVisibleColumn).toHaveBeenCalledWith("column-1");
  });

  it("selects only this channel from the channel thumbnail", () => {
    const selectChannelFromThumbnail = vi.fn();

    renderChannelColumn({ selectChannelFromThumbnail });

    fireEvent.click(screen.getByRole("button", { name: "Select only @channel" }));

    expect(selectChannelFromThumbnail).toHaveBeenCalledWith("column-1");
  });

  it("switches back to active channels from the selected channel thumbnail", () => {
    const selectChannelFromThumbnail = vi.fn();

    renderChannelColumn({ isChannelOnlySelected: true, selectChannelFromThumbnail });

    fireEvent.click(screen.getByRole("button", { name: "Show active channels" }));

    expect(selectChannelFromThumbnail).toHaveBeenCalledWith("column-1");
  });

  it("marks a loaded one-video column for compact bottom spacing", () => {
    const { container } = renderChannelColumn({
      column: { ...readyColumn, videos: [video] },
      filteredVideos: [video],
      formatVideoMeta: () => "03.05 | 2:00 | 2k"
    });

    expect(container.querySelector(".channel-column")).toHaveClass("has-single-video");
    expect(screen.getByText("Only Video")).toBeInTheDocument();
  });
});
