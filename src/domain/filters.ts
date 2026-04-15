import type { VideoItem } from "../types/youtube";

export type VideoWindowDays = 1 | 3 | 7 | 30 | 60 | 90 | 120 | 180 | 360;
export type ChannelVideoWindowFilter =
  | VideoWindowDays
  | "older_1"
  | "older_3"
  | "older_7"
  | "older_30"
  | "older_60";
export type VideoWindowFilter = ChannelVideoWindowFilter | "all";
export type VideoDurationFilterOption =
  | "all"
  | "under_1"
  | "min_1_3"
  | "min_3_10"
  | "min_10_30"
  | "min_30_60"
  | "long"
  | "unknown";
export type VideoDurationFilter = VideoDurationFilterOption[];
export type BoardKind = "channels" | "saved";
export type ColumnScopeColumn = {
  id: string;
  handleInput: string;
  currentHandle: string;
};

export const DEFAULT_VIDEO_WINDOW_DAYS: VideoWindowFilter = 7;
export const CHANNEL_VIDEO_WINDOW_OPTIONS: ChannelVideoWindowFilter[] = [
  1,
  3,
  7,
  30,
  60,
  90,
  "older_1",
  "older_3",
  "older_7",
  "older_30",
  "older_60"
];
export const SAVED_VIDEO_WINDOW_OPTIONS: VideoWindowFilter[] = [
  1,
  3,
  7,
  30,
  60,
  90,
  120,
  180,
  360,
  "all"
];
export const VIDEO_DURATION_FILTER_OPTIONS: Array<{
  value: VideoDurationFilterOption;
  label: string;
}> = [
  { value: "all", label: "ANY LENGTH" },
  { value: "under_1", label: "< 1 MIN" },
  { value: "min_1_3", label: "1 - 3 MIN" },
  { value: "min_3_10", label: "3 - 10 MIN" },
  { value: "min_10_30", label: "10 - 30 MIN" },
  { value: "min_30_60", label: "30 - 60 MIN" },
  { value: "long", label: "60+ MIN" },
  { value: "unknown", label: "UNKNOWN" }
];

function isVideoWindowFilter(value: unknown): value is VideoWindowFilter {
  return (
    value === "all" ||
    value === "older_1" ||
    value === "older_3" ||
    value === "older_7" ||
    value === "older_30" ||
    value === "older_60" ||
    (typeof value === "number" &&
      [...CHANNEL_VIDEO_WINDOW_OPTIONS, ...SAVED_VIDEO_WINDOW_OPTIONS]
        .filter((item): item is VideoWindowDays => typeof item === "number")
        .includes(value as VideoWindowDays))
  );
}

export function normalizeVideoWindowFilterForKind(
  kind: BoardKind,
  value: unknown
): VideoWindowFilter {
  if (!isVideoWindowFilter(value)) {
    return kind === "saved" ? "all" : DEFAULT_VIDEO_WINDOW_DAYS;
  }
  const allowed = kind === "saved" ? SAVED_VIDEO_WINDOW_OPTIONS : CHANNEL_VIDEO_WINDOW_OPTIONS;
  return allowed.includes(value) ? value : kind === "saved" ? "all" : DEFAULT_VIDEO_WINDOW_DAYS;
}

export function normalizeStoredVideoWindowFilterForKind(
  kind: BoardKind,
  value: unknown
): VideoWindowFilter {
  if (kind === "saved") {
    return normalizeVideoWindowFilterForKind(kind, value);
  }
  return DEFAULT_VIDEO_WINDOW_DAYS;
}

export function matchesDurationFilter(
  durationSeconds: number | null | undefined,
  filters: VideoDurationFilter
): boolean {
  const normalized =
    filters.length === 0 || filters.includes("all")
      ? (["all"] as VideoDurationFilter)
      : filters;
  if (normalized.includes("all")) {
    return true;
  }
  if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds)) {
    return normalized.includes("unknown");
  }
  return normalized.some((filter) => {
    if (filter === "unknown" || filter === "all") {
      return false;
    }
    if (filter === "under_1") {
      return durationSeconds < 60;
    }
    if (filter === "min_1_3") {
      return durationSeconds >= 60 && durationSeconds < 180;
    }
    if (filter === "min_3_10") {
      return durationSeconds >= 180 && durationSeconds < 600;
    }
    if (filter === "min_10_30") {
      return durationSeconds >= 600 && durationSeconds < 1800;
    }
    if (filter === "min_30_60") {
      return durationSeconds >= 1800 && durationSeconds < 3600;
    }
    return durationSeconds >= 3600;
  });
}

export function normalizeVideoDurationFilter(input: unknown): VideoDurationFilter {
  const isValid = (value: unknown): value is VideoDurationFilterOption =>
    value === "all" ||
    value === "under_1" ||
    value === "min_1_3" ||
    value === "min_3_10" ||
    value === "min_10_30" ||
    value === "min_30_60" ||
    value === "long" ||
    value === "unknown";

  if (Array.isArray(input)) {
    const next = [...new Set(input.filter((item): item is VideoDurationFilterOption => isValid(item)))];
    if (next.includes("all") || next.length === 0) {
      return ["all"];
    }
    return next;
  }
  if (isValid(input)) {
    return [input];
  }
  return ["all"];
}

export function resolveVideoDurationFilterSelection(
  nextInput: unknown,
  previous: VideoDurationFilter
): VideoDurationFilter {
  const previousNormalized = normalizeVideoDurationFilter(previous);
  const raw = Array.isArray(nextInput) ? nextInput : [nextInput];
  const isValid = (value: unknown): value is VideoDurationFilterOption =>
    value === "all" ||
    value === "under_1" ||
    value === "min_1_3" ||
    value === "min_3_10" ||
    value === "min_10_30" ||
    value === "min_30_60" ||
    value === "long" ||
    value === "unknown";
  const validRaw = [...new Set(raw.filter((value): value is VideoDurationFilterOption => isValid(value)))];

  if (validRaw.includes("all")) {
    if (validRaw.length > 1) {
      return previousNormalized.includes("all")
        ? validRaw.filter((value) => value !== "all")
        : ["all"];
    }
    return ["all"];
  }

  if (validRaw.includes("unknown")) {
    if (validRaw.length > 1) {
      return previousNormalized.includes("unknown")
        ? validRaw.filter((value) => value !== "unknown")
        : ["unknown"];
    }
    return ["unknown"];
  }

  if (validRaw.length === 0) {
    return ["all"];
  }

  return validRaw;
}

function getDurationFilterOptionLabel(value: VideoDurationFilterOption): string {
  return (
    VIDEO_DURATION_FILTER_OPTIONS.find((option) => option.value === value)?.label ?? "SELECT LENGTH"
  );
}

export function formatDurationFilterSummary(filters: VideoDurationFilter): string {
  const normalized = normalizeVideoDurationFilter(filters);
  if (normalized.includes("all")) {
    return "ANY LENGTH";
  }
  if (normalized.length === 1) {
    return getDurationFilterOptionLabel(normalized[0]);
  }
  return "SELECT LENGTH";
}

export function getVideoPublishedTime(video: VideoItem): number {
  const parsed = Date.parse(video.publishedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function matchesVideoWindowFilter(
  publishedTime: number,
  windowFilter: VideoWindowFilter,
  now = Date.now()
): boolean {
  if (!Number.isFinite(publishedTime) || publishedTime <= 0) {
    return false;
  }
  if (windowFilter === "all") {
    return true;
  }
  if (windowFilter === "older_1") {
    return publishedTime <= now - 1 * 24 * 60 * 60 * 1000;
  }
  if (windowFilter === "older_3") {
    return publishedTime <= now - 3 * 24 * 60 * 60 * 1000;
  }
  if (windowFilter === "older_7") {
    return publishedTime <= now - 7 * 24 * 60 * 60 * 1000;
  }
  if (windowFilter === "older_30") {
    return publishedTime <= now - 30 * 24 * 60 * 60 * 1000;
  }
  if (windowFilter === "older_60") {
    return publishedTime <= now - 60 * 24 * 60 * 60 * 1000;
  }
  return publishedTime >= now - windowFilter * 24 * 60 * 60 * 1000;
}

export function normalizeColumnScopeFilter(
  input: unknown,
  columns: ColumnScopeColumn[],
  allValue: string,
  notEmptyValue: string
): string[] {
  const validValues = new Set<string>([
    allValue,
    notEmptyValue,
    ...columns.map((column) => column.id)
  ]);
  const raw = Array.isArray(input) ? input : [input];
  const next = [
    ...new Set(
      raw.filter((value): value is string => typeof value === "string" && validValues.has(value))
    )
  ];
  if (next.length === 0 || next.includes(allValue)) {
    return [allValue];
  }
  if (next.includes(notEmptyValue)) {
    return [notEmptyValue];
  }
  return next;
}

export function resolveColumnScopeFilterSelection(
  nextInput: unknown,
  previous: string[],
  columns: ColumnScopeColumn[],
  allValue: string,
  notEmptyValue: string
): string[] {
  const previousNormalized = normalizeColumnScopeFilter(previous, columns, allValue, notEmptyValue);
  const raw = Array.isArray(nextInput) ? nextInput : [nextInput];
  const validValues = new Set<string>([
    allValue,
    notEmptyValue,
    ...columns.map((column) => column.id)
  ]);
  const validRaw = [
    ...new Set(
      raw.filter((value): value is string => typeof value === "string" && validValues.has(value))
    )
  ];

  if (validRaw.includes(allValue)) {
    if (validRaw.length > 1) {
      return previousNormalized.includes(allValue)
        ? validRaw.filter((value) => value !== allValue)
        : [allValue];
    }
    return [allValue];
  }

  if (validRaw.includes(notEmptyValue)) {
    if (validRaw.length > 1) {
      return previousNormalized.includes(notEmptyValue)
        ? validRaw.filter((value) => value !== notEmptyValue)
        : [notEmptyValue];
    }
    return [notEmptyValue];
  }

  if (validRaw.length === 0) {
    return [allValue];
  }

  return validRaw;
}

export function formatColumnScopeSummary(
  values: string[],
  isSavedBoardActive: boolean,
  columns: ColumnScopeColumn[],
  allValue: string,
  notEmptyValue: string
): string {
  const normalized = normalizeColumnScopeFilter(values, columns, allValue, notEmptyValue);
  if (normalized.includes(allValue)) {
    return isSavedBoardActive ? "ALL LISTS" : "ALL CHANNELS";
  }
  if (normalized.includes(notEmptyValue)) {
    return "ACTIVE CHANNELS";
  }
  if (normalized.length === 1) {
    const selectedColumn = columns.find((column) => column.id === normalized[0]);
    if (!selectedColumn) {
      return "1 SELECTED";
    }
    const raw = selectedColumn.currentHandle.trim() || selectedColumn.handleInput.trim();
    if (raw.length === 0) {
      return isSavedBoardActive ? "1 LIST" : "1 CHANNEL";
    }
    const label = isSavedBoardActive ? raw : raw.startsWith("@") ? raw : `@${raw}`;
    return label.toUpperCase();
  }
  return `${normalized.length} SELECTED`;
}
