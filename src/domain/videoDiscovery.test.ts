import { describe, expect, it } from "vitest";
import {
  buildDiscoveryChannelCandidates,
  buildSimilarVideoSeeds,
  collectExistingChannelIds
} from "./videoDiscovery";
import type { SimilarVideoDiscoveryItem, VideoItem } from "../types/youtube";

function makeVideo(overrides: Partial<VideoItem>): VideoItem {
  return {
    videoId: overrides.videoId ?? "video-1",
    title: overrides.title ?? "How AI agents are changing React apps",
    publishedAt: overrides.publishedAt ?? "2026-05-01T00:00:00Z",
    thumbnailUrl: "",
    channelTitle: overrides.channelTitle ?? "Frontend Lab",
    videoUrl: "https://www.youtube.com/watch?v=video-1",
    viewCount: null,
    ...overrides
  };
}

function makeDiscoveryVideo(
  overrides: Partial<SimilarVideoDiscoveryItem>
): SimilarVideoDiscoveryItem {
  return {
    ...makeVideo({
      videoId: overrides.videoId ?? "discovered-video",
      title: overrides.title ?? "Discovered video",
      channelTitle: overrides.channelTitle ?? "Discovered Channel"
    }),
    channelId: overrides.channelId ?? "channel-new",
    channelThumbnailUrl: overrides.channelThumbnailUrl ?? "https://img.test/channel.jpg",
    uploadsPlaylistId: overrides.uploadsPlaylistId ?? "uploads-new",
    channelHandle: overrides.channelHandle ?? "@new",
    channelUrl: overrides.channelUrl ?? "https://www.youtube.com/@new",
    matchReason: overrides.matchReason ?? "Matched board video",
    matchedSeed: overrides.matchedSeed ?? "seed query",
    score: overrides.score ?? 10,
    alreadyOnBoard: overrides.alreadyOnBoard ?? false,
    ...overrides
  };
}

describe("video discovery seeds", () => {
  it("builds bounded search seeds from recent board videos", () => {
    const seeds = buildSimilarVideoSeeds(
      [
        {
          id: "col-1",
          handleInput: "@one",
          currentHandle: "@one",
          channelId: "channel-1",
          videos: [
            makeVideo({
              videoId: "newer",
              title: "Building useful AI coding agents with TypeScript",
              publishedAt: "2026-05-02T00:00:00Z"
            }),
            makeVideo({
              videoId: "older",
              title: "React performance patterns for dashboards",
              publishedAt: "2026-04-20T00:00:00Z"
            })
          ]
        }
      ],
      1
    );

    expect(seeds).toEqual([
      {
        query: "building useful coding agents typescript frontend lab",
        source: "video",
        sourceTitle: "Building useful AI coding agents with TypeScript"
      }
    ]);
  });

  it("deduplicates channel ids from board columns", () => {
    expect(
      collectExistingChannelIds([
        {
          id: "col-1",
          handleInput: "@one",
          currentHandle: "@one",
          channelId: "channel-1",
          videos: []
        },
        {
          id: "col-2",
          handleInput: "@two",
          currentHandle: "@two",
          channelId: "channel-1",
          videos: []
        },
        {
          id: "col-3",
          handleInput: "",
          currentHandle: "",
          channelId: "",
          videos: []
        }
      ])
    ).toEqual(["channel-1"]);
  });

  it("groups discovered videos into unique unfollowed channels ranked by score and repeats", () => {
    const candidates = buildDiscoveryChannelCandidates(
      [
        makeDiscoveryVideo({
          videoId: "followed",
          channelId: "channel-followed",
          channelTitle: "Followed",
          score: 100
        }),
        makeDiscoveryVideo({
          videoId: "new-a-1",
          channelId: "channel-a",
          channelTitle: "A Channel",
          score: 40
        }),
        makeDiscoveryVideo({
          videoId: "new-a-2",
          channelId: "channel-a",
          channelTitle: "A Channel",
          score: 30
        }),
        makeDiscoveryVideo({
          videoId: "new-b",
          channelId: "channel-b",
          channelTitle: "B Channel",
          score: 50
        })
      ],
      ["channel-followed"],
      10
    );

    expect(candidates.map((candidate) => candidate.channelId)).toEqual(["channel-a", "channel-b"]);
    expect(candidates[0].resultCount).toBe(2);
    expect(candidates[0].video.videoId).toBe("new-a-1");
  });

  it("excludes ignored channels from discovery candidates", () => {
    const candidates = buildDiscoveryChannelCandidates(
      [
        makeDiscoveryVideo({
          videoId: "followed",
          channelId: "channel-followed",
          channelTitle: "Followed",
          score: 100
        }),
        makeDiscoveryVideo({
          videoId: "ignored",
          channelId: "channel-ignored",
          channelTitle: "Ignored",
          score: 90
        }),
        makeDiscoveryVideo({
          videoId: "new",
          channelId: "channel-new",
          channelTitle: "New",
          score: 80
        })
      ],
      ["channel-followed"],
      10,
      ["channel-ignored"]
    );

    expect(candidates.map((candidate) => candidate.channelId)).toEqual(["channel-new"]);
  });

  it("limits discovery channels to requested count", () => {
    const videos = Array.from({ length: 12 }, (_, index) =>
      makeDiscoveryVideo({
        videoId: `video-${index}`,
        channelId: `channel-${index}`,
        channelTitle: `Channel ${index}`,
        score: 20 - index
      })
    );

    expect(buildDiscoveryChannelCandidates(videos, [], 10)).toHaveLength(10);
  });
});
