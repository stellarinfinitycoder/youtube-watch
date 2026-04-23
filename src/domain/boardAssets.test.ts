import { describe, expect, it } from "vitest";
import { collectBoardAssetPreloadUrls } from "./boardAssets";
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
});
