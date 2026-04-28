import { describe, expect, it } from "vitest";
import { buildStoredSummaryDisplayEntries, buildSummariesBoardVideos } from "./summariesBoard";
import type { VideoItem } from "../types/youtube";

function video(videoId: string, title: string): VideoItem {
  return {
    videoId,
    title,
    publishedAt: "2026-04-10T10:00:00Z",
    thumbnailUrl: `https://img.test/${videoId}.jpg`,
    channelTitle: "Channel",
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    viewCount: 100
  };
}

function column(id: string, videos: VideoItem[]) {
  return {
    id,
    handleInput: "@channel",
    currentHandle: "@channel",
    channelThumbnailUrl: "",
    lastGoodChannelThumbnailUrl: "",
    videos,
    loading: false,
    error: null,
    savedSortMode: ""
  };
}

function hashSummaryText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

function promptHash(prompt: string, model: string): string {
  return hashSummaryText(`${prompt.trim()}\n__MODEL__:${model.trim() || ""}`);
}

describe("summariesBoard", () => {
  it("joins summaries to board videos, de-dupes, and sorts newest summary first", () => {
    const firstVideo = video("video-1", "First");
    const duplicateFirstVideo = { ...firstVideo, title: "First duplicate" };
    const secondVideo = video("video-2", "Second");
    const unsummarizedVideo = video("video-3", "Third");

    const result = buildSummariesBoardVideos(
      [
        {
          id: "board-1",
          watchedVideos: { "video-1": 1 },
          columns: [column("column-1", [firstVideo, unsummarizedVideo])]
        },
        {
          id: "board-2",
          watchedVideos: {},
          columns: [column("column-2", [duplicateFirstVideo, secondVideo])]
        }
      ],
      [
        { videoId: "video-1", latestCachedAt: 20 },
        { videoId: "video-2", latestCachedAt: 30 }
      ]
    );

    expect(result.map((item) => item.video.videoId)).toEqual(["video-2", "video-1"]);
    expect(result.find((item) => item.video.videoId === "video-1")?.isWatched).toBe(true);
    expect(result.find((item) => item.video.videoId === "video-1")?.video.title).toBe("First");
  });

  it("builds stored summary display entries in configured format order", () => {
    const formats = [
      {
        id: "brief",
        name: "Brief",
        prompt: "Brief prompt",
        model: "openai/gpt-4o-mini"
      },
      {
        id: "deep",
        name: "Deep",
        prompt: "Deep prompt",
        model: "google/gemini-2.5-flash"
      }
    ];
    const briefHash = promptHash("Brief prompt", "openai/gpt-4o-mini");
    const deepHash = promptHash("Deep prompt", "google/gemini-2.5-flash");

    const result = buildStoredSummaryDisplayEntries(
      [
        {
          promptHash: deepHash,
          entry: {
            summary: "Deep summary",
            keyPoints: [],
            model: "google/gemini-2.5-flash",
            cachedAt: Date.parse("2026-04-28T10:00:00Z")
          }
        },
        {
          promptHash: "unmatched",
          entry: {
            summary: "Unmatched summary",
            keyPoints: [],
            model: "",
            cachedAt: Date.parse("2026-04-28T09:00:00Z")
          }
        },
        {
          promptHash: briefHash,
          entry: {
            summary: "Brief summary",
            keyPoints: [],
            model: "openai/gpt-4o-mini",
            cachedAt: Date.parse("2026-04-28T08:00:00Z")
          }
        }
      ],
      formats
    );

    expect(result.map((entry) => entry.summaryFormatId)).toEqual(["brief", "deep", null]);
    expect(result.map((entry) => entry.label)).toEqual([
      "BRIEF - GPT-4O-MINI - 2026-04-28",
      "DEEP - GEMINI-2.5-FLASH - 2026-04-28",
      "STORED SUMMARY - DEFAULT - 2026-04-28"
    ]);
  });
});
