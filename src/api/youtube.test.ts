import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildChannelAvatarProxyUrl,
  discoverSimilarVideos,
  fetchLatestVideos,
  fetchViewCountsByVideoIds,
  getLatestVideosByHandle,
  getLatestVideosAndChannelByHandle,
  resolveChannelByHandle
} from "./youtube";

const originalFetch = global.fetch;

function makeResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => data
  } as Response;
}

describe("youtube api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves channel id by handle via internal api", async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse({ channelId: "UC123", channelThumbnailUrl: "https://img.test/channel.jpg" })
      );
    global.fetch = spy as typeof fetch;

    const channelId = await resolveChannelByHandle("@testchannel");
    expect(channelId).toBe("UC123");
    expect(spy).toHaveBeenCalledWith("/api/youtube/resolve?handle=%40testchannel", undefined);
  });

  it("returns exactly 15 videos when requesting by channel id", async () => {
    const videos = Array.from({ length: 15 }, (_, index) => ({
      videoId: `video-${index}`,
      title: `Video ${index}`,
      publishedAt: "2025-01-01T00:00:00Z",
      thumbnailUrl: `https://img.test/${index}.jpg`,
      channelTitle: "Test Channel",
      videoUrl: `https://www.youtube.com/watch?v=video-${index}`,
      viewCount: 1000 + index
    }));

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(makeResponse({ videos })) as typeof fetch;

    const result = await fetchLatestVideos("UC123", 15);
    expect(result).toHaveLength(15);
    expect(result[0].videoId).toBe("video-0");
  });

  it("gets latest videos by handle", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse({ channelThumbnailUrl: "https://img.test/c.jpg", videos: [{
          videoId: "v1",
          title: "Demo",
          publishedAt: "2026-01-01T00:00:00Z",
          thumbnailUrl: "",
          channelTitle: "C",
          videoUrl: "https://www.youtube.com/watch?v=v1",
          viewCount: null
        }] })
      ) as typeof fetch;

    const videos = await getLatestVideosByHandle("@demo");
    expect(videos).toHaveLength(1);
    expect(videos[0].videoId).toBe("v1");
  });

  it("returns channel thumbnail and videos by handle", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse({ channelThumbnailUrl: "https://img.test/channel.jpg", videos: [] })
      ) as typeof fetch;

    const result = await getLatestVideosAndChannelByHandle("@test", 25);
    expect(result.channelThumbnailUrl).toContain("img.test/channel.jpg");
    expect(result.videos).toEqual([]);
  });

  it("builds a proxied channel avatar url", () => {
    expect(buildChannelAvatarProxyUrl("https://yt3.ggpht.com/avatar=s88")).toBe(
      "/api/youtube/channel-avatar?url=https%3A%2F%2Fyt3.ggpht.com%2Favatar%3Ds88"
    );
    expect(buildChannelAvatarProxyUrl("")).toBe("");
  });

  it("posts video ids for view-count backfill", async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce(makeResponse({ v1: 12, v2: 34 }));
    global.fetch = spy as typeof fetch;

    const result = await fetchViewCountsByVideoIds(["v1", "v2", "v1"]);
    expect(result).toEqual({ v1: 12, v2: 34 });
    expect(spy).toHaveBeenCalledWith(
      "/api/youtube/view-counts",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("posts board seeds for similar video discovery", async () => {
    const spy = vi.fn().mockResolvedValueOnce(
      makeResponse({
        videos: [
          {
            videoId: "video-1",
            title: "Similar video",
            publishedAt: "2026-05-01T00:00:00Z",
            thumbnailUrl: "https://img.test/video.jpg",
            channelTitle: "Similar Channel",
            videoUrl: "https://www.youtube.com/watch?v=video-1",
            viewCount: 123,
            channelId: "channel-2",
            channelThumbnailUrl: "https://img.test/channel.jpg",
            uploadsPlaylistId: "uploads-2",
            channelHandle: "@similar",
            channelUrl: "https://www.youtube.com/@similar",
            matchReason: "Matched board video",
            matchedSeed: "react performance",
            score: 42,
            alreadyOnBoard: false
          }
        ],
        searchedSeeds: [
          {
            query: "react performance",
            source: "video",
            sourceTitle: "React performance patterns"
          }
        ],
        estimatedQuotaUnits: 102
      })
    );
    global.fetch = spy as typeof fetch;

    const result = await discoverSimilarVideos({
      seeds: [
        {
          query: "react performance",
          source: "video",
          sourceTitle: "React performance patterns"
        }
      ],
      existingChannelIds: ["channel-1", "channel-1"],
      maxSeeds: 1,
      resultsPerSeed: 10
    });

    expect(result.videos[0].channelId).toBe("channel-2");
    expect(spy).toHaveBeenCalledWith(
      "/api/youtube/discover-similar-videos",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          seeds: [
            {
              query: "react performance",
              source: "video",
              sourceTitle: "React performance patterns"
            }
          ],
          existingChannelIds: ["channel-1"],
          maxSeeds: 1,
          resultsPerSeed: 10
        })
      })
    );
  });

  it("posts edited manual seeds for similar video discovery", async () => {
    const spy = vi.fn().mockResolvedValueOnce(
      makeResponse({
        videos: [],
        searchedSeeds: [
          {
            query: "edited ai channels",
            source: "manual",
            sourceTitle: "Active Seed Video about agents"
          }
        ],
        estimatedQuotaUnits: 100
      })
    );
    global.fetch = spy as typeof fetch;

    await discoverSimilarVideos({
      seeds: [
        {
          query: "edited ai channels",
          source: "manual",
          sourceTitle: "Active Seed Video about agents"
        }
      ],
      existingChannelIds: [],
      maxSeeds: 1,
      resultsPerSeed: 25
    });

    expect(spy).toHaveBeenCalledWith(
      "/api/youtube/discover-similar-videos",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          seeds: [
            {
              query: "edited ai channels",
              source: "manual",
              sourceTitle: "Active Seed Video about agents"
            }
          ],
          existingChannelIds: [],
          maxSeeds: 1,
          resultsPerSeed: 25
        })
      })
    );
  });

  it("throws api route unavailable error for missing local api", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(makeResponse({}, false, 404)) as typeof fetch;

    await expect(getLatestVideosByHandle("@test")).rejects.toThrow(
      "npm run dev:api"
    );
  });

  it("throws clean channel-not-found message on 404 not found errors", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse({ error: "Channel not found for handle @missing." }, false, 404)
      ) as typeof fetch;

    await expect(getLatestVideosByHandle("@missing")).rejects.toThrow("Channel not found.");
  });

  it("throws backend error messages", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse({ error: "Quota exceeded" }, false, 403)
      ) as typeof fetch;

    await expect(getLatestVideosByHandle("@test")).rejects.toThrow("Quota exceeded");
  });
});

afterEach(() => {
  global.fetch = originalFetch;
});
