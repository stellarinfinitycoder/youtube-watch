import { describe, expect, it, vi } from "vitest";

import {
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

  it("prunes watched entries for videos not present anywhere", () => {
    const watchedVideos = {
      missing: 1_800_000_000_000,
      present: 1_700_000_000_000
    };

    const next = pruneWatchedVideos(watchedVideos, new Set<string>(["present"]));

    expect(next).toEqual({ present: watchedVideos.present });
  });

  it("keeps watched entries for videos present in saved lists", () => {
    const watchedVideos = {
      kept: 1_600_000_000_000
    };

    const next = pruneWatchedVideos(watchedVideos, new Set<string>(["kept"]));

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
