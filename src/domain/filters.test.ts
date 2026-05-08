import { describe, expect, it } from "vitest";

import {
  DEFAULT_VIDEO_WINDOW_DAYS,
  formatDurationFilterSummary,
  normalizeStoredVideoWindowFilterForKind,
  normalizeVideoWindowFilterForKind
} from "./filters";

describe("video window defaults", () => {
  it("uses 7D as the default channel window", () => {
    expect(DEFAULT_VIDEO_WINDOW_DAYS).toBe(7);
    expect(normalizeVideoWindowFilterForKind("channels", undefined)).toBe(7);
  });

  it("keeps saved boards at all when value is missing or invalid", () => {
    expect(normalizeVideoWindowFilterForKind("saved", undefined)).toBe("all");
    expect(normalizeVideoWindowFilterForKind("saved", "bad")).toBe("all");
  });

  it("forces persisted channel boards to load as 7D", () => {
    expect(normalizeStoredVideoWindowFilterForKind("channels", 1)).toBe(7);
    expect(normalizeStoredVideoWindowFilterForKind("channels", 30)).toBe(7);
    expect(normalizeStoredVideoWindowFilterForKind("channels", 90)).toBe(7);
    expect(normalizeStoredVideoWindowFilterForKind("channels", "older_7")).toBe(7);
  });

  it("keeps persisted saved boards unchanged", () => {
    expect(normalizeStoredVideoWindowFilterForKind("saved", "all")).toBe("all");
    expect(normalizeStoredVideoWindowFilterForKind("saved", 120)).toBe(120);
    expect(normalizeStoredVideoWindowFilterForKind("saved", "bad")).toBe("all");
  });
});

describe("duration filter summary", () => {
  it("labels multiple selected lengths explicitly", () => {
    expect(formatDurationFilterSummary(["under_1", "min_1_3"])).toBe("MIXED LENGTHS");
  });
});
