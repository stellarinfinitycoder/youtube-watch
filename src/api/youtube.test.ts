import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildChannelAvatarProxyUrl,
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

  it("throws api route unavailable error for missing local api", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(makeResponse({}, false, 404)) as typeof fetch;

    await expect(getLatestVideosByHandle("@test")).rejects.toThrow(
      "API route unavailable"
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
