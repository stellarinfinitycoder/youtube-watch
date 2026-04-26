import { describe, expect, it } from "vitest";
import { collectBoardAssetPreloadUrls, selectChannelThumbnailUrl } from "./boardAssets";
import type { VideoItem } from "../types/youtube";

function createVideo(videoId: string, thumbnailUrl = `https://img.test/${videoId}.jpg`): VideoItem {
  return {
    videoId,
    title: videoId,
    publishedAt: "2026-04-01T10:00:00Z",
    durationSeconds: null,
    thumbnailUrl,
    channelTitle: "Channel",
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    viewCount: null
  };
}

describe("board asset preload collection", () => {
  it("deduplicates avatars and bounded video thumbnails in visible board order", () => {
    const firstVideo = createVideo("shared", "https://img.test/shared.jpg");
    const secondVideo = createVideo("second", "https://img.test/second.jpg");
    const thirdVideo = createVideo("third", "https://img.test/third.jpg");
    const columns = [
      { id: "one", videos: [firstVideo, secondVideo], avatar: "https://img.test/avatar.jpg" },
      { id: "two", videos: [thirdVideo], avatar: "https://img.test/avatar.jpg" }
    ];
    const filteredVideosByColumnId = new Map([
      ["one", [firstVideo, secondVideo]],
      ["two", [firstVideo, thirdVideo]]
    ]);

    expect(
      collectBoardAssetPreloadUrls({
        visibleColumns: columns,
        hiddenColumns: [],
        filteredVideosByColumnId,
        getColumnAvatarSrc: (column) => column.avatar,
        getVideoThumbnailSrc: (video) => video.thumbnailUrl,
        maxVideoThumbnails: 2
      })
    ).toEqual([
      "https://img.test/avatar.jpg",
      "https://img.test/shared.jpg",
      "https://img.test/second.jpg"
    ]);
  });

  it("preloads hidden column avatars when all columns are hidden", () => {
    const firstVideo = createVideo("hidden-video-one");
    const secondVideo = createVideo("hidden-video-two");
    const hiddenColumns = [
      { id: "one", videos: [firstVideo], avatar: "https://img.test/hidden-one.jpg" },
      { id: "two", videos: [secondVideo], avatar: "https://img.test/hidden-two.jpg" }
    ];
    const filteredVideosByColumnId = new Map([
      ["one", [firstVideo]],
      ["two", [secondVideo]]
    ]);

    expect(
      collectBoardAssetPreloadUrls({
        visibleColumns: [],
        hiddenColumns,
        filteredVideosByColumnId,
        getColumnAvatarSrc: (column) => column.avatar,
        getVideoThumbnailSrc: (video) => video.thumbnailUrl,
        maxVideoThumbnails: 2
      })
    ).toEqual(["https://img.test/hidden-one.jpg", "https://img.test/hidden-two.jpg"]);
  });

  it("deduplicates visible and hidden avatars without preloading hidden video thumbnails", () => {
    const visibleVideo = createVideo("visible-video", "https://img.test/visible-video.jpg");
    const hiddenVideo = createVideo("hidden-video", "https://img.test/hidden-video.jpg");
    const visibleColumns = [
      { id: "visible", videos: [visibleVideo], avatar: "https://img.test/shared-avatar.jpg" }
    ];
    const hiddenColumns = [
      { id: "hidden", videos: [hiddenVideo], avatar: "https://img.test/shared-avatar.jpg" },
      { id: "hidden-two", videos: [], avatar: "https://img.test/hidden-avatar.jpg" }
    ];
    const filteredVideosByColumnId = new Map([
      ["visible", [visibleVideo]],
      ["hidden", [hiddenVideo]]
    ]);

    expect(
      collectBoardAssetPreloadUrls({
        visibleColumns,
        hiddenColumns,
        filteredVideosByColumnId,
        getColumnAvatarSrc: (column) => column.avatar,
        getVideoThumbnailSrc: (video) => video.thumbnailUrl,
        maxVideoThumbnails: 3
      })
    ).toEqual([
      "https://img.test/shared-avatar.jpg",
      "https://img.test/hidden-avatar.jpg",
      "https://img.test/visible-video.jpg"
    ]);
  });

  it("prefers last good channel thumbnails even when the current thumbnail is marked broken", () => {
    expect(
      selectChannelThumbnailUrl(
        {
          channelThumbnailUrl: "https://img.test/current.jpg",
          lastGoodChannelThumbnailUrl: "https://img.test/last-good.jpg"
        },
        true
      )
    ).toBe("https://img.test/last-good.jpg");
  });

  it("suppresses only the current channel thumbnail when it is marked broken", () => {
    expect(
      selectChannelThumbnailUrl(
        {
          channelThumbnailUrl: "https://img.test/current.jpg",
          lastGoodChannelThumbnailUrl: ""
        },
        true
      )
    ).toBe("");
  });
});
