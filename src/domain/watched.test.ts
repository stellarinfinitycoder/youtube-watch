import { describe, expect, it, vi } from "vitest";

import {
  WATCHED_RETENTION_MS,
  collectMissingDurationNewVideoIds,
  isVideoMarkedWatched,
  pruneWatchedVideos,
  setWatchedForVideoIds
} from "./watched";

describe("watched domain", () => {
  it("writes watched timestamps when marking videos watched", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T10:00:00Z"));

    const next = setWatchedForVideoIds({}, ["vid-1"], true);

    expect(next["vid-1"]).toBe(Date.now());
    vi.useRealTimers();
  });

  it("matches watched status case-insensitively", () => {
    expect(isVideoMarkedWatched({ "Vid-1": 123 }, "vid-1")).toBe(true);
  });

  it("prunes old watched entries that are not in saved lists", () => {
    const now = 1_800_000_000_000;
    const watchedVideos = {
      old: now - WATCHED_RETENTION_MS - 1,
      recent: now - WATCHED_RETENTION_MS + 1
    };

    const next = pruneWatchedVideos(watchedVideos, new Set<string>(), now);

    expect(next).toEqual({ recent: watchedVideos.recent });
  });

  it("keeps old watched entries for saved videos", () => {
    const now = 1_800_000_000_000;
    const watchedVideos = {
      kept: now - WATCHED_RETENTION_MS - 1
    };

    const next = pruneWatchedVideos(watchedVideos, new Set<string>(["kept"]), now);

    expect(next).toEqual(watchedVideos);
  });

  it("skips watched and already-filled videos when collecting missing durations", () => {
    const ids = collectMissingDurationNewVideoIds(
      { watched: 123 },
      [
        {
          videoId: "watched",
          title: "Watched",
          publishedAt: "2026-04-01T00:00:00Z",
          thumbnailUrl: "",
          channelTitle: "",
          videoUrl: ""
        },
        {
          videoId: "has-duration",
          title: "Has duration",
          publishedAt: "2026-04-01T00:00:00Z",
          thumbnailUrl: "",
          channelTitle: "",
          videoUrl: "",
          durationSeconds: 30
        },
        {
          videoId: "missing",
          title: "Missing",
          publishedAt: "2026-04-01T00:00:00Z",
          thumbnailUrl: "",
          channelTitle: "",
          videoUrl: ""
        }
      ]
    );

    expect(ids).toEqual(["missing"]);
  });
});
