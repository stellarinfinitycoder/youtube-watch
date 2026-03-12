import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchLatestVideos, getLatestVideosByHandle, resolveChannelByHandle } from "./youtube";

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
    vi.stubEnv("VITE_YOUTUBE_API_KEY", "test-key");
  });

  it("resolves channel id by handle", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(makeResponse({ items: [{ id: "UC123" }] })) as typeof fetch;

    const channelId = await resolveChannelByHandle("@testchannel");
    expect(channelId).toBe("UC123");
  });

  it("returns exactly 15 videos when requesting latest uploads", async () => {
    const items = Array.from({ length: 20 }, (_, index) => ({
      snippet: {
        title: `Video ${index}`,
        channelTitle: "Test Channel",
        publishedAt: "2025-01-01T00:00:00Z",
        resourceId: { videoId: `video-${index}` },
        thumbnails: { medium: { url: `https://img.test/${index}.jpg` } }
      }
    }));

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse({
          items: [
            {
              contentDetails: {
                relatedPlaylists: {
                  uploads: "UU123"
                }
              }
            }
          ]
        })
      )
      .mockResolvedValueOnce(makeResponse({ items })) as typeof fetch;

    const videos = await fetchLatestVideos("UC123", 15);
    expect(videos).toHaveLength(15);
    expect(videos[0].videoId).toBe("video-0");
  });

  it("maps missing fields safely", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse({
          items: [
            {
              contentDetails: {
                relatedPlaylists: {
                  uploads: "UU123"
                }
              }
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        makeResponse({
          items: [
            {
              snippet: {
                resourceId: { videoId: "video-1" }
              }
            }
          ]
        })
      ) as typeof fetch;

    const videos = await fetchLatestVideos("UC123", 15);
    expect(videos[0]).toMatchObject({
      videoId: "video-1",
      title: "Untitled video",
      thumbnailUrl: ""
    });
  });

  it("throws channel not found error", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(makeResponse({ items: [] })) as typeof fetch;

    await expect(resolveChannelByHandle("@missing")).rejects.toThrow(
      "Channel not found"
    );
  });

  it("throws api error for quota/network style failures", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      makeResponse(
        { error: { message: "Quota exceeded" } },
        false,
        403
      )
    ) as typeof fetch;

    await expect(getLatestVideosByHandle("@test")).rejects.toThrow(
      "Quota exceeded"
    );
  });
});

afterEach(() => {
  global.fetch = originalFetch;
});
