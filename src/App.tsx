import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Select,
  Skeleton,
  Space,
  Spin,
  Tooltip,
  Typography
} from "antd";
import type { FetchState } from "./types/youtube";
import {
  fetchPlaylistDiscoveryPage,
  fetchVideoStatsByVideoIds,
  resolveChannelByInputWithThumbnail,
  resolveChannelByHandleWithThumbnail
} from "./api/youtube";
import { normalizeHandle } from "./utils/handle";
import type { VideoItem } from "./types/youtube";

const { Title, Text } = Typography;
const DEFAULT_COLUMN_COUNT = 3;
const CHANGE_STAMP = "180326090731";
const TOP_BAR_LOGO_SRC = import.meta.env.PROD ? "/svg/logo-prod.svg" : "/svg/logo-dev.svg";
const SAVED_LIST_PLACEHOLDER_ICON = "/svg/placeholder-list.svg";
const CHANNEL_PLACEHOLDER_ICON = "/svg/placeholder-channel.svg";
const PLAYBACK_RATE_OPTIONS = [1, 1.5, 2] as const;
const BUILD_INFO_LABEL = CHANGE_STAMP;
const BOARDS_STORAGE_KEY = "youtube-watch:boards:v1";
const ACTIVE_BOARD_ID_STORAGE_KEY = "youtube-watch:active-board-id:v1";
const ERROR_LOGS_STORAGE_KEY = "youtube-watch:error-logs:v1";
const QUOTA_ESTIMATE_STORAGE_KEY = "youtube-watch:quota-estimate:v1";
const LEGACY_HANDLE_STORAGE_KEY = "youtube-watch:handles:v1";
const LEGACY_COLUMNS_STORAGE_KEY = "youtube-watch:columns:v2";
const LEGACY_WATCHED_STORAGE_KEY = "youtube-watch:watched:v1";
const LEGACY_PLAYBACK_RATE_STORAGE_KEY = "youtube-watch:playback-rate:v1";
const YOUTUBE_IFRAME_API_SRC = "https://www.youtube.com/iframe_api";

type VideoFilter = "all" | "new" | "watched";
type VideoWindowDays = 1 | 3 | 7 | 30 | 60 | 90 | 120 | 180 | 360;
type ChannelVideoWindowFilter = VideoWindowDays | "older_7" | "older_30" | "older_60";
type VideoWindowFilter = ChannelVideoWindowFilter | "all";
type VideoDurationFilterOption =
  | "all"
  | "under_1"
  | "min_1_3"
  | "min_3_10"
  | "min_10_30"
  | "min_30_60"
  | "long"
  | "unknown";
type VideoDurationFilter = VideoDurationFilterOption[];
type PlaylistScope = "all" | "channel";
type BoardKind = "channels" | "saved";
type SavedSortMode =
  | "time_asc"
  | "time_desc"
  | "added_asc"
  | "added_desc"
  | "manual";
const CHANNEL_VIDEO_WINDOW_OPTIONS: ChannelVideoWindowFilter[] = [
  1,
  3,
  7,
  30,
  60,
  90,
  "older_7",
  "older_30",
  "older_60"
];
const SAVED_VIDEO_WINDOW_OPTIONS: VideoWindowFilter[] = [
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
const VIDEO_DURATION_FILTER_OPTIONS: Array<{ value: VideoDurationFilterOption; label: string }> = [
  { value: "all", label: "ANY LENGTH" },
  { value: "under_1", label: "< 1 MIN" },
  { value: "min_1_3", label: "1 - 3 MIN" },
  { value: "min_3_10", label: "3 - 10 MIN" },
  { value: "min_10_30", label: "10 - 30 MIN" },
  { value: "min_30_60", label: "30 - 60 MIN" },
  { value: "long", label: "60+ MIN" },
  { value: "unknown", label: "UNKNOWN" }
];
const SAVED_SORT_MODE_OPTIONS: Array<{ value: SavedSortMode; label: string }> = [
  { value: "time_asc", label: "TIME ↑" },
  { value: "time_desc", label: "TIME ↓" },
  { value: "added_asc", label: "ADDED ↑" },
  { value: "added_desc", label: "ADDED ↓" },
  { value: "manual", label: "MANUAL" }
];
const DEFAULT_SAVED_SORT_MODE: SavedSortMode = "added_desc";
const DEFAULT_VIDEO_WINDOW_DAYS: VideoWindowFilter = 90;
const STORAGE_VIDEO_WINDOW_DAYS: VideoWindowDays = 90;
const CHANNEL_VIDEO_WINDOW_SELECT_OPTIONS: Array<{
  value: ChannelVideoWindowFilter;
  label: string;
}> = [
  { value: 1, label: "LAST 1D" },
  { value: 3, label: "LAST 3D" },
  { value: 7, label: "LAST 7D" },
  { value: 30, label: "LAST 30D" },
  { value: 60, label: "LAST 60D" },
  { value: 90, label: "LAST 90D" },
  { value: "older_7", label: ">7D" },
  { value: "older_30", label: ">30D" },
  { value: "older_60", label: ">60D" }
];
const SAVED_VIDEO_WINDOW_SELECT_OPTIONS: Array<{ value: VideoWindowFilter; label: string }> = [
  { value: 1, label: "LAST 1D" },
  { value: 3, label: "LAST 3D" },
  { value: 7, label: "LAST 7D" },
  { value: 30, label: "LAST 30D" },
  { value: 60, label: "LAST 60D" },
  { value: 90, label: "LAST 90D" },
  { value: 120, label: "LAST 120D" },
  { value: 180, label: "LAST 180D" },
  { value: 360, label: "LAST 360D" },
  { value: "all", label: "LAST ALL" }
];
const BOARD_DROPDOWN_MAX_VISIBLE = 25;
const CHANNEL_SCOPE_DROPDOWN_MAX_VISIBLE = 20;
const BOARD_DROPDOWN_ITEM_HEIGHT = 36;
const BOARD_DROPDOWN_PADDING = 8;
const SAVED_BOARD_ID = "saved-board-system";
const SAVED_BOARD_NAME = "SAVED LISTS";

type YouTubePlayer = {
  destroy: () => void;
  setPlaybackRate: (suggestedRate: number) => void;
  getAvailablePlaybackRates: () => number[];
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  playVideo: () => void;
  pauseVideo: () => void;
};

type YouTubePlayerEvent = {
  target: YouTubePlayer;
};

type YouTubePlayerStateChangeEvent = {
  target: YouTubePlayer;
  data: number;
};

type YouTubeNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars?: Record<string, number>;
      events?: {
        onReady?: (event: YouTubePlayerEvent) => void;
        onStateChange?: (event: YouTubePlayerStateChangeEvent) => void;
      };
    }
  ) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeIframeApiPromise: Promise<void> | null = null;

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API unavailable in this environment."));
  }

  if (window.YT?.Player) {
    return Promise.resolve();
  }

  if (youtubeIframeApiPromise) {
    return youtubeIframeApiPromise;
  }

  youtubeIframeApiPromise = new Promise<void>((resolve) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousReady === "function") {
        previousReady();
      }
      resolve();
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${YOUTUBE_IFRAME_API_SRC}"]`
    );
    if (!existing) {
      const script = document.createElement("script");
      script.src = YOUTUBE_IFRAME_API_SRC;
      document.head.appendChild(script);
    }
  });

  return youtubeIframeApiPromise;
}

type ColumnState = FetchState & {
  id: string;
  handleInput: string;
  channelId: string;
  uploadsPlaylistId: string;
  channelThumbnailUrl: string;
  lastFetchAt: string | null;
  savedSortMode: SavedSortMode;
  savedAddedAtByVideoId: Record<string, number>;
  savedManualOrder: string[];
};

type PersistedColumnState = {
  id: string;
  handleInput: string;
  currentHandle: string;
  channelId?: string;
  uploadsPlaylistId?: string;
  channelThumbnailUrl: string;
  videos: VideoItem[];
  lastFetchAt: string | null;
  savedSortMode?: SavedSortMode;
  savedAddedAtByVideoId?: Record<string, number>;
  savedManualOrder?: string[];
};

type BoardState = {
  id: string;
  name: string;
  kind: BoardKind;
  columns: ColumnState[];
  columnScopeFilter: string[];
  watchedVideos: Record<string, boolean>;
  viewCountRefreshedAtByVideoId: Record<string, number>;
  videoFilter: VideoFilter;
  videoDurationFilter: VideoDurationFilter;
  videoWindowDays: VideoWindowFilter;
  defaultPlaybackRate: number;
};

type PersistedBoardState = {
  id: string;
  name: string;
  kind?: BoardKind;
  columns: PersistedColumnState[];
  columnScopeFilter?: string | string[];
  watchedVideos: Record<string, boolean>;
  viewCountRefreshedAtByVideoId?: Record<string, number>;
  videoFilter: VideoFilter;
  videoDurationFilter?: VideoDurationFilter;
  videoWindowDays: VideoWindowFilter;
  defaultPlaybackRate: number;
};

type BackupPayload = {
  version: 2;
  exportedAt: string;
  boards: PersistedBoardState[];
  activeBoardId: string;
};

type ErrorLogEntry = {
  id: string;
  time: string;
  board: string;
  column: string;
  action: "FETCH";
  message: string;
};

type BulkWatchColumnAction = {
  columnId: string;
  channelName: string;
  videoIds: string[];
  markWatched: boolean;
};

type RemoveAllSavedColumnAction = {
  columnId: string;
  listName: string;
  videoCount: number;
};

type BoardDurationBackfillAction = {
  boardId: string;
  boardName: string;
  videoIds: string[];
  estimatedQueries: number;
};

type InlineMetaFeedback = {
  kind: "info" | "success" | "warning" | "error";
  text: string;
};

type QuotaEstimateState = {
  dayKey: string;
  todayUnits: number;
  lastActionUnits: number;
};

const NEW_BOARD_OPTION_VALUE = "__new__";
const COLUMN_SCOPE_ALL = "__all__";
const COLUMN_SCOPE_NOT_EMPTY = "__not_empty__";

function createColumnId(): string {
  return `col-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createBoardId(): string {
  return `board-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createColumnState(overrides?: Partial<ColumnState>): ColumnState {
  return {
    id: createColumnId(),
    handleInput: "",
    channelId: "",
    uploadsPlaylistId: "",
    channelThumbnailUrl: "",
    lastFetchAt: null,
    loading: false,
    error: null,
    videos: [],
    currentHandle: "",
    savedSortMode: DEFAULT_SAVED_SORT_MODE,
    savedAddedAtByVideoId: {},
    savedManualOrder: [],
    ...overrides
  };
}

function normalizeSavedColumnOrderData(
  videos: VideoItem[],
  savedAddedAtByVideoId: Record<string, number> | undefined,
  savedManualOrder: string[] | undefined
): { savedAddedAtByVideoId: Record<string, number>; savedManualOrder: string[] } {
  const videoIds = videos.map((video) => video.videoId);
  const idSet = new Set(videoIds);
  const nextAdded: Record<string, number> = {};
  if (savedAddedAtByVideoId) {
    for (const [videoId, value] of Object.entries(savedAddedAtByVideoId)) {
      if (!idSet.has(videoId) || !Number.isFinite(value)) {
        continue;
      }
      nextAdded[videoId] = value;
    }
  }

  // Preserve existing list order when backfilling missing "added at" values.
  const base = Date.now();
  videoIds.forEach((videoId, index) => {
    if (typeof nextAdded[videoId] === "number") {
      return;
    }
    nextAdded[videoId] = base - index;
  });

  const manualUnique = new Set<string>();
  const nextManual = (savedManualOrder ?? []).filter((videoId) => {
    if (!idSet.has(videoId) || manualUnique.has(videoId)) {
      return false;
    }
    manualUnique.add(videoId);
    return true;
  });
  videoIds.forEach((videoId) => {
    if (!manualUnique.has(videoId)) {
      nextManual.push(videoId);
    }
  });

  return {
    savedAddedAtByVideoId: nextAdded,
    savedManualOrder: nextManual
  };
}

function sortSavedVideosByMode(column: ColumnState): VideoItem[] {
  const videos = [...column.videos];
  const { savedSortMode, savedAddedAtByVideoId, savedManualOrder } = column;
  if (savedSortMode === "manual") {
    const orderById = new Map(savedManualOrder.map((videoId, index) => [videoId, index]));
    return videos.sort((a, b) => {
      const aIndex = orderById.get(a.videoId);
      const bIndex = orderById.get(b.videoId);
      if (typeof aIndex === "number" && typeof bIndex === "number") {
        return aIndex - bIndex;
      }
      if (typeof aIndex === "number") {
        return -1;
      }
      if (typeof bIndex === "number") {
        return 1;
      }
      return 0;
    });
  }

  if (savedSortMode === "time_asc" || savedSortMode === "time_desc") {
    return videos.sort((a, b) => {
      const delta = getVideoPublishedTime(a) - getVideoPublishedTime(b);
      return savedSortMode === "time_asc" ? delta : -delta;
    });
  }

  return videos.sort((a, b) => {
    const aAdded = savedAddedAtByVideoId[a.videoId] ?? 0;
    const bAdded = savedAddedAtByVideoId[b.videoId] ?? 0;
    const delta = aAdded - bAdded;
    return savedSortMode === "added_asc" ? delta : -delta;
  });
}

function readLegacyStoredHandles(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") {
      return [];
    }

    const raw = storage.getItem(LEGACY_HANDLE_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function readLegacyStoredWatchedVideos(): Record<string, boolean> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") {
      return {};
    }

    const raw = storage.getItem(LEGACY_WATCHED_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === "boolean"
      )
    );
  } catch {
    return {};
  }
}

function readLegacyStoredPlaybackRate(): number {
  if (typeof window === "undefined") {
    return 1.5;
  }

  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") {
      return 1.5;
    }

    const raw = storage.getItem(LEGACY_PLAYBACK_RATE_STORAGE_KEY);
    if (!raw) {
      return 1.5;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1.5;
  } catch {
    return 1.5;
  }
}

function sanitizeWatchedVideos(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(raw).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean"
    )
  );
}

function isVideoWindowFilter(value: unknown): value is VideoWindowFilter {
  return (
    value === "all" ||
    value === "older_7" ||
    value === "older_30" ||
    value === "older_60" ||
    typeof value === "number" &&
      [...CHANNEL_VIDEO_WINDOW_OPTIONS, ...SAVED_VIDEO_WINDOW_OPTIONS]
        .filter((item): item is VideoWindowDays => typeof item === "number")
        .includes(value as VideoWindowDays)
  );
}

function normalizeVideoWindowFilterForKind(
  kind: BoardKind,
  value: unknown
): VideoWindowFilter {
  if (!isVideoWindowFilter(value)) {
    return kind === "saved" ? "all" : DEFAULT_VIDEO_WINDOW_DAYS;
  }
  const allowed = kind === "saved" ? SAVED_VIDEO_WINDOW_OPTIONS : CHANNEL_VIDEO_WINDOW_OPTIONS;
  return allowed.includes(value) ? value : kind === "saved" ? "all" : DEFAULT_VIDEO_WINDOW_DAYS;
}

function sanitizeNumericMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(raw).filter(
      (entry): entry is [string, number] =>
        typeof entry[0] === "string" &&
        typeof entry[1] === "number" &&
        Number.isFinite(entry[1])
    )
  );
}

function sanitizePersistedColumn(raw: unknown): PersistedColumnState | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as {
    id?: unknown;
    handleInput?: unknown;
    currentHandle?: unknown;
    channelId?: unknown;
    uploadsPlaylistId?: unknown;
    channelThumbnailUrl?: unknown;
    videos?: unknown;
    lastFetchAt?: unknown;
    savedSortMode?: unknown;
    savedAddedAtByVideoId?: unknown;
    savedManualOrder?: unknown;
  };

  if (
    !(typeof candidate.id === "string" || typeof candidate.id === "undefined") ||
    typeof candidate.handleInput !== "string" ||
    typeof candidate.currentHandle !== "string" ||
    !(
      typeof candidate.channelId === "string" || typeof candidate.channelId === "undefined"
    ) ||
    !(
      typeof candidate.uploadsPlaylistId === "string" ||
      typeof candidate.uploadsPlaylistId === "undefined"
    ) ||
    typeof candidate.channelThumbnailUrl !== "string" ||
    !(typeof candidate.lastFetchAt === "string" || candidate.lastFetchAt === null) ||
    !Array.isArray(candidate.videos)
  ) {
    return null;
  }

  const videos = candidate.videos
    .map((video): VideoItem | null => {
      if (!video || typeof video !== "object") {
        return null;
      }

      const item = video as Record<string, unknown>;
      if (
        typeof item.videoId !== "string" ||
        typeof item.title !== "string" ||
        typeof item.publishedAt !== "string" ||
        !(
          typeof item.durationSeconds === "number" ||
          item.durationSeconds === null ||
          typeof item.durationSeconds === "undefined"
        ) ||
        typeof item.thumbnailUrl !== "string" ||
        typeof item.channelTitle !== "string" ||
        typeof item.videoUrl !== "string" ||
        !(
          typeof item.viewCount === "number" ||
          item.viewCount === null ||
          typeof item.viewCount === "undefined"
        )
      ) {
        return null;
      }

      return {
        videoId: item.videoId,
        title: item.title,
        publishedAt: item.publishedAt,
        durationSeconds:
          typeof item.durationSeconds === "number" && Number.isFinite(item.durationSeconds)
            ? item.durationSeconds
            : null,
        thumbnailUrl: item.thumbnailUrl,
        channelTitle: item.channelTitle,
        videoUrl: item.videoUrl,
        viewCount:
          typeof item.viewCount === "number" && Number.isFinite(item.viewCount)
            ? item.viewCount
            : null
      };
    })
    .filter((video): video is VideoItem => video !== null);

  const savedSortMode: SavedSortMode =
    candidate.savedSortMode === "time_asc" ||
    candidate.savedSortMode === "time_desc" ||
    candidate.savedSortMode === "added_asc" ||
    candidate.savedSortMode === "added_desc" ||
    candidate.savedSortMode === "manual"
      ? candidate.savedSortMode
      : DEFAULT_SAVED_SORT_MODE;

  const rawAddedMap =
    candidate.savedAddedAtByVideoId &&
    typeof candidate.savedAddedAtByVideoId === "object" &&
    !Array.isArray(candidate.savedAddedAtByVideoId)
      ? Object.fromEntries(
          Object.entries(candidate.savedAddedAtByVideoId).filter(
            (entry): entry is [string, number] =>
              typeof entry[0] === "string" &&
              typeof entry[1] === "number" &&
              Number.isFinite(entry[1])
          )
        )
      : undefined;
  const rawManualOrder = Array.isArray(candidate.savedManualOrder)
    ? candidate.savedManualOrder.filter((item): item is string => typeof item === "string")
    : undefined;
  const normalizedSavedOrderData = normalizeSavedColumnOrderData(
    videos,
    rawAddedMap,
    rawManualOrder
  );

  return {
    id: candidate.id ?? createColumnId(),
    handleInput: candidate.handleInput,
    currentHandle: candidate.currentHandle,
    channelId: candidate.channelId ?? "",
    uploadsPlaylistId: candidate.uploadsPlaylistId ?? "",
    channelThumbnailUrl: candidate.channelThumbnailUrl,
    videos,
    lastFetchAt: candidate.lastFetchAt,
    savedSortMode,
    savedAddedAtByVideoId: normalizedSavedOrderData.savedAddedAtByVideoId,
    savedManualOrder: normalizedSavedOrderData.savedManualOrder
  };
}

function sanitizeBackupPayload(raw: unknown): BackupPayload | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as {
    version?: unknown;
    exportedAt?: unknown;
    boards?: unknown;
    activeBoardId?: unknown;
    columns?: unknown;
    watchedVideos?: unknown;
    videoFilter?: unknown;
    videoDurationFilter?: unknown;
    videoWindowDays?: unknown;
    defaultPlaybackRate?: unknown;
  };

  if (
    candidate.version === 2 &&
    typeof candidate.exportedAt === "string" &&
    Array.isArray(candidate.boards)
  ) {
    const boards = candidate.boards
      .map((item) => sanitizePersistedBoard(item))
      .filter((item): item is PersistedBoardState => item !== null);
    if (boards.length === 0) {
      return null;
    }
    const activeBoardId =
      typeof candidate.activeBoardId === "string" &&
      boards.some((board) => board.id === candidate.activeBoardId)
        ? candidate.activeBoardId
        : boards[0].id;
    return {
      version: 2,
      exportedAt: candidate.exportedAt,
      boards,
      activeBoardId
    };
  }

  if (
    candidate.version === 1 &&
    typeof candidate.exportedAt === "string" &&
    Array.isArray(candidate.columns)
  ) {
    const columns = candidate.columns
      .map((item) => sanitizePersistedColumn(item))
      .filter((item): item is PersistedColumnState => item !== null);
    const board: PersistedBoardState = {
      id: createBoardId(),
      name: "BOARD 1",
      kind: "channels",
      columns,
      columnScopeFilter: [COLUMN_SCOPE_ALL],
      watchedVideos: sanitizeWatchedVideos(candidate.watchedVideos),
      viewCountRefreshedAtByVideoId: {},
      videoFilter:
        candidate.videoFilter === "all" ||
        candidate.videoFilter === "new" ||
        candidate.videoFilter === "watched"
          ? candidate.videoFilter
          : "new",
      videoDurationFilter:
        normalizeVideoDurationFilter(candidate.videoDurationFilter),
      videoWindowDays: normalizeVideoWindowFilterForKind(
        "channels",
        candidate.videoWindowDays
      ),
      defaultPlaybackRate:
        typeof candidate.defaultPlaybackRate === "number" &&
        Number.isFinite(candidate.defaultPlaybackRate) &&
        candidate.defaultPlaybackRate > 0
          ? candidate.defaultPlaybackRate
          : 1.5
    };
    return {
      version: 2,
      exportedAt: candidate.exportedAt,
      boards: [board],
      activeBoardId: board.id
    };
  }

  return null;
}

function readLegacyStoredColumns(): PersistedColumnState[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") {
      return [];
    }

    const raw = storage.getItem(LEGACY_COLUMNS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => sanitizePersistedColumn(item))
      .filter((item): item is PersistedColumnState => item !== null);
  } catch {
    return [];
  }
}

function hasLegacyStoredColumnsState(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") {
      return false;
    }
    return storage.getItem(LEGACY_COLUMNS_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

function createBoardState(
  name: string,
  overrides?: Partial<BoardState>,
  initialColumnCount = DEFAULT_COLUMN_COUNT
): BoardState {
  return {
    id: createBoardId(),
    name,
    kind: "channels",
    columns: Array.from({ length: initialColumnCount }, () => createColumnState()),
    columnScopeFilter: [COLUMN_SCOPE_ALL],
    watchedVideos: {},
    viewCountRefreshedAtByVideoId: {},
    videoFilter: "new",
    videoDurationFilter: ["all"],
    videoWindowDays: DEFAULT_VIDEO_WINDOW_DAYS,
    defaultPlaybackRate: 1.5,
    ...overrides
  };
}

function createSavedBoardState(overrides?: Partial<BoardState>): BoardState {
  return createBoardState(SAVED_BOARD_NAME, {
    id: SAVED_BOARD_ID,
    kind: "saved",
    videoFilter: "all",
    videoDurationFilter: ["all"],
    videoWindowDays: "all",
    ...overrides
  }, 1);
}

function getNextSavedListName(columns: ColumnState[]): string {
  let index = 1;
  const used = new Set(
    columns
      .map((column) => column.handleInput.trim().toUpperCase())
      .filter((name) => /^LIST \d+$/.test(name))
  );
  while (used.has(`LIST ${index}`)) {
    index += 1;
  }
  return `LIST ${index}`;
}

function createSavedListColumn(existing: ColumnState[]): ColumnState {
  return createColumnState({ handleInput: getNextSavedListName(existing) });
}

function normalizeSavedBoard(board: BoardState): BoardState {
  const withColumns = board.columns.length > 0
    ? board.columns
    : [createSavedListColumn([])];
  const namedColumns = withColumns.map((column, index) => {
    const normalizedOrderData = normalizeSavedColumnOrderData(
      column.videos,
      column.savedAddedAtByVideoId,
      column.savedManualOrder
    );
    const normalizedColumn: ColumnState = {
      ...column,
      savedSortMode: column.savedSortMode ?? DEFAULT_SAVED_SORT_MODE,
      savedAddedAtByVideoId: normalizedOrderData.savedAddedAtByVideoId,
      savedManualOrder: normalizedOrderData.savedManualOrder
    };
    if (column.handleInput.trim().length > 0) {
      return normalizedColumn;
    }
    return {
      ...normalizedColumn,
      handleInput: `LIST ${index + 1}`
    };
  });
  return {
    ...board,
    id: SAVED_BOARD_ID,
    name: SAVED_BOARD_NAME,
    kind: "saved",
    columns: namedColumns
  };
}

function ensureSavedBoard(boards: BoardState[]): BoardState[] {
  const saved = boards.find((board) => board.kind === "saved");
  if (saved) {
    return boards.map((board) =>
      board.id === saved.id ? normalizeSavedBoard(board) : board
    );
  }
  return [...boards, normalizeSavedBoard(createSavedBoardState())];
}

function getNextBoardName(boards: BoardState[]): string {
  let index = 1;
  while (boards.some((board) => board.name === `BOARD ${index}`)) {
    index += 1;
  }
  return `BOARD ${index}`;
}

function toPersistedColumns(columns: ColumnState[]): PersistedColumnState[] {
  return columns.map((column) => ({
    id: column.id,
    handleInput: column.handleInput,
    currentHandle: column.currentHandle,
    channelId: column.channelId,
    uploadsPlaylistId: column.uploadsPlaylistId,
    channelThumbnailUrl: column.channelThumbnailUrl,
    videos: column.videos,
    lastFetchAt: column.lastFetchAt,
    savedSortMode: column.savedSortMode,
    savedAddedAtByVideoId: column.savedAddedAtByVideoId,
    savedManualOrder: column.savedManualOrder
  }));
}

function sanitizePersistedBoard(raw: unknown): PersistedBoardState | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as {
    id?: unknown;
    name?: unknown;
    kind?: unknown;
    columns?: unknown;
    columnScopeFilter?: unknown;
    watchedVideos?: unknown;
    viewCountRefreshedAtByVideoId?: unknown;
    videoFilter?: unknown;
    videoDurationFilter?: unknown;
    videoWindowDays?: unknown;
    defaultPlaybackRate?: unknown;
  };

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    !Array.isArray(candidate.columns)
  ) {
    return null;
  }

  const columns = candidate.columns
    .map((item) => sanitizePersistedColumn(item))
    .filter((item): item is PersistedColumnState => item !== null);
  const kind: BoardKind = candidate.kind === "saved" ? "saved" : "channels";

  return {
    id: candidate.id,
    name: candidate.name,
    kind,
    columns,
    columnScopeFilter:
      typeof candidate.columnScopeFilter === "string" ||
      Array.isArray(candidate.columnScopeFilter)
        ? candidate.columnScopeFilter
        : [COLUMN_SCOPE_ALL],
    watchedVideos: sanitizeWatchedVideos(candidate.watchedVideos),
    viewCountRefreshedAtByVideoId: sanitizeNumericMap(
      candidate.viewCountRefreshedAtByVideoId
    ),
    videoFilter:
      candidate.videoFilter === "all" ||
      candidate.videoFilter === "new" ||
      candidate.videoFilter === "watched"
        ? candidate.videoFilter
        : "new",
    videoDurationFilter:
      normalizeVideoDurationFilter(candidate.videoDurationFilter),
    videoWindowDays: normalizeVideoWindowFilterForKind(kind, candidate.videoWindowDays),
    defaultPlaybackRate:
      typeof candidate.defaultPlaybackRate === "number" &&
      Number.isFinite(candidate.defaultPlaybackRate) &&
      candidate.defaultPlaybackRate > 0
        ? candidate.defaultPlaybackRate
        : 1.5
  };
}

function fromPersistedBoard(board: PersistedBoardState): BoardState {
  const restoredColumns = board.columns.map((column) =>
    createColumnState({
      id: column.id,
      handleInput: column.handleInput,
      currentHandle: column.currentHandle,
      channelId: column.channelId ?? "",
      uploadsPlaylistId: column.uploadsPlaylistId ?? "",
      channelThumbnailUrl: column.channelThumbnailUrl,
      videos: column.videos,
      lastFetchAt: column.lastFetchAt,
      savedSortMode: column.savedSortMode ?? DEFAULT_SAVED_SORT_MODE,
      savedAddedAtByVideoId: column.savedAddedAtByVideoId ?? {},
      savedManualOrder: column.savedManualOrder ?? []
    })
  );

  return createBoardState(board.name, {
    id: board.id,
    kind: board.kind === "saved" ? "saved" : "channels",
    columns: restoredColumns,
    columnScopeFilter: normalizeColumnScopeFilter(board.columnScopeFilter, restoredColumns),
    watchedVideos: board.watchedVideos,
    viewCountRefreshedAtByVideoId: board.viewCountRefreshedAtByVideoId,
    videoFilter: board.videoFilter,
    videoDurationFilter: normalizeVideoDurationFilter(board.videoDurationFilter),
    videoWindowDays: board.videoWindowDays,
    defaultPlaybackRate: board.defaultPlaybackRate
  });
}

function readStoredBoards(): BoardState[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") {
      return [];
    }

    const raw = storage.getItem(BOARDS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const boards = parsed
      .map((item) => sanitizePersistedBoard(item))
      .filter((item): item is PersistedBoardState => item !== null)
      .map((board) => fromPersistedBoard(board));
    return ensureSavedBoard(boards);
  } catch {
    return [];
  }
}

function readStoredActiveBoardId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") {
      return null;
    }
    const raw = storage.getItem(ACTIVE_BOARD_ID_STORAGE_KEY);
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function getInitialBoardsState(): { boards: BoardState[]; activeBoardId: string } {
  const storedBoards = readStoredBoards();
  if (storedBoards.length > 0) {
    const storedActiveBoardId = readStoredActiveBoardId();
    const activeBoardId =
      storedActiveBoardId &&
      storedBoards.some((board) => board.id === storedActiveBoardId)
        ? storedActiveBoardId
        : storedBoards[0].id;
    return { boards: storedBoards, activeBoardId };
  }

  const legacyColumns = readLegacyStoredColumns();
  const legacyColumnsExists = hasLegacyStoredColumnsState();
  const legacyHandles = readLegacyStoredHandles();
  const legacyWatchedVideos = readLegacyStoredWatchedVideos();
  const legacyPlaybackRate = readLegacyStoredPlaybackRate();
  const resolvedCount = legacyColumnsExists
    ? legacyColumns.length
    : Math.max(1, legacyHandles.length);

  const board = createBoardState("BOARD 1", {
    columns: Array.from({ length: resolvedCount }, (_, index) =>
      createColumnState({
        id: legacyColumns[index]?.id ?? createColumnId(),
        handleInput: legacyColumns[index]?.handleInput ?? legacyHandles[index] ?? "",
        currentHandle: legacyColumns[index]?.currentHandle ?? "",
        channelId: legacyColumns[index]?.channelId ?? "",
        uploadsPlaylistId: legacyColumns[index]?.uploadsPlaylistId ?? "",
        channelThumbnailUrl: legacyColumns[index]?.channelThumbnailUrl ?? "",
        videos: legacyColumns[index]?.videos ?? [],
        lastFetchAt: legacyColumns[index]?.lastFetchAt ?? null,
        savedSortMode: legacyColumns[index]?.savedSortMode ?? DEFAULT_SAVED_SORT_MODE,
        savedAddedAtByVideoId: legacyColumns[index]?.savedAddedAtByVideoId ?? {},
        savedManualOrder: legacyColumns[index]?.savedManualOrder ?? []
      })
    ),
    watchedVideos: legacyWatchedVideos,
    videoFilter: "new",
    videoDurationFilter: ["all"],
    videoWindowDays: DEFAULT_VIDEO_WINDOW_DAYS,
    defaultPlaybackRate: legacyPlaybackRate
  });

  return { boards: ensureSavedBoard([board]), activeBoardId: board.id };
}

function formatViewCount(viewCount: number | null): string {
  if (viewCount === null) {
    return "-";
  }
  const compact = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 0
  }).format(viewCount);
  return compact.toLowerCase();
}

function formatPublishedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--.--";
  }

  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

function parseStoredLastFetchAt(value: string): number | null {
  const direct = Date.parse(value);
  if (Number.isFinite(direct)) {
    return direct;
  }
  const match = value.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match) {
    return null;
  }
  const [, dayRaw, monthRaw, yearRaw, hourRaw, minuteRaw, secondRaw] = match;
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw ?? "0");
  const parsed = new Date(year, month - 1, day, hour, minute, second).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function formatLastFetchTooltipLabel(timestamp: number | null): string {
  if (timestamp === null) {
    return "-";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${dd}.${mm} ${hh}:${min}`;
}

function formatDuration(durationSeconds: number | null | undefined): string {
  if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds)) {
    return "--:--";
  }
  const totalSeconds = Math.max(0, Math.floor(durationSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function matchesDurationFilter(
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

function normalizeVideoDurationFilter(input: unknown): VideoDurationFilter {
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

function normalizeColumnScopeFilter(
  input: unknown,
  columns: ColumnState[]
): string[] {
  const validValues = new Set<string>([
    COLUMN_SCOPE_ALL,
    COLUMN_SCOPE_NOT_EMPTY,
    ...columns.map((column) => column.id)
  ]);
  const raw = Array.isArray(input) ? input : [input];
  const next = [
    ...new Set(
      raw.filter((value): value is string => typeof value === "string" && validValues.has(value))
    )
  ];
  if (next.length === 0 || next.includes(COLUMN_SCOPE_ALL)) {
    return [COLUMN_SCOPE_ALL];
  }
  if (next.includes(COLUMN_SCOPE_NOT_EMPTY)) {
    return [COLUMN_SCOPE_NOT_EMPTY];
  }
  return next;
}

function resolveColumnScopeFilterSelection(
  nextInput: unknown,
  previous: string[],
  columns: ColumnState[]
): string[] {
  const previousNormalized = normalizeColumnScopeFilter(previous, columns);
  const raw = Array.isArray(nextInput) ? nextInput : [nextInput];
  const validValues = new Set<string>([
    COLUMN_SCOPE_ALL,
    COLUMN_SCOPE_NOT_EMPTY,
    ...columns.map((column) => column.id)
  ]);
  const validRaw = [
    ...new Set(
      raw.filter((value): value is string => typeof value === "string" && validValues.has(value))
    )
  ];

  if (validRaw.includes(COLUMN_SCOPE_ALL)) {
    if (validRaw.length > 1) {
      return previousNormalized.includes(COLUMN_SCOPE_ALL)
        ? validRaw.filter((value) => value !== COLUMN_SCOPE_ALL)
        : [COLUMN_SCOPE_ALL];
    }
    return [COLUMN_SCOPE_ALL];
  }

  if (validRaw.includes(COLUMN_SCOPE_NOT_EMPTY)) {
    if (validRaw.length > 1) {
      return previousNormalized.includes(COLUMN_SCOPE_NOT_EMPTY)
        ? validRaw.filter((value) => value !== COLUMN_SCOPE_NOT_EMPTY)
        : [COLUMN_SCOPE_NOT_EMPTY];
    }
    return [COLUMN_SCOPE_NOT_EMPTY];
  }

  if (validRaw.length === 0) {
    return [COLUMN_SCOPE_ALL];
  }

  return validRaw;
}

function formatColumnScopeSummary(
  values: string[],
  isSavedBoardActive: boolean,
  columns: ColumnState[]
): string {
  const normalized = normalizeColumnScopeFilter(values, columns);
  if (normalized.includes(COLUMN_SCOPE_ALL)) {
    return isSavedBoardActive ? "ALL LISTS" : "ALL CHANNELS";
  }
  if (normalized.includes(COLUMN_SCOPE_NOT_EMPTY)) {
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
    const label = isSavedBoardActive
      ? raw
      : raw.startsWith("@")
      ? raw
      : `@${raw}`;
    return label.toUpperCase();
  }
  return `${normalized.length} SELECTED`;
}

function resolveVideoDurationFilterSelection(
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

function formatDurationFilterSummary(filters: VideoDurationFilter): string {
  const normalized = normalizeVideoDurationFilter(filters);
  if (normalized.includes("all")) {
    return "ANY LENGTH";
  }
  if (normalized.length === 1) {
    return getDurationFilterOptionLabel(normalized[0]);
  }
  return "SELECT LENGTH";
}

function collectBoardMissingDurationNewVideoIds(board: BoardState): string[] {
  const unique = new Set<string>();
  board.columns.forEach((column) => {
    column.videos.forEach((video) => {
      const isWatched = board.watchedVideos[video.videoId] === true;
      const hasDuration = typeof video.durationSeconds === "number";
      if (isWatched || hasDuration) {
        return;
      }
      unique.add(video.videoId);
    });
  });
  return [...unique];
}

function formatVideoMeta(video: VideoItem): string {
  const dateLabel = video.publishedAt ? formatPublishedDate(video.publishedAt) : "--.--";
  return `${dateLabel} | ${formatDuration(video.durationSeconds)} | ${formatViewCount(video.viewCount)}`;
}

function getVideoPublishedTime(video: VideoItem): number {
  const parsed = Date.parse(video.publishedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getWindowCutoffTime(days: VideoWindowFilter, now = Date.now()): number {
  if (days === "all") {
    return 0;
  }
  if (days === "older_7" || days === "older_30" || days === "older_60") {
    return 0;
  }
  return now - days * 24 * 60 * 60 * 1000;
}

function matchesVideoWindowFilter(
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

function shouldIgnoreShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}

function parseBulkHandles(raw: string): string[] {
  const tokens = raw
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const unique = new Set<string>();
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower.includes("youtu.be/") || lower.includes("youtube.com/")) {
      unique.add(token);
      continue;
    }
    if (/^[A-Za-z0-9._-]{3,30}$/.test(token) || token.startsWith("@")) {
      unique.add(token);
    }
  }

  return [...unique];
}

function parseBulkListNames(raw: string): string[] {
  const tokens = raw
    .split(/\n+/)
    .map((token) => token.trim())
    .filter(Boolean);
  return [...new Set(tokens)];
}

function readStoredErrorLogs(): ErrorLogEntry[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") {
      return [];
    }
    const raw = storage.getItem(ERROR_LOGS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(
        (item): item is ErrorLogEntry =>
          item !== null &&
          typeof item === "object" &&
          typeof (item as { id?: unknown }).id === "string" &&
          typeof (item as { time?: unknown }).time === "string" &&
          typeof (item as { board?: unknown }).board === "string" &&
          typeof (item as { column?: unknown }).column === "string" &&
          typeof (item as { action?: unknown }).action === "string" &&
          typeof (item as { message?: unknown }).message === "string"
      )
      .slice(0, 100);
  } catch {
    return [];
  }
}

function getPacificDayKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

function readStoredQuotaEstimate(): QuotaEstimateState {
  const initial: QuotaEstimateState = {
    dayKey: getPacificDayKey(),
    todayUnits: 0,
    lastActionUnits: 0
  };
  if (typeof window === "undefined") {
    return initial;
  }
  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") {
      return initial;
    }
    const raw = storage.getItem(QUOTA_ESTIMATE_STORAGE_KEY);
    if (!raw) {
      return initial;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return initial;
    }
    const candidate = parsed as {
      dayKey?: unknown;
      todayUnits?: unknown;
      lastActionUnits?: unknown;
    };
    const dayKey =
      typeof candidate.dayKey === "string" ? candidate.dayKey : initial.dayKey;
    const todayUnits =
      typeof candidate.todayUnits === "number" && Number.isFinite(candidate.todayUnits)
        ? Math.max(0, Math.floor(candidate.todayUnits))
        : 0;
    const lastActionUnits =
      typeof candidate.lastActionUnits === "number" && Number.isFinite(candidate.lastActionUnits)
        ? Math.max(0, Math.floor(candidate.lastActionUnits))
        : 0;
    if (dayKey !== initial.dayKey) {
      return initial;
    }
    return {
      dayKey,
      todayUnits,
      lastActionUnits
    };
  } catch {
    return initial;
  }
}

function App() {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const videoModalWrapRef = useRef<HTMLDivElement | null>(null);
  const fallbackIframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const playerReadyRef = useRef(false);
  const videoMetaFeedbackTimeoutsRef = useRef<Record<string, number>>({});
  const linkCopyFeedbackTimeoutRef = useRef<number | null>(null);
  const logoSpinTimeoutRef = useRef<number | null>(null);
  const [playerHostNode, setPlayerHostNode] = useState<HTMLDivElement | null>(null);
  const initialBoardsState = getInitialBoardsState();
  const [boards, setBoards] = useState<BoardState[]>(initialBoardsState.boards);
  const [activeBoardId, setActiveBoardId] = useState<string>(
    initialBoardsState.activeBoardId
  );
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isRenameBoardModalOpen, setIsRenameBoardModalOpen] = useState(false);
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [deletingColumnId, setDeletingColumnId] = useState<string | null>(null);
  const [movingColumnId, setMovingColumnId] = useState<string | null>(null);
  const [moveTargetBoardId, setMoveTargetBoardId] = useState<string>("");
  const [savingVideo, setSavingVideo] = useState<VideoItem | null>(null);
  const [saveTargetColumnId, setSaveTargetColumnId] = useState<string>("");
  const [deletingSavedVideo, setDeletingSavedVideo] = useState<{
    columnId: string;
    videoId: string;
  } | null>(null);
  const [movingSavedVideo, setMovingSavedVideo] = useState<{
    columnId: string;
    videoId: string;
  } | null>(null);
  const [removeAllSavedColumnAction, setRemoveAllSavedColumnAction] =
    useState<RemoveAllSavedColumnAction | null>(null);
  const [boardDurationBackfillAction, setBoardDurationBackfillAction] =
    useState<BoardDurationBackfillAction | null>(null);
  const [isBoardDurationBackfillRunning, setIsBoardDurationBackfillRunning] =
    useState(false);
  const [boardDurationBackfillError, setBoardDurationBackfillError] = useState<string | null>(
    null
  );
  const [bulkWatchColumnAction, setBulkWatchColumnAction] =
    useState<BulkWatchColumnAction | null>(null);
  const [moveSavedVideoTargetColumnId, setMoveSavedVideoTargetColumnId] =
    useState<string>("");
  const [editingSavedListColumnId, setEditingSavedListColumnId] = useState<string | null>(
    null
  );
  const [editingChannelColumnId, setEditingChannelColumnId] = useState<string | null>(
    null
  );
  const [savedListNameInput, setSavedListNameInput] = useState("");
  const [channelNameInput, setChannelNameInput] = useState("");
  const [renameBoardInput, setRenameBoardInput] = useState("");
  const [isDeleteBoardModalOpen, setIsDeleteBoardModalOpen] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [isLogoSpinning, setIsLogoSpinning] = useState(false);
  const [errorLogs, setErrorLogs] = useState<ErrorLogEntry[]>(readStoredErrorLogs);
  const [quotaEstimate, setQuotaEstimate] = useState<QuotaEstimateState>(readStoredQuotaEstimate);
  const [videoStatsBackfillInFlight, setVideoStatsBackfillInFlight] = useState<string[]>(
    []
  );
  const [videoMetaFeedbackById, setVideoMetaFeedbackById] = useState<
    Record<string, InlineMetaFeedback>
  >({});
  const [copiedLinkVideoId, setCopiedLinkVideoId] = useState<string | null>(null);
  const [bulkInput, setBulkInput] = useState("");
  const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null);
  const [playlistQueue, setPlaylistQueue] = useState<VideoItem[]>([]);
  const [playlistIndex, setPlaylistIndex] = useState<number>(-1);
  const [playlistScope, setPlaylistScope] = useState<PlaylistScope>("all");
  const [playlistChannelLabel, setPlaylistChannelLabel] = useState<string>("");
  const [playlistOrderLabel, setPlaylistOrderLabel] = useState<string>("NEWEST FIRST");
  const [playbackRate, setPlaybackRate] = useState<number>(1.5);
  const [availablePlaybackRates, setAvailablePlaybackRates] = useState<number[]>(
    [...PLAYBACK_RATE_OPTIONS]
  );
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [useIframeFallback, setUseIframeFallback] = useState(false);
  const [brokenChannelThumbnailKeys, setBrokenChannelThumbnailKeys] = useState<string[]>(
    []
  );
  const [pendingBulkFetch, setPendingBulkFetch] = useState<
    Array<{ boardId: string; id: string; handle: string }>
  >([]);
  const activeBoard =
    boards.find((board) => board.id === activeBoardId) ?? boards[0] ?? null;
  const displayedBoards = [
    ...boards.filter((board) => board.kind !== "saved"),
    ...boards.filter((board) => board.kind === "saved")
  ];
  const savedBoard = boards.find((board) => board.kind === "saved") ?? null;
  const isSavedBoardActive = activeBoard?.kind === "saved";
  const savedBoardColumns = savedBoard?.columns ?? [];
  const editingBoard =
    (editingBoardId
      ? boards.find((board) => board.id === editingBoardId)
      : undefined) ?? activeBoard;
  const columns = activeBoard?.columns ?? [];
  const deletingColumn =
    (deletingColumnId
      ? columns.find((column) => column.id === deletingColumnId)
      : undefined) ?? null;
  const movingColumn =
    (movingColumnId
      ? columns.find((column) => column.id === movingColumnId)
      : undefined) ?? null;
  const moveDestinationBoards = boards.filter(
    (board) =>
      board.id !== activeBoardId &&
      board.kind === "channels" &&
      activeBoard?.kind === "channels"
  );
  const saveDestinationColumns = savedBoardColumns;
  const moveSavedVideoDestinationColumns =
    movingSavedVideo && savedBoard
      ? savedBoard.columns.filter((column) => column.id !== movingSavedVideo.columnId)
      : [];
  const deletingSavedVideoListName =
    deletingSavedVideo && savedBoard
      ? savedBoard.columns.find((column) => column.id === deletingSavedVideo.columnId)
          ?.handleInput ?? ""
      : "";
  const deletingChannelNameRaw =
    deletingColumn?.handleInput.trim() || deletingColumn?.currentHandle.trim() || "";
  const deletingChannelName = deletingChannelNameRaw
    ? deletingChannelNameRaw.startsWith("@")
      ? deletingChannelNameRaw
      : `@${deletingChannelNameRaw}`
    : "";
  const deletingChannelNameDisplay = deletingChannelName.toUpperCase();
  const movingChannelNameRaw =
    movingColumn?.handleInput.trim() || movingColumn?.currentHandle.trim() || "";
  const movingChannelName = movingChannelNameRaw
    ? movingChannelNameRaw.startsWith("@")
      ? movingChannelNameRaw
      : `@${movingChannelNameRaw}`
    : "";
  const movingChannelNameDisplay = movingChannelName.toUpperCase();
  const watchedVideos = activeBoard?.watchedVideos ?? {};
  const videoDurationFilter = normalizeVideoDurationFilter(
    activeBoard?.videoDurationFilter
  );
  const boardDropdownListHeight = Math.max(
    BOARD_DROPDOWN_ITEM_HEIGHT + BOARD_DROPDOWN_PADDING,
    Math.min(displayedBoards.length + 1, BOARD_DROPDOWN_MAX_VISIBLE) *
      BOARD_DROPDOWN_ITEM_HEIGHT +
      BOARD_DROPDOWN_PADDING
  );
  const isPlaylistActive =
    playlistIndex >= 0 &&
    playlistQueue.length > 0 &&
    playlistIndex < playlistQueue.length;
  const videoFilter = activeBoard?.videoFilter ?? "new";
  const videoWindowDays = activeBoard
    ? normalizeVideoWindowFilterForKind(activeBoard.kind, activeBoard.videoWindowDays)
    : DEFAULT_VIDEO_WINDOW_DAYS;
  const preferredPlaybackRate = activeBoard?.defaultPlaybackRate ?? 1.5;
  const columnScopeFilter = normalizeColumnScopeFilter(
    activeBoard?.columnScopeFilter ?? [COLUMN_SCOPE_ALL],
    columns
  );
  const quotaEstimateText = `LAST Q: ${quotaEstimate.lastActionUnits} | TODAY: ${quotaEstimate.todayUnits}`;
  const topbarLastFetchLabel = activeBoard
    ? formatLastFetchTooltipLabel(
        activeBoard.columns.reduce<number | null>((latest, column) => {
          if (!column.lastFetchAt) {
            return latest;
          }
          const parsed = parseStoredLastFetchAt(column.lastFetchAt);
          if (parsed === null) {
            return latest;
          }
          if (latest === null || parsed > latest) {
            return parsed;
          }
          return latest;
        }, null)
      )
    : "-";
  const shownVideoCountByColumnId = new Map<string, number>();
  const getShownVideosForColumn = (column: ColumnState, now: number): VideoItem[] => {
    if (!activeBoard) {
      return [];
    }
    const sourceVideos =
      activeBoard.kind === "saved" ? sortSavedVideosByMode(column) : column.videos;
    return sourceVideos.filter((video) => {
      if (!matchesVideoWindowFilter(getVideoPublishedTime(video), videoWindowDays, now)) {
        return false;
      }
      if (!matchesDurationFilter(video.durationSeconds, videoDurationFilter)) {
        return false;
      }
      const isWatched = watchedVideos[video.videoId] === true;
      if (videoFilter === "all") {
        return true;
      }
      if (videoFilter === "watched") {
        return isWatched;
      }
      return !isWatched;
    });
  };
  if (activeBoard) {
    const now = Date.now();
    columns.forEach((column) => {
      const shownCount = getShownVideosForColumn(column, now).length;
      shownVideoCountByColumnId.set(column.id, shownCount);
    });
  }
  const scopedColumns =
    columnScopeFilter.includes(COLUMN_SCOPE_ALL)
      ? columns
      : columnScopeFilter.includes(COLUMN_SCOPE_NOT_EMPTY)
      ? columns.filter((column) => (shownVideoCountByColumnId.get(column.id) ?? 0) > 0)
      : columns.filter((column) => columnScopeFilter.includes(column.id));
  const visibleColumns = scopedColumns;
  const shownVideosTotal = visibleColumns.reduce(
    (total, column) => total + (shownVideoCountByColumnId.get(column.id) ?? 0),
    0
  );
  const visibleColumnIdSet = new Set(visibleColumns.map((column) => column.id));
  const hiddenColumns = isSavedBoardActive
    ? []
    : columns.filter((column) => !visibleColumnIdSet.has(column.id));
  const columnScopeOptions = [
    {
      value: COLUMN_SCOPE_ALL,
      label: isSavedBoardActive ? "ALL LISTS" : "ALL CHANNELS"
    },
    {
      value: COLUMN_SCOPE_NOT_EMPTY,
      label: "ACTIVE CHANNELS"
    },
    ...columns.map((column, index) => {
      const raw = column.currentHandle.trim() || column.handleInput.trim();
      const normalized = raw
        ? raw.startsWith("@")
          ? raw
          : isSavedBoardActive
          ? raw
          : `@${raw}`
        : isSavedBoardActive
        ? `LIST ${index + 1}`
        : `CHANNEL ${index + 1}`;
      return {
        value: column.id,
        label: normalized.toUpperCase()
      };
    })
  ];
  const channelScopeDropdownListHeight =
    Math.min(columnScopeOptions.length, CHANNEL_SCOPE_DROPDOWN_MAX_VISIBLE) *
      BOARD_DROPDOWN_ITEM_HEIGHT +
    BOARD_DROPDOWN_PADDING;
  const activeBoardDurationBackfillIds = activeBoard
    ? collectBoardMissingDurationNewVideoIds(activeBoard)
    : [];
  const activeBoardDurationBackfillEstimatedQueries = Math.ceil(
    activeBoardDurationBackfillIds.length / 50
  );

  const focusBulkModalInput = (): void => {
    const focusNow = () => {
      const textarea = document.querySelector<HTMLTextAreaElement>(
        ".add-channels-modal textarea"
      );
      textarea?.focus();
      textarea?.select();
    };
    requestAnimationFrame(focusNow);
    window.setTimeout(focusNow, 120);
  };

  useEffect(() => {
    setBoards((previous) => ensureSavedBoard(previous));
  }, []);

  useEffect(() => {
    if (boards.length === 0) {
      return;
    }
    if (!boards.some((board) => board.id === activeBoardId)) {
      setActiveBoardId(boards[0].id);
    }
  }, [activeBoardId, boards]);

  useEffect(() => {
    setPlaybackRate(preferredPlaybackRate);
  }, [preferredPlaybackRate]);

  useEffect(() => {
    if (!isBulkModalOpen) {
      return;
    }
    focusBulkModalInput();
  }, [isBulkModalOpen]);

  useEffect(() => {
    if (!editingChannelColumnId) {
      return;
    }
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(
        ".ant-modal input[placeholder='@channel']"
      );
      input?.focus();
      input?.select();
    });
  }, [editingChannelColumnId]);

  useEffect(() => {
    return () => {
      Object.values(videoMetaFeedbackTimeoutsRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      videoMetaFeedbackTimeoutsRef.current = {};
      if (linkCopyFeedbackTimeoutRef.current) {
        window.clearTimeout(linkCopyFeedbackTimeoutRef.current);
      }
      if (logoSpinTimeoutRef.current) {
        window.clearTimeout(logoSpinTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const storage = window.localStorage;
      storage.setItem(QUOTA_ESTIMATE_STORAGE_KEY, JSON.stringify(quotaEstimate));
    } catch {
      // Ignore local storage write errors.
    }
  }, [quotaEstimate]);

  useEffect(() => {
    const cutoffTime = getWindowCutoffTime(STORAGE_VIDEO_WINDOW_DAYS);
    setBoards((previous) => {
      let changed = false;
      const next = previous.map((board) => {
        if (board.kind === "saved") {
          return board;
        }
        let boardChanged = false;
        const nextColumns = board.columns.map((column) => {
          const nextVideos = column.videos.filter(
            (video) => getVideoPublishedTime(video) >= cutoffTime
          );
          if (nextVideos.length === column.videos.length) {
            return column;
          }
          boardChanged = true;
          changed = true;
          return {
            ...column,
            videos: nextVideos
          };
        });
        if (!boardChanged) {
          return board;
        }
        return {
          ...board,
          columns: nextColumns
        };
      });
      return changed ? next : previous;
    });
  }, []);

  useEffect(() => {
    try {
      const storage = window.localStorage;
      if (!storage || typeof storage.setItem !== "function") {
        return;
      }

      const persistedBoards: PersistedBoardState[] = boards.map((board) => ({
        id: board.id,
        name: board.name,
        kind: board.kind,
        columns: toPersistedColumns(board.columns),
        columnScopeFilter: board.columnScopeFilter,
        watchedVideos: board.watchedVideos,
        viewCountRefreshedAtByVideoId: board.viewCountRefreshedAtByVideoId,
        videoFilter: board.videoFilter,
        videoDurationFilter: board.videoDurationFilter,
        videoWindowDays: board.videoWindowDays,
        defaultPlaybackRate: board.defaultPlaybackRate
      }));
      storage.setItem(BOARDS_STORAGE_KEY, JSON.stringify(persistedBoards));
      storage.setItem(ACTIVE_BOARD_ID_STORAGE_KEY, activeBoardId);
    } catch {
      // Ignore write failures (private mode / restricted environments).
    }
  }, [activeBoardId, boards]);

  useEffect(() => {
    try {
      const storage = window.localStorage;
      if (!storage || typeof storage.setItem !== "function") {
        return;
      }
      storage.setItem(ERROR_LOGS_STORAGE_KEY, JSON.stringify(errorLogs.slice(0, 100)));
    } catch {
      // Ignore write failures.
    }
  }, [errorLogs]);

  useEffect(() => {
    if (pendingBulkFetch.length === 0) {
      return;
    }

    pendingBulkFetch.forEach((target) => {
      runFetch(target.boardId, target.id, target.handle);
    });
    setPendingBulkFetch([]);
  }, [pendingBulkFetch]);

  useEffect(() => {
    if (!activeVideo || !playerHostNode) {
      return;
    }

    let isCancelled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    setAvailablePlaybackRates([...PLAYBACK_RATE_OPTIONS]);
    setPlaybackRate(preferredPlaybackRate);
    setIsPlayerReady(false);
    playerReadyRef.current = false;
    setUseIframeFallback(false);
    fallbackTimer = setTimeout(() => {
      if (!isCancelled && !playerReadyRef.current) {
        setUseIframeFallback(true);
      }
    }, 800);

    loadYouTubeIframeApi()
      .then(() => {
        if (isCancelled || !playerHostNode || !window.YT?.Player) {
          return;
        }

        if (playerRef.current) {
          playerRef.current.destroy();
          playerRef.current = null;
        }

        playerRef.current = new window.YT.Player(playerHostNode, {
          videoId: activeVideo.videoId,
          playerVars: {
            autoplay: 1,
            rel: 0
          },
          events: {
            onReady: (event) => {
              const rates = event.target.getAvailablePlaybackRates();
              const filteredRates = rates.filter((rate) =>
                PLAYBACK_RATE_OPTIONS.includes(rate as (typeof PLAYBACK_RATE_OPTIONS)[number])
              );
              const normalizedRates =
                filteredRates.length > 0 ? filteredRates : [...PLAYBACK_RATE_OPTIONS];
              setAvailablePlaybackRates(normalizedRates);
              const preferred = normalizedRates.includes(preferredPlaybackRate)
                ? preferredPlaybackRate
                : normalizedRates.includes(1)
                ? 1
                : normalizedRates[0];
              event.target.setPlaybackRate(preferred);
              setPlaybackRate(preferred);
              setIsPlayerReady(true);
              playerReadyRef.current = true;
              setUseIframeFallback(false);
              focusVideoPlayerSurface();
              if (fallbackTimer) {
                clearTimeout(fallbackTimer);
                fallbackTimer = null;
              }
            },
            onStateChange: (event) => {
              if (event.data !== 0 || !activeVideo) {
                return;
              }
              markWatchedAndAdvanceOrClose();
            }
          }
        });
      })
      .catch(() => {
        setAvailablePlaybackRates([1]);
        setPlaybackRate(1);
        playerReadyRef.current = false;
        setUseIframeFallback(true);
      });

    return () => {
      isCancelled = true;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      playerReadyRef.current = false;
    };
  }, [
    activeVideo,
    isPlaylistActive,
    playerHostNode,
    playlistIndex,
    playlistQueue,
    preferredPlaybackRate
  ]);

  useEffect(() => {
    if (!activeVideo) {
      return;
    }
    focusVideoPlayerSurface();
  }, [activeVideo, isPlayerReady, useIframeFallback]);

  useEffect(() => {
    if (!activeVideo) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (shouldIgnoreShortcutTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const isSeekShortcut =
        key === "arrowleft" || key === "arrowright" || key === "j" || key === "l";
      const isSpaceShortcut = event.code === "Space" || key === " ";
      const isFullscreenShortcut = key === "f";
      if (!isSeekShortcut && !isSpaceShortcut && !isFullscreenShortcut) {
        return;
      }

      event.preventDefault();
      if (isSeekShortcut && playerRef.current) {
        const delta = key === "arrowleft" || key === "j" ? -10 : 10;
        try {
          const currentTime = playerRef.current.getCurrentTime();
          const nextTime = Math.max(0, currentTime + delta);
          playerRef.current.seekTo(nextTime, true);
        } catch {
          // Ignore unsupported seeks.
        }
        return;
      }

      if (isSpaceShortcut && playerRef.current) {
        try {
          const currentState = playerRef.current.getPlayerState();
          if (currentState === 1) {
            playerRef.current.pauseVideo();
          } else {
            playerRef.current.playVideo();
          }
        } catch {
          // Ignore unsupported play/pause controls.
        }
        return;
      }

      if (isFullscreenShortcut) {
        const fullscreenTarget =
          videoModalWrapRef.current ?? playerHostRef.current ?? fallbackIframeRef.current;
        if (!fullscreenTarget) {
          return;
        }
        try {
          if (document.fullscreenElement) {
            void document.exitFullscreen();
          } else {
            void fullscreenTarget.requestFullscreen();
          }
        } catch {
          // Ignore unsupported fullscreen requests.
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeVideo]);

  const setPlayerHost = (node: HTMLDivElement | null): void => {
    playerHostRef.current = node;
    setPlayerHostNode(node);
  };

  const focusVideoPlayerSurface = (): void => {
    const focusTarget =
      fallbackIframeRef.current ??
      playerHostRef.current?.querySelector("iframe") ??
      playerHostRef.current;
    if (!focusTarget) {
      return;
    }
    window.setTimeout(() => {
      try {
        focusTarget.focus();
      } catch {
        // Ignore focus failures.
      }
    }, 0);
    window.setTimeout(() => {
      try {
        focusTarget.focus();
      } catch {
        // Ignore focus failures.
      }
    }, 120);
  };

  const setBoard = (
    boardId: string,
    updater: (state: BoardState) => BoardState
  ) => {
    setBoards((previous) =>
      previous.map((board) =>
        board.id === boardId ? updater(board) : board
      )
    );
  };

  const setColumn = (
    boardId: string,
    columnId: string,
    updater: (state: ColumnState) => ColumnState
  ) => {
    setBoard(boardId, (board) => ({
      ...board,
      columns: board.columns.map((column) =>
        column.id === columnId ? updater(column) : column
      )
    }));
  };

  const recordEstimatedQuotaUsage = (units: number): void => {
    const safeUnits = Math.max(0, Math.floor(units));
    setQuotaEstimate((previous) => ({
      dayKey: previous.dayKey === getPacificDayKey() ? previous.dayKey : getPacificDayKey(),
      todayUnits:
        previous.dayKey === getPacificDayKey()
          ? previous.todayUnits + safeUnits
          : safeUnits,
      lastActionUnits: safeUnits
    }));
  };

  const appendFetchErrorLog = (
    boardId: string,
    columnId: string,
    message: string
  ): void => {
    const board = boards.find((item) => item.id === boardId);
    const column = board?.columns.find((item) => item.id === columnId);
    const boardName = (board?.name || "UNKNOWN").toUpperCase();
    const columnName = (
      column?.handleInput.trim() ||
      column?.currentHandle.trim() ||
      "UNKNOWN"
    ).toUpperCase();
    setErrorLogs((previous) => [
      {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        time: new Date().toLocaleString(),
        board: boardName,
        column: columnName,
        action: "FETCH" as const,
        message
      },
      ...previous
    ].slice(0, 100));
  };

  const runFetch = async (
    boardId: string,
    columnId: string,
    handle: string
  ): Promise<void> => {
    const boardState = boards.find((board) => board.id === boardId);
    let estimatedQuotaUnits = 0;
    if (boardState?.kind === "saved") {
      recordEstimatedQuotaUsage(0);
      return;
    }

    setColumn(boardId, columnId, (prev) => ({ ...prev, loading: true, error: null }));

    try {
      let normalized = "";
      let resolvedFromInput: Awaited<
        ReturnType<typeof resolveChannelByInputWithThumbnail>
      > | null = null;
      try {
        normalized = normalizeHandle(handle);
      } catch {
        resolvedFromInput = await resolveChannelByInputWithThumbnail(handle);
        normalized = resolvedFromInput.normalizedHandle;
      }
      const boardState = boards.find((board) => board.id === boardId);
      const currentColumn = boardState?.columns.find((column) => column.id === columnId);
      if (!currentColumn) {
        throw new Error("Column not found.");
      }
      const cutoffTime = getWindowCutoffTime(STORAGE_VIDEO_WINDOW_DAYS);
      const isChannelSwitch = currentColumn.currentHandle !== normalized;
      const previousVideosById = isChannelSwitch
        ? new Map<string, VideoItem>()
        : new Map(currentColumn.videos.map((video) => [video.videoId, video]));

      const newestKnownPublishedTime = isChannelSwitch
        ? 0
        : currentColumn.videos.reduce((latest, video) => {
            const publishedTime = getVideoPublishedTime(video);
            return publishedTime > latest ? publishedTime : latest;
          }, 0);

      let channelId = currentColumn.channelId;
      let uploadsPlaylistId = currentColumn.uploadsPlaylistId;
      let nextChannelThumbnailUrl = currentColumn.channelThumbnailUrl;
      if (resolvedFromInput) {
        channelId = resolvedFromInput.channelId;
        uploadsPlaylistId = resolvedFromInput.uploadsPlaylistId;
        nextChannelThumbnailUrl =
          resolvedFromInput.channelThumbnailUrl || nextChannelThumbnailUrl;
      }

      if (
        !resolvedFromInput &&
        (!channelId || !uploadsPlaylistId || currentColumn.currentHandle !== normalized)
      ) {
        estimatedQuotaUnits += 1; // channels.list for handle resolve + uploads playlist
        const lookup = await resolveChannelByHandleWithThumbnail(normalized);
        channelId = lookup.channelId;
        uploadsPlaylistId = lookup.uploadsPlaylistId;
        nextChannelThumbnailUrl = lookup.channelThumbnailUrl || nextChannelThumbnailUrl;
      }

      const discoveredNewVideos: VideoItem[] = [];
      const seenVideoIds = new Set<string>();
      let pageToken = "";

      while (true) {
        estimatedQuotaUnits += 1; // playlistItems.list page
        const { videos, nextPageToken } = await fetchPlaylistDiscoveryPage(
          uploadsPlaylistId,
          pageToken,
          50
        );
        if (videos.length === 0) {
          break;
        }

        let stopDiscovery = false;
        for (const video of videos) {
          const publishedTime = getVideoPublishedTime(video);
          if (publishedTime < cutoffTime) {
            stopDiscovery = true;
            break;
          }
          if (previousVideosById.has(video.videoId) || publishedTime <= newestKnownPublishedTime) {
            stopDiscovery = true;
            break;
          }
          if (seenVideoIds.has(video.videoId)) {
            continue;
          }
          seenVideoIds.add(video.videoId);
          discoveredNewVideos.push(video);
        }

        if (stopDiscovery || !nextPageToken) {
          break;
        }
        pageToken = nextPageToken;
      }

      if (discoveredNewVideos.length > 0) {
        estimatedQuotaUnits += Math.ceil(discoveredNewVideos.length / 50); // videos.list batches
      }
      const statsByVideoId =
        discoveredNewVideos.length > 0
          ? await fetchVideoStatsByVideoIds(discoveredNewVideos.map((video) => video.videoId))
          : {};

      setColumn(boardId, columnId, (prev) => ({
        ...prev,
        loading: false,
        error: null,
        videos: (() => {
          const mergedById = new Map<string, VideoItem>();
          if (!isChannelSwitch) {
            prev.videos.forEach((video) => {
              if (getVideoPublishedTime(video) >= cutoffTime) {
                mergedById.set(video.videoId, video);
              }
            });
          }

          discoveredNewVideos.forEach((video) => {
            const stats = statsByVideoId[video.videoId];
            mergedById.set(video.videoId, {
              ...video,
              viewCount: stats?.viewCount ?? video.viewCount,
              durationSeconds: stats?.durationSeconds ?? video.durationSeconds ?? null
            });
          });

          return [...mergedById.values()].sort(
            (a, b) => getVideoPublishedTime(b) - getVideoPublishedTime(a)
          );
        })(),
        handleInput: normalized,
        currentHandle: normalized,
        channelId: channelId || prev.channelId,
        uploadsPlaylistId: uploadsPlaylistId || prev.uploadsPlaylistId,
        channelThumbnailUrl: nextChannelThumbnailUrl || prev.channelThumbnailUrl || "",
        lastFetchAt: new Date().toLocaleString()
      }));
      if (discoveredNewVideos.length > 0) {
        const refreshedAt = Date.now();
        setBoard(boardId, (board) => ({
          ...board,
          viewCountRefreshedAtByVideoId: {
            ...board.viewCountRefreshedAtByVideoId,
            ...Object.fromEntries(
              discoveredNewVideos.map((video) => [video.videoId, refreshedAt])
            )
          }
        }));
      }
      if (nextChannelThumbnailUrl) {
        const brokenKey = `${boardId}:${columnId}`;
        setBrokenChannelThumbnailKeys((prev) => prev.filter((key) => key !== brokenKey));
      }
    } catch (error) {
      const sourceMessage =
        error instanceof Error ? error.message : "Failed to fetch videos.";
      const message = /handle must be in @name format|invalid handle format/i.test(
        sourceMessage
      )
        ? "Channel not found."
        : sourceMessage;
      appendFetchErrorLog(boardId, columnId, message);
      setColumn(boardId, columnId, (prev) => ({
        ...prev,
        loading: false,
        error: message
      }));
    } finally {
      recordEstimatedQuotaUsage(estimatedQuotaUnits);
    }
  };

  const addColumn = (): void => {
    if (!activeBoard) {
      return;
    }
    if (activeBoard.kind === "saved") {
      setBoard(activeBoard.id, (board) => ({
        ...board,
        columns: [...board.columns, createSavedListColumn(board.columns)]
      }));
      scrollToColumnsEndSoon();
      return;
    }
    setBulkInput("");
    setIsBulkModalOpen(true);
  };

  const removeColumnById = (columnIdToRemove: string): void => {
    if (!activeBoard) {
      return;
    }
    setBoard(activeBoard.id, (board) => ({
      ...board,
      columns: board.columns.filter((column) => column.id !== columnIdToRemove)
    }));
  };

  const moveColumnById = (columnIdToMove: string, direction: "left" | "right"): void => {
    if (!activeBoard) {
      return;
    }
    setBoard(activeBoard.id, (board) => {
      const fromIndex = board.columns.findIndex((column) => column.id === columnIdToMove);
      if (fromIndex < 0) {
        return board;
      }
      const toIndex = direction === "left" ? fromIndex - 1 : fromIndex + 1;
      if (toIndex < 0 || toIndex >= board.columns.length) {
        return board;
      }
      const nextColumns = [...board.columns];
      const [moved] = nextColumns.splice(fromIndex, 1);
      nextColumns.splice(toIndex, 0, moved);
      return {
        ...board,
        columns: nextColumns
      };
    });
  };

  const confirmDeleteColumn = (): void => {
    if (!deletingColumnId) {
      return;
    }
    if (isSavedBoardActive && columns.length <= 1) {
      setDeletingColumnId(null);
      return;
    }
    removeColumnById(deletingColumnId);
    setDeletingColumnId(null);
  };

  const handleBulkAddConfirm = (): void => {
    if (!activeBoard) {
      return;
    }
    if (activeBoard.kind === "saved") {
      const names = parseBulkListNames(bulkInput);
      const createdNames =
        names.length > 0
          ? names
          : [getNextSavedListName(activeBoard.columns)];
      const created = createdNames.map((name) =>
        createColumnState({
          handleInput: name.trim().length > 0 ? name : getNextSavedListName(activeBoard.columns)
        })
      );
      setBoard(activeBoard.id, (board) => ({
        ...board,
        columns: [...board.columns, ...created]
      }));
      scrollToColumnsEndSoon();
      setIsBulkModalOpen(false);
      setBulkInput("");
      return;
    }

    const handles = parseBulkHandles(bulkInput);
    if (handles.length === 0) {
      setIsBulkModalOpen(false);
      setBulkInput("");
      return;
    }

    const created = handles.map((handle) =>
      createColumnState({ handleInput: handle })
    );
    setBoard(activeBoard.id, (board) => ({
      ...board,
      columns: [...board.columns, ...created],
      columnScopeFilter: includeNewColumnsInScope(
        board,
        created.map((column) => column.id)
      )
    }));
    scrollToColumnsEndSoon();
    setPendingBulkFetch(
      created.map((column) => ({
        boardId: activeBoard.id,
        id: column.id,
        handle: column.handleInput
      }))
    );
    setIsBulkModalOpen(false);
    setBulkInput("");
  };

  const fetchAllColumns = (): void => {
    if (!activeBoard || activeBoard.kind === "saved") {
      return;
    }
    activeBoard.columns.forEach((column) => {
      const rawHandle = column.handleInput.trim();
      if (rawHandle.length > 0) {
        runFetch(activeBoard.id, column.id, column.handleInput);
      }
    });
  };

  const openBoardDurationBackfillModal = (): void => {
    if (!activeBoard) {
      return;
    }
    const videoIds = collectBoardMissingDurationNewVideoIds(activeBoard);
    setBoardDurationBackfillError(null);
    setBoardDurationBackfillAction({
      boardId: activeBoard.id,
      boardName: activeBoard.name,
      videoIds,
      estimatedQueries: Math.ceil(videoIds.length / 50)
    });
  };

  const confirmBoardDurationBackfill = async (): Promise<void> => {
    if (!boardDurationBackfillAction) {
      return;
    }
    setBoardDurationBackfillError(null);
    setIsBoardDurationBackfillRunning(true);
    const estimatedQuotaUnits = Math.ceil(boardDurationBackfillAction.videoIds.length / 50);
    try {
      const stats = await fetchVideoStatsByVideoIds(boardDurationBackfillAction.videoIds);
      setBoard(boardDurationBackfillAction.boardId, (board) => ({
        ...board,
        columns: board.columns.map((column) => ({
          ...column,
          videos: column.videos.map((video) => {
            if (board.watchedVideos[video.videoId] === true) {
              return video;
            }
            if (typeof video.durationSeconds === "number") {
              return video;
            }
            const nextDuration = stats[video.videoId]?.durationSeconds;
            if (typeof nextDuration !== "number") {
              return video;
            }
            return {
              ...video,
              durationSeconds: nextDuration
            };
          })
        }))
      }));
      setBoardDurationBackfillAction(null);
    } catch (error) {
      setBoardDurationBackfillError(
        error instanceof Error ? error.message : "Failed to backfill durations."
      );
    } finally {
      setIsBoardDurationBackfillRunning(false);
      recordEstimatedQuotaUsage(estimatedQuotaUnits);
    }
  };

  const scrollColumns = (direction: "left" | "right"): void => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }

    const delta = direction === "left" ? -360 : 360;
    node.scrollBy({ left: delta, behavior: "smooth" });
  };

  const scrollToEdge = (edge: "start" | "end"): void => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }

    if (edge === "start") {
      node.scrollTo({ left: 0, behavior: "smooth" });
      return;
    }

    const maxLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    node.scrollTo({ left: maxLeft, behavior: "smooth" });
  };

  const scrollToColumnsEndSoon = (): void => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToEdge("end");
      });
    });
  };

  const includeNewColumnsInScope = (board: BoardState, newColumnIds: string[]): string[] => {
    const normalizedScope = normalizeColumnScopeFilter(board.columnScopeFilter, board.columns);
    if (normalizedScope.includes(COLUMN_SCOPE_ALL)) {
      return [COLUMN_SCOPE_ALL];
    }
    const withoutSpecial = normalizedScope.filter(
      (value) => value !== COLUMN_SCOPE_NOT_EMPTY && value !== COLUMN_SCOPE_ALL
    );
    const merged = [...new Set([...withoutSpecial, ...newColumnIds])];
    return merged.length > 0 ? merged : [COLUMN_SCOPE_ALL];
  };

  const revealHiddenColumn = (columnId: string): void => {
    if (!activeBoard || activeBoard.kind === "saved") {
      return;
    }
    const visibleIds = visibleColumns.map((column) => column.id);
    const next = [...new Set([...visibleIds, columnId])];
    setBoard(activeBoard.id, (board) => ({
      ...board,
      columnScopeFilter: next.length > 0 ? next : [columnId]
    }));
  };

  const hideVisibleColumn = (columnId: string): void => {
    if (!activeBoard || activeBoard.kind === "saved") {
      return;
    }
    const visibleIds = visibleColumns.map((column) => column.id);
    if (visibleIds.length <= 1) {
      return;
    }
    const next = visibleIds.filter((id) => id !== columnId);
    if (next.length === 0) {
      return;
    }
    setBoard(activeBoard.id, (board) => ({
      ...board,
      columnScopeFilter: next
    }));
  };

  const handlePlaybackRateClick = (rate: number): void => {
    if (!activeBoard) {
      return;
    }
    setPlaybackRate(rate);
    setBoard(activeBoard.id, (board) => ({
      ...board,
      defaultPlaybackRate: rate
    }));
    if (!playerRef.current) {
      return;
    }
    try {
      playerRef.current.setPlaybackRate(rate);
    } catch {
      // Ignore unsupported playback-rate calls.
    }
  };

  const handlePreferredPlaybackRateChange = (rate: number): void => {
    if (!activeBoard) {
      return;
    }
    setPlaybackRate(rate);
    setBoard(activeBoard.id, (board) => ({
      ...board,
      defaultPlaybackRate: rate
    }));
    if (!playerRef.current) {
      return;
    }
    try {
      playerRef.current.setPlaybackRate(rate);
    } catch {
      // Ignore unsupported playback-rate calls.
    }
  };

  const markWatched = (videoId: string): void => {
    if (!activeBoard) {
      return;
    }
    setBoard(activeBoard.id, (board) => ({
      ...board,
      watchedVideos: {
        ...board.watchedVideos,
        [videoId]: true
      }
    }));
  };

  const stopPlaylist = (): void => {
    setPlaylistQueue([]);
    setPlaylistIndex(-1);
    setPlaylistScope("all");
    setPlaylistChannelLabel("");
    setPlaylistOrderLabel("NEWEST FIRST");
  };

  const closeVideoModal = (): void => {
    setActiveVideo(null);
    setIsPlayerReady(false);
    playerReadyRef.current = false;
    setUseIframeFallback(false);
  };

  const markWatchedAndAdvanceOrClose = (): void => {
    if (!activeVideo) {
      return;
    }

    markWatched(activeVideo.videoId);

    if (!isPlaylistActive) {
      stopPlaylist();
      closeVideoModal();
      return;
    }

    const nextIndex = playlistIndex + 1;
    if (nextIndex >= playlistQueue.length) {
      stopPlaylist();
      closeVideoModal();
      return;
    }

    setPlaylistIndex(nextIndex);
    setActiveVideo(playlistQueue[nextIndex]);
  };

  const openVideo = (video: VideoItem): void => {
    stopPlaylist();
    setActiveVideo(video);
  };

  const toggleWatched = (videoId: string): void => {
    if (!activeBoard) {
      return;
    }
    setBoard(activeBoard.id, (board) => {
      const next = { ...board.watchedVideos };
      if (next[videoId]) {
        delete next[videoId];
      } else {
        next[videoId] = true;
      }
      return {
        ...board,
        watchedVideos: next
      };
    });
  };

  const backfillVideoStats = async (videoId: string): Promise<void> => {
    if (videoStatsBackfillInFlight.includes(videoId)) {
      return;
    }
    const estimatedQuotaUnits = 1;
    const setInlineMetaFeedback = (
      kind: InlineMetaFeedback["kind"],
      text: string,
      durationMs?: number
    ): void => {
      const existingTimeout = videoMetaFeedbackTimeoutsRef.current[videoId];
      if (existingTimeout) {
        window.clearTimeout(existingTimeout);
      }
      setVideoMetaFeedbackById((previous) => ({
        ...previous,
        [videoId]: { kind, text }
      }));
      if (!durationMs || durationMs <= 0) {
        delete videoMetaFeedbackTimeoutsRef.current[videoId];
        return;
      }
      videoMetaFeedbackTimeoutsRef.current[videoId] = window.setTimeout(() => {
        setVideoMetaFeedbackById((previous) => {
          const next = { ...previous };
          delete next[videoId];
          return next;
        });
        delete videoMetaFeedbackTimeoutsRef.current[videoId];
      }, durationMs);
    };
    const previousVideo = boards
      .flatMap((board) => board.columns)
      .flatMap((column) => column.videos)
      .find((video) => video.videoId === videoId);
    setVideoStatsBackfillInFlight((prev) => [...prev, videoId]);
    setInlineMetaFeedback("info", "FETCHING", 0);
    try {
      const stats = await fetchVideoStatsByVideoIds([videoId]);
      const nextStats = stats[videoId];
      if (!nextStats) {
        setInlineMetaFeedback("error", "ERROR: NO DATA", 2000);
        return;
      }
      const refreshedAt = Date.now();
      const nextDurationSeconds =
        typeof previousVideo?.durationSeconds === "number"
          ? previousVideo.durationSeconds
          : nextStats.durationSeconds ?? null;
      const nextViewCount = nextStats.viewCount ?? previousVideo?.viewCount;
      setBoards((previous) =>
        previous.map((board) => ({
          ...board,
          columns: board.columns.map((column) => ({
            ...column,
            videos: column.videos.map((video) =>
              video.videoId !== videoId
                ? video
                : {
                    ...video,
                    viewCount: nextViewCount ?? video.viewCount,
                    durationSeconds: nextDurationSeconds
                  }
            )
          })),
          viewCountRefreshedAtByVideoId: {
            ...board.viewCountRefreshedAtByVideoId,
            [videoId]: refreshedAt
          }
        }))
      );
      const didChange =
        previousVideo?.viewCount !== nextViewCount ||
        previousVideo?.durationSeconds !== nextDurationSeconds;
      setInlineMetaFeedback(
        didChange ? "success" : typeof nextStats.durationSeconds === "number" ? "info" : "error",
        didChange
          ? "UPDATED"
          : typeof nextStats.durationSeconds === "number"
            ? "NO CHANGE"
            : "NO DURATION",
        2000
      );
    } catch (error) {
      const messageText =
        error instanceof Error && error.message
          ? `ERROR: ${error.message.toUpperCase()}`
          : "ERROR: REFRESH FAILED";
      setInlineMetaFeedback("error", messageText, 3000);
    } finally {
      setVideoStatsBackfillInFlight((prev) => prev.filter((item) => item !== videoId));
      recordEstimatedQuotaUsage(estimatedQuotaUnits);
    }
  };

  const copyVideoLink = async (video: VideoItem): Promise<void> => {
    const text = video.videoUrl;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("Clipboard API unavailable.");
      }
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "true");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopiedLinkVideoId(video.videoId);
    if (linkCopyFeedbackTimeoutRef.current) {
      window.clearTimeout(linkCopyFeedbackTimeoutRef.current);
    }
    linkCopyFeedbackTimeoutRef.current = window.setTimeout(() => {
      setCopiedLinkVideoId((previous) => (previous === video.videoId ? null : previous));
      linkCopyFeedbackTimeoutRef.current = null;
    }, 1000);
  };

  const copyAllVideoLinks = async (columnId: string, videos: VideoItem[]): Promise<void> => {
    if (videos.length === 0) {
      return;
    }
    const text = videos.map((video) => video.videoUrl).join("\n");
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("Clipboard API unavailable.");
      }
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "true");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    const feedbackId = `column-links:${columnId}`;
    setCopiedLinkVideoId(feedbackId);
    if (linkCopyFeedbackTimeoutRef.current) {
      window.clearTimeout(linkCopyFeedbackTimeoutRef.current);
    }
    linkCopyFeedbackTimeoutRef.current = window.setTimeout(() => {
      setCopiedLinkVideoId((previous) => (previous === feedbackId ? null : previous));
      linkCopyFeedbackTimeoutRef.current = null;
    }, 1000);
  };

  const openBulkWatchColumnAction = (
    column: ColumnState,
    videoIds: string[],
    markWatched: boolean
  ): void => {
    if (videoIds.length === 0) {
      return;
    }
    const channelNameRaw = column.handleInput.trim() || column.currentHandle.trim() || "";
    const channelName = channelNameRaw
      ? channelNameRaw.startsWith("@")
        ? channelNameRaw
        : `@${channelNameRaw}`
      : "";
    setBulkWatchColumnAction({
      columnId: column.id,
      channelName,
      videoIds,
      markWatched
    });
  };

  const openBulkWatchBoardAction = (): void => {
    if (!activeBoard || activeBoard.kind === "saved") {
      return;
    }
    const markWatched = videoFilter !== "watched";
    const now = Date.now();
    const uniqueVideoIds = new Set<string>();
    visibleColumns.forEach((column) => {
      getShownVideosForColumn(column, now).forEach((video) => {
        uniqueVideoIds.add(video.videoId);
      });
    });
    if (uniqueVideoIds.size === 0) {
      return;
    }
    setBulkWatchColumnAction({
      columnId: "",
      channelName: "ALL CHANNELS",
      videoIds: [...uniqueVideoIds],
      markWatched
    });
  };

  const confirmBulkWatchColumnAction = (): void => {
    if (!activeBoard || !bulkWatchColumnAction) {
      return;
    }
    setBoard(activeBoard.id, (board) => {
      const nextWatchedVideos = { ...board.watchedVideos };
      bulkWatchColumnAction.videoIds.forEach((videoId) => {
        if (bulkWatchColumnAction.markWatched) {
          nextWatchedVideos[videoId] = true;
        } else {
          delete nextWatchedVideos[videoId];
        }
      });
      return {
        ...board,
        watchedVideos: nextWatchedVideos
      };
    });
    setBulkWatchColumnAction(null);
  };

  const playAllVideos = (): void => {
    if (!activeBoard) {
      return;
    }

    const now = Date.now();
    const mergedById = new Map<string, VideoItem>();
    visibleColumns.forEach((column) => {
      getShownVideosForColumn(column, now).forEach((video) => {
        if (!mergedById.has(video.videoId)) {
          mergedById.set(video.videoId, video);
        }
      });
    });

    const queue = [...mergedById.values()];
    if (activeBoard.kind !== "saved") {
      queue.sort((a, b) => getVideoPublishedTime(b) - getVideoPublishedTime(a));
    }

    if (queue.length === 0) {
      return;
    }

    setPlaylistQueue(queue);
    setPlaylistIndex(0);
    setPlaylistScope("all");
    setPlaylistChannelLabel("");
    setPlaylistOrderLabel(
      activeBoard.kind === "saved" ? "FROM LEFT TO RIGHT AS SORTED" : "NEWEST FIRST"
    );
    setActiveVideo(queue[0]);
  };

  const playChannelVideos = (column: ColumnState): void => {
    const now = Date.now();
    const sourceVideos =
      activeBoard?.kind === "saved" ? sortSavedVideosByMode(column) : [...column.videos];
    const queue = sourceVideos
      .filter((video) => {
        if (!matchesVideoWindowFilter(getVideoPublishedTime(video), videoWindowDays, now)) {
          return false;
        }
        if (!matchesDurationFilter(video.durationSeconds, videoDurationFilter)) {
          return false;
        }
        const isWatched = watchedVideos[video.videoId] === true;
        if (videoFilter === "all") {
          return true;
        }
        if (videoFilter === "watched") {
          return isWatched;
        }
        return !isWatched;
      });
    if (activeBoard?.kind !== "saved") {
      queue.sort((a, b) => getVideoPublishedTime(b) - getVideoPublishedTime(a));
    }

    if (queue.length === 0) {
      return;
    }

    const channelRaw = column.currentHandle.trim() || column.handleInput.trim();
    const channelLabel =
      activeBoard?.kind === "saved"
        ? (channelRaw || "LIST").toUpperCase()
        : channelRaw
        ? (channelRaw.startsWith("@") ? channelRaw : `@${channelRaw}`).toUpperCase()
        : "@CHANNEL";

    setPlaylistQueue(queue);
    setPlaylistIndex(0);
    setPlaylistScope("channel");
    setPlaylistChannelLabel(channelLabel);
    setPlaylistOrderLabel(activeBoard?.kind === "saved" ? "AS SORTED" : "NEWEST FIRST");
    setActiveVideo(queue[0]);
  };

  const createBoard = (): string => {
    const board = createBoardState(
      getNextBoardName(boards.filter((item) => item.kind !== "saved")),
      { kind: "channels" },
      1
    );
    setBoards((previous) => [...previous, board]);
    setActiveBoardId(board.id);
    return board.id;
  };

  const openMoveColumnModal = (columnId: string): void => {
    setMovingColumnId(columnId);
    const firstDestinationBoardId = boards.find((board) => board.id !== activeBoardId)?.id;
    setMoveTargetBoardId(firstDestinationBoardId ?? "");
  };

  const confirmMoveColumnToBoard = (): void => {
    if (!activeBoard || !movingColumn || !moveTargetBoardId) {
      return;
    }

    const movingId = movingColumn.id;
    const columnToMove = movingColumn;

    setBoards((previous) =>
      previous.map((board) => {
        if (board.id === activeBoard.id) {
          return {
            ...board,
            columns: board.columns.filter((column) => column.id !== movingId)
          };
        }
        if (board.id === moveTargetBoardId) {
          return {
            ...board,
            columns: [...board.columns, columnToMove]
          };
        }
        return board;
      })
    );
    setBrokenChannelThumbnailKeys((previous) =>
      previous.filter((key) => !key.endsWith(`:${movingId}`))
    );
    setMovingColumnId(null);
    setMoveTargetBoardId("");
  };

  const moveBoard = (boardId: string, direction: "up" | "down"): void => {
    setBoards((previous) => {
      const index = previous.findIndex((board) => board.id === boardId);
      if (index === -1) {
        return previous;
      }
      if (previous[index].kind === "saved") {
        return previous;
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= previous.length) {
        return previous;
      }

      const next = [...previous];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const handleBoardSelectChange = (value: string): void => {
    if (value === NEW_BOARD_OPTION_VALUE) {
      createBoard();
      return;
    }
    setActiveBoardId(value);
  };

  const openRenameBoardModal = (boardId?: string): void => {
    const targetBoard =
      (boardId ? boards.find((board) => board.id === boardId) : undefined) ??
      activeBoard;
    if (!targetBoard) {
      return;
    }
    if (targetBoard.kind === "saved") {
      return;
    }
    setEditingBoardId(targetBoard.id);
    setRenameBoardInput(targetBoard.name);
    setIsRenameBoardModalOpen(true);
  };

  const confirmRenameBoard = (): void => {
    const targetBoardId = editingBoardId ?? activeBoard?.id;
    if (!targetBoardId) {
      return;
    }
    const nextName = renameBoardInput.trim().slice(0, 15);
    if (nextName.length === 0) {
      return;
    }
    setBoard(targetBoardId, (board) => ({
      ...board,
      name: nextName
    }));
    setEditingBoardId(null);
    setIsRenameBoardModalOpen(false);
  };

  const confirmDeleteBoard = (): void => {
    const removingBoardId = editingBoardId ?? activeBoard?.id;
    if (!removingBoardId) {
      return;
    }
    if (boards.find((board) => board.id === removingBoardId)?.kind === "saved") {
      return;
    }

    let nextActiveBoardId = "";
    setBoards((previous) => {
      const filtered = previous.filter((board) => board.id !== removingBoardId);
      const filteredChannels = filtered.filter((board) => board.kind !== "saved");
      if (filteredChannels.length > 0) {
        const activeIndex = previous.findIndex((board) => board.id === removingBoardId);
        const fallbackIndex = Math.min(activeIndex, filteredChannels.length - 1);
        nextActiveBoardId = filteredChannels[Math.max(0, fallbackIndex)].id;
        return ensureSavedBoard(filtered);
      }

      const replacement = createBoardState("BOARD 1", { kind: "channels", columns: [] });
      nextActiveBoardId = replacement.id;
      return ensureSavedBoard([replacement]);
    });
    setActiveBoardId(nextActiveBoardId);
    setEditingBoardId(null);
    setIsDeleteBoardModalOpen(false);
  };

  const handleExportBackup = (): void => {
    const payload: BackupPayload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      boards: boards.map((board) => ({
        id: board.id,
        name: board.name,
        kind: board.kind,
        columns: toPersistedColumns(board.columns),
        columnScopeFilter: board.columnScopeFilter,
        watchedVideos: board.watchedVideos,
        viewCountRefreshedAtByVideoId: board.viewCountRefreshedAtByVideoId,
        videoFilter: board.videoFilter,
        videoWindowDays: board.videoWindowDays,
        defaultPlaybackRate: board.defaultPlaybackRate
      })),
      activeBoardId
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `youtube-watch-backup-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  const handleImportBackup = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as unknown;
        const backup = sanitizeBackupPayload(parsed);
        if (!backup) {
          throw new Error("Invalid backup file.");
        }

        const importedBoards = ensureSavedBoard(
          backup.boards.map((board) => fromPersistedBoard(board))
        );
        setBoards(importedBoards);
        setActiveBoardId(backup.activeBoardId);
        const importedActiveBoard =
          importedBoards.find((board) => board.id === backup.activeBoardId) ??
          importedBoards[0];
        if (importedActiveBoard) {
          setPlaybackRate(importedActiveBoard.defaultPlaybackRate);
        }
      } catch {
        window.alert("Backup file could not be imported.");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  const saveVideoToSavedColumn = (): void => {
    if (!savingVideo || !saveTargetColumnId || !savedBoard) {
      return;
    }
    setBoard(savedBoard.id, (board) => ({
      ...board,
      columns: board.columns.map((column) => {
        if (column.id !== saveTargetColumnId) {
          return column;
        }
        const exists = column.videos.some((video) => video.videoId === savingVideo.videoId);
        if (exists) {
          return column;
        }
        const now = Date.now();
        const nextVideos = [savingVideo, ...column.videos];
        const nextManualOrder = [
          savingVideo.videoId,
          ...column.savedManualOrder.filter((videoId) => videoId !== savingVideo.videoId)
        ];
        return {
          ...column,
          videos: nextVideos,
          savedAddedAtByVideoId: {
            ...column.savedAddedAtByVideoId,
            [savingVideo.videoId]: now
          },
          savedManualOrder: nextManualOrder
        };
      }),
      watchedVideos: {
        ...board.watchedVideos,
        [savingVideo.videoId]: true
      },
      viewCountRefreshedAtByVideoId: {
        ...board.viewCountRefreshedAtByVideoId,
        [savingVideo.videoId]: Date.now()
      }
    }));
    if (activeBoard) {
      setBoard(activeBoard.id, (board) => ({
        ...board,
        watchedVideos: {
          ...board.watchedVideos,
          [savingVideo.videoId]: true
        }
      }));
    }
    setSavingVideo(null);
    setSaveTargetColumnId("");
  };

  const openEditSavedListModal = (column: ColumnState): void => {
    setEditingSavedListColumnId(column.id);
    setSavedListNameInput(column.handleInput);
  };

  const openEditChannelModal = (column: ColumnState): void => {
    setEditingChannelColumnId(column.id);
    setChannelNameInput(column.handleInput);
  };

  const confirmEditSavedListName = (): void => {
    if (!activeBoard || activeBoard.kind !== "saved" || !editingSavedListColumnId) {
      return;
    }
    const nextName = savedListNameInput.trim();
    if (nextName.length === 0) {
      return;
    }
    setColumn(activeBoard.id, editingSavedListColumnId, (prev) => ({
      ...prev,
      handleInput: nextName
    }));
    setEditingSavedListColumnId(null);
    setSavedListNameInput("");
  };

  const confirmEditChannelName = (): void => {
    if (!activeBoard || activeBoard.kind !== "channels" || !editingChannelColumnId) {
      return;
    }
    const currentColumn = activeBoard.columns.find(
      (column) => column.id === editingChannelColumnId
    );
    const nextName = channelNameInput.trim();
    if (nextName.length === 0) {
      return;
    }
    const didHandleChange =
      (currentColumn?.handleInput.trim().toLowerCase() ?? "") !==
      nextName.toLowerCase();
    setColumn(activeBoard.id, editingChannelColumnId, (prev) => ({
      ...prev,
      handleInput: nextName
    }));
    if (didHandleChange) {
      void runFetch(activeBoard.id, editingChannelColumnId, nextName);
    }
    setEditingChannelColumnId(null);
    setChannelNameInput("");
  };

  const openSaveVideoModal = (video: VideoItem): void => {
    if (!savedBoard || savedBoard.columns.length === 0) {
      return;
    }
    setSavingVideo(video);
    setSaveTargetColumnId(savedBoard.columns[0].id);
  };

  const deleteSavedVideo = (): void => {
    if (!deletingSavedVideo || !savedBoard) {
      return;
    }
    const { columnId, videoId } = deletingSavedVideo;
    setBoard(savedBoard.id, (board) => ({
      ...board,
      columns: board.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              videos: column.videos.filter((video) => video.videoId !== videoId),
              savedAddedAtByVideoId: Object.fromEntries(
                Object.entries(column.savedAddedAtByVideoId).filter(
                  (entry) => entry[0] !== videoId
                )
              ),
              savedManualOrder: column.savedManualOrder.filter((id) => id !== videoId)
            }
          : column
      ),
      viewCountRefreshedAtByVideoId: Object.fromEntries(
        Object.entries(board.viewCountRefreshedAtByVideoId).filter(
          (entry) => entry[0] !== videoId
        )
      )
    }));
    setDeletingSavedVideo(null);
  };

  const openRemoveAllSavedColumnModal = (column: ColumnState): void => {
    if (column.videos.length === 0) {
      return;
    }
    const listName = column.handleInput.trim() || "LIST";
    setRemoveAllSavedColumnAction({
      columnId: column.id,
      listName,
      videoCount: column.videos.length
    });
  };

  const confirmRemoveAllSavedColumnVideos = (): void => {
    if (!savedBoard || !removeAllSavedColumnAction) {
      return;
    }
    setBoard(savedBoard.id, (board) => ({
      ...board,
      columns: board.columns.map((column) =>
        column.id === removeAllSavedColumnAction.columnId
          ? {
              ...column,
              videos: [],
              savedAddedAtByVideoId: {},
              savedManualOrder: []
            }
          : column
      ),
      viewCountRefreshedAtByVideoId: Object.fromEntries(
        Object.entries(board.viewCountRefreshedAtByVideoId).filter(
          (entry) =>
            !board.columns
              .find((column) => column.id === removeAllSavedColumnAction.columnId)
              ?.videos.some((video) => video.videoId === entry[0])
        )
      )
    }));
    setRemoveAllSavedColumnAction(null);
  };

  const openMoveSavedVideoModal = (columnId: string, videoId: string): void => {
    if (!savedBoard) {
      return;
    }
    const destinationColumns = savedBoard.columns.filter((column) => column.id !== columnId);
    if (destinationColumns.length === 0) {
      return;
    }
    setMovingSavedVideo({ columnId, videoId });
    setMoveSavedVideoTargetColumnId(destinationColumns[0].id);
  };

  const moveSavedVideo = (): void => {
    if (!savedBoard || !movingSavedVideo || !moveSavedVideoTargetColumnId) {
      return;
    }
    const { columnId: sourceColumnId, videoId } = movingSavedVideo;
    const sourceColumn = savedBoard.columns.find((column) => column.id === sourceColumnId);
    const videoToMove = sourceColumn?.videos.find((video) => video.videoId === videoId);
    if (!videoToMove) {
      setMovingSavedVideo(null);
      setMoveSavedVideoTargetColumnId("");
      return;
    }

    setBoard(savedBoard.id, (board) => ({
      ...board,
      columns: board.columns.map((column) => {
        if (column.id === sourceColumnId) {
          return {
            ...column,
            videos: column.videos.filter((video) => video.videoId !== videoId),
            savedAddedAtByVideoId: Object.fromEntries(
              Object.entries(column.savedAddedAtByVideoId).filter(
                (entry) => entry[0] !== videoId
              )
            ),
            savedManualOrder: column.savedManualOrder.filter((id) => id !== videoId)
          };
        }
        if (column.id === moveSavedVideoTargetColumnId) {
          const exists = column.videos.some((video) => video.videoId === videoId);
          if (exists) {
            return column;
          }
          const now = Date.now();
          return {
            ...column,
            videos: [videoToMove, ...column.videos],
            savedAddedAtByVideoId: {
              ...column.savedAddedAtByVideoId,
              [videoId]: now
            },
            savedManualOrder: [
              videoId,
              ...column.savedManualOrder.filter((id) => id !== videoId)
            ]
          };
        }
        return column;
      })
    }));

    setMovingSavedVideo(null);
    setMoveSavedVideoTargetColumnId("");
  };

  const moveSavedVideoInManualOrder = (
    columnId: string,
    videoId: string,
    direction: "up" | "down"
  ): void => {
    if (!activeBoard || activeBoard.kind !== "saved") {
      return;
    }
    setColumn(activeBoard.id, columnId, (column) => {
      if (column.savedSortMode !== "manual") {
        return column;
      }
      const normalizedOrderData = normalizeSavedColumnOrderData(
        column.videos,
        column.savedAddedAtByVideoId,
        column.savedManualOrder
      );
      const nextOrder = [...normalizedOrderData.savedManualOrder];
      const index = nextOrder.indexOf(videoId);
      if (index === -1) {
        return column;
      }
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= nextOrder.length) {
        return {
          ...column,
          savedManualOrder: nextOrder
        };
      }
      [nextOrder[index], nextOrder[swapIndex]] = [nextOrder[swapIndex], nextOrder[index]];
      return {
        ...column,
        savedManualOrder: nextOrder
      };
    });
  };

  const triggerLogoSpin = (): void => {
    setIsLogoSpinning(false);
    window.requestAnimationFrame(() => {
      setIsLogoSpinning(true);
      if (logoSpinTimeoutRef.current) {
        window.clearTimeout(logoSpinTimeoutRef.current);
      }
      logoSpinTimeoutRef.current = window.setTimeout(() => {
        setIsLogoSpinning(false);
        logoSpinTimeoutRef.current = null;
      }, 920);
    });
  };

  return (
    <main className="app-shell">
      <div className="columns-nav">
        <Tooltip
          title={
            <>
              <div>{BUILD_INFO_LABEL}</div>
              <div>{quotaEstimateText}</div>
              <div>MAX FETCHED VIDEO AGE: 90 DAYS</div>
              <div>MAX SAVED VIDEO AGE: UNLIMITED</div>
            </>
          }
          placement="bottom"
          overlayClassName="fetch-all-tooltip"
        >
          <img
            src={TOP_BAR_LOGO_SRC}
            alt="Logo"
            className={`top-bar-logo ${isLogoSpinning ? "is-spinning" : ""}`}
            onClick={triggerLogoSpin}
          />
        </Tooltip>
        {!isSavedBoardActive ? (
          <Tooltip
            title={
              <>
                <div>Fetch all new videos for all channels.</div>
                <div>Last: {topbarLastFetchLabel}</div>
              </>
            }
            placement="bottom"
            overlayClassName="fetch-all-tooltip"
          >
            <Button
              type="primary"
              htmlType="button"
              onClick={fetchAllColumns}
              aria-label="Fetch all channels"
              className="nav-btn"
            >
              <span className="btn-icon btn-icon-fetch" aria-hidden />
            </Button>
          </Tooltip>
        ) : null}
        <Select<string>
          value={activeBoard?.id}
          onChange={handleBoardSelectChange}
          aria-label="Board selector"
          className="video-filter-select board-select"
          optionLabelProp="title"
          listHeight={boardDropdownListHeight}
        >
          {displayedBoards.map((board, boardIndex) => (
            <Select.Option
              key={board.id}
              value={board.id}
              title={board.name.toUpperCase()}
            >
              <div className="board-option-row">
                <span className="board-option-name">{board.name.toUpperCase()}</span>
                {board.kind !== "saved" ? (
                  <div className="board-option-actions">
                    <button
                      type="button"
                      className="board-option-move-btn"
                      aria-label={`Move ${board.name} up`}
                      disabled={boardIndex === 0}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        moveBoard(board.id, "up");
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="board-option-move-btn"
                      aria-label={`Move ${board.name} down`}
                      disabled={boardIndex === displayedBoards.length - 2}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        moveBoard(board.id, "down");
                      }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="board-option-edit-btn"
                      aria-label={`Edit ${board.name}`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openRenameBoardModal(board.id);
                      }}
                    >
                      <span className="btn-icon btn-icon-edit-board" aria-hidden />
                    </button>
                  </div>
                ) : null}
              </div>
            </Select.Option>
          ))}
          <Select.Option
            value={NEW_BOARD_OPTION_VALUE}
            title="NEW BOARD"
          >
            NEW BOARD
          </Select.Option>
        </Select>
        <Select
          mode="multiple"
          value={columnScopeFilter}
          onChange={(value: string[]) => {
            if (!activeBoard) {
              return;
            }
            const next = resolveColumnScopeFilterSelection(
              value,
              columnScopeFilter,
              columns
            );
            setBoard(activeBoard.id, (board) => ({
              ...board,
              columnScopeFilter: next
            }));
          }}
          aria-label="Channel scope filter"
          className="video-filter-select channel-scope-select"
          listHeight={channelScopeDropdownListHeight}
          maxTagCount={0}
          maxTagPlaceholder={() =>
            formatColumnScopeSummary(columnScopeFilter, isSavedBoardActive, columns)
          }
          showSearch={false}
          options={columnScopeOptions}
        />
        {!isSavedBoardActive ? (
          <Select<VideoFilter>
            value={videoFilter}
            onChange={(value) => {
              if (!activeBoard) {
                return;
              }
              setBoard(activeBoard.id, (board) => ({
                ...board,
                videoFilter: value
              }));
            }}
            aria-label="Video filter"
            className="video-filter-select video-status-select"
            options={[
              { value: "all", label: "ALL" },
              { value: "new", label: "NEW" },
              { value: "watched", label: "WATCHED" }
            ]}
          />
        ) : null}
        <Select<VideoWindowFilter>
          value={videoWindowDays}
          onChange={(value) => {
            if (!activeBoard) {
              return;
            }
            setBoard(activeBoard.id, (board) => ({
              ...board,
              videoWindowDays: value
            }));
          }}
          aria-label="Video age window"
          className="video-filter-select video-window-select"
          listHeight={360}
          options={
            isSavedBoardActive
              ? SAVED_VIDEO_WINDOW_SELECT_OPTIONS
              : CHANNEL_VIDEO_WINDOW_SELECT_OPTIONS
          }
        />
        <Select
          mode="multiple"
          value={videoDurationFilter}
          onChange={(value) => {
            if (!activeBoard) {
              return;
            }
            const next = resolveVideoDurationFilterSelection(value, videoDurationFilter);
            setBoard(activeBoard.id, (board) => ({
              ...board,
              videoDurationFilter: next
            }));
          }}
          aria-label="Video duration filter"
          className="video-filter-select video-duration-select"
          maxTagCount={0}
          maxTagPlaceholder={() => formatDurationFilterSummary(videoDurationFilter)}
          showSearch={false}
          options={VIDEO_DURATION_FILTER_OPTIONS}
        />
        <Select<number>
          value={preferredPlaybackRate}
          onChange={handlePreferredPlaybackRateChange}
          aria-label="Default playback speed"
          className="video-filter-select playback-speed-select"
          options={PLAYBACK_RATE_OPTIONS.map((value) => ({
            value,
            label: `${value}X`
          }))}
        />
        <Button
          htmlType="button"
          onClick={playAllVideos}
          aria-label="Play all videos"
          className="nav-btn"
        >
          <span className="btn-icon btn-icon-play" aria-hidden />
        </Button>
        {!isSavedBoardActive ? (
          <Button
            htmlType="button"
            onClick={openBulkWatchBoardAction}
            aria-label={`Mark all shown videos ${
              videoFilter === "watched" ? "new" : "watched"
            }`}
            className="nav-btn top-wa-btn"
            disabled={videoFilter === "all" || shownVideosTotal === 0}
          >
            {videoFilter === "watched" ? (
              <span className="btn-icon btn-icon-undo" aria-hidden />
            ) : (
              <span className="btn-icon btn-icon-check" aria-hidden />
            )}
          </Button>
        ) : null}
        <Text className={`topbar-video-count ${shownVideosTotal === 0 ? "is-zero" : ""}`}>
          {shownVideosTotal}
        </Text>
        <Button
          htmlType="button"
          onClick={() => scrollToEdge("start")}
          aria-label="Scroll columns to first"
          className="nav-btn scroll-btn"
        >
          {"«"}
        </Button>
        <Button
          htmlType="button"
          onClick={() => scrollColumns("left")}
          aria-label="Scroll columns left"
          className="nav-btn scroll-btn"
        >
          {"‹"}
        </Button>
        <Button
          htmlType="button"
          onClick={() => scrollColumns("right")}
          aria-label="Scroll columns right"
          className="nav-btn scroll-btn"
        >
          {"›"}
        </Button>
        <Button
          htmlType="button"
          onClick={() => scrollToEdge("end")}
          aria-label="Scroll columns to last"
          className="nav-btn scroll-btn"
        >
          {"»"}
        </Button>
      </div>

      <Modal
        title={isSavedBoardActive ? "Add Lists" : "Add Channels"}
        open={isBulkModalOpen}
        onCancel={() => setIsBulkModalOpen(false)}
        onOk={handleBulkAddConfirm}
        afterOpenChange={(open) => {
          if (open) {
            focusBulkModalInput();
          }
        }}
        okText="Add"
        className="add-channels-modal"
      >
        <Input.TextArea
          value={bulkInput}
          onChange={(event) => setBulkInput(event.target.value)}
          autoSize={{ minRows: 6, maxRows: 12 }}
          placeholder={
            isSavedBoardActive
              ? "List One\nList Two\nList Three"
              : "@channelOne\n@channelTwo\n@channelThree"
          }
        />
      </Modal>

      <Modal
        title={activeVideo?.title ?? "Video"}
        open={activeVideo !== null}
        onCancel={() => {
          stopPlaylist();
          closeVideoModal();
        }}
        footer={null}
        width={1125}
        zIndex={1000}
        destroyOnHidden
        className="video-player-modal"
      >
        {activeVideo ? (
          <Space direction="vertical" size="middle" className="full-width">
            <div ref={videoModalWrapRef} className="video-modal-wrap">
              {useIframeFallback && !isPlayerReady ? (
                <iframe
                  ref={fallbackIframeRef}
                  src={`https://www.youtube.com/embed/${activeVideo.videoId}?autoplay=1&rel=0`}
                  title={activeVideo.title}
                  className="video-modal-frame"
                  tabIndex={-1}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              ) : null}
              <div
                ref={setPlayerHost}
                tabIndex={-1}
                className={`video-modal-frame ${
                  useIframeFallback && !isPlayerReady ? "video-modal-frame-hidden" : ""
                }`}
              />
            </div>
            <div className="speed-controls">
              <div className="speed-controls-left">
                <Button
                  htmlType="button"
                  className={`column-move-btn link-copy-btn ${
                    copiedLinkVideoId === activeVideo.videoId ? "is-copied" : ""
                  }`}
                  aria-label={`Copy link for ${activeVideo.title}`}
                  onClick={() => void copyVideoLink(activeVideo)}
                >
                  <span className="btn-icon btn-icon-link" aria-hidden />
                </Button>
                <Button
                  htmlType="button"
                  className="video-watch-btn modal-save-btn"
                  aria-label={`Save ${activeVideo.title}`}
                  onClick={() => openSaveVideoModal(activeVideo)}
                  disabled={saveDestinationColumns.length === 0}
                >
                  <span className="btn-icon btn-icon-star" aria-hidden />
                </Button>
                <Button
                  htmlType="button"
                  className="video-watch-btn modal-watch-btn"
                  aria-label={`Mark ${activeVideo.title} as watched`}
                  onClick={markWatchedAndAdvanceOrClose}
                >
                  <span className="btn-icon btn-icon-check" aria-hidden />
                </Button>
                {isPlaylistActive ? (
                  <Text className="playlist-progress-text">
                    {playlistIndex + 1} of {playlistQueue.length} |{" "}
                    {playlistScope === "channel"
                      ? playlistChannelLabel || "CHANNEL"
                      : isSavedBoardActive
                      ? "ALL LISTS"
                      : "ALL CHANNELS"}{" "}
                    | {playlistOrderLabel}
                  </Text>
                ) : null}
              </div>
              <div className="speed-controls-right">
                {availablePlaybackRates.map((rate) => (
                  <Button
                    key={rate}
                    htmlType="button"
                    className="speed-btn"
                    type={playbackRate === rate ? "primary" : "default"}
                    onClick={() => handlePlaybackRateClick(rate)}
                    disabled={!isPlayerReady}
                  >
                    {rate}x
                  </Button>
                ))}
              </div>
            </div>
          </Space>
        ) : null}
      </Modal>

      <div
        ref={scrollRef}
        className="columns-scroll"
      >
        <div className="columns-layout">
          <section className="columns-grid">
            {visibleColumns.map((column, index) => {
              const now = Date.now();
              const brokenThumbKey = `${activeBoardId}:${column.id}`;
              const channelThumbToShow =
                isSavedBoardActive
                  ? ""
                  : brokenChannelThumbnailKeys.includes(brokenThumbKey)
                  ? column.videos[0]?.thumbnailUrl ?? ""
                  : column.channelThumbnailUrl || column.videos[0]?.thumbnailUrl || "";
              const hasHandleInput = column.handleInput.trim().length > 0;
              const sortedColumnVideos =
                isSavedBoardActive ? sortSavedVideosByMode(column) : column.videos;

              const filteredVideos = sortedColumnVideos.filter((video) => {
                if (
                  !matchesVideoWindowFilter(getVideoPublishedTime(video), videoWindowDays, now)
                ) {
                  return false;
                }
                if (!matchesDurationFilter(video.durationSeconds, videoDurationFilter)) {
                  return false;
                }
                const isWatched = watchedVideos[video.videoId] === true;
                if (videoFilter === "all") {
                  return true;
                }
                if (videoFilter === "watched") {
                  return isWatched;
                }
                return !isWatched;
              });
              const manualOrderIndexByVideoId =
                isSavedBoardActive && column.savedSortMode === "manual"
                  ? new Map(filteredVideos.map((video, index) => [video.videoId, index]))
                  : new Map<string, number>();
              const hasChannelPlaylistVideos = filteredVideos.length > 0;

              return (
                <article
                  key={column.id}
                  className={`channel-column ${
                    isSavedBoardActive ? "is-saved-column" : "is-channel-column"
                  }`}
                >
                  <div className="column-actions">
                    <div className="column-actions-left">
                      <Button
                        htmlType="button"
                        onClick={() => moveColumnById(column.id, "left")}
                        disabled={index === 0 || column.loading}
                        aria-label={`Move column ${index + 1} left`}
                        className="column-move-btn"
                      >
                        {"‹"}
                      </Button>
                      <Button
                        htmlType="button"
                        onClick={() => moveColumnById(column.id, "right")}
                        disabled={index === visibleColumns.length - 1 || column.loading}
                        aria-label={`Move column ${index + 1} right`}
                        className="column-move-btn"
                      >
                        {"›"}
                      </Button>
                      {!isSavedBoardActive ? (
                        <Button
                          htmlType="button"
                          onClick={() => openMoveColumnModal(column.id)}
                          disabled={
                            column.loading ||
                            moveDestinationBoards.length === 0 ||
                            !hasChannelPlaylistVideos
                          }
                          aria-label={`Move column ${index + 1} to board`}
                          className="column-move-btn"
                        >
                          <span className="btn-icon btn-icon-move" aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                    <div className="column-actions-right">
                      {isSavedBoardActive ? (
                        <Select<SavedSortMode>
                          value={column.savedSortMode}
                          onChange={(value) => {
                            setColumn(activeBoardId, column.id, (prev) => ({
                              ...prev,
                              savedSortMode: value
                            }));
                          }}
                          aria-label={`Sort list ${index + 1}`}
                          className="video-filter-select saved-sort-select"
                          options={SAVED_SORT_MODE_OPTIONS}
                        />
                      ) : null}
                      {!isSavedBoardActive ? (
                        <Button
                          htmlType="button"
                          onClick={() =>
                            runFetch(activeBoardId, column.id, column.handleInput)
                          }
                          disabled={
                            column.loading ||
                            !hasHandleInput
                          }
                          aria-label={`Fetch column ${index + 1}`}
                          className="inline-fetch-btn"
                        >
                          <span className="btn-icon btn-icon-fetch" aria-hidden />
                        </Button>
                      ) : null}
                      <Button
                        htmlType="button"
                        onClick={() => playChannelVideos(column)}
                        disabled={column.loading || !hasChannelPlaylistVideos}
                        aria-label={`Play channel ${index + 1} playlist`}
                        className="column-move-btn"
                      >
                        <span className="btn-icon btn-icon-play" aria-hidden />
                      </Button>
                      {!isSavedBoardActive ? (
                        <Button
                          htmlType="button"
                          onClick={() => void copyAllVideoLinks(column.id, filteredVideos)}
                          disabled={column.loading || filteredVideos.length === 0}
                          aria-label={`Copy all shown links in channel ${index + 1}`}
                          className={`column-move-btn link-copy-btn ${
                            copiedLinkVideoId === `column-links:${column.id}` ? "is-copied" : ""
                          }`}
                        >
                          <span className="btn-icon btn-icon-link" aria-hidden />
                        </Button>
                      ) : null}
                      {isSavedBoardActive ? (
                        <Button
                          htmlType="button"
                          onClick={() => openRemoveAllSavedColumnModal(column)}
                          disabled={column.loading || column.videos.length === 0}
                          aria-label={`Remove videos from list ${index + 1}`}
                          className="remove-column-btn"
                        >
                          <span className="btn-icon btn-icon-remove" aria-hidden />
                        </Button>
                      ) : null}
                      {!isSavedBoardActive ? (
                        <Button
                          htmlType="button"
                          onClick={() =>
                            openBulkWatchColumnAction(
                              column,
                              filteredVideos.map((video) => video.videoId),
                              videoFilter !== "watched"
                            )
                          }
                          disabled={column.loading || filteredVideos.length === 0 || videoFilter === "all"}
                          aria-label={`Mark all shown videos in channel ${index + 1} as ${
                            videoFilter === "watched" ? "new" : "watched"
                          }`}
                          className="bulk-watch-column-btn"
                        >
                          {videoFilter === "watched" ? (
                            <span className="btn-icon btn-icon-undo" aria-hidden />
                          ) : (
                            <span className="btn-icon btn-icon-check" aria-hidden />
                          )}
                        </Button>
                      ) : null}
                      <Button
                        htmlType="button"
                        onClick={() => setDeletingColumnId(column.id)}
                        disabled={column.loading || (isSavedBoardActive && columns.length <= 1)}
                        aria-label={`Remove column ${index + 1}`}
                        className="remove-column-btn"
                      >
                        <span className="btn-icon btn-icon-delete" aria-hidden />
                      </Button>
                    </div>
                  </div>

                  <Form
                    layout="vertical"
                    className="full-width"
                  >
                    <div className="column-header">
                      {isSavedBoardActive ? (
                        channelThumbToShow ? (
                          <img
                            src={channelThumbToShow}
                            alt={`Channel ${index + 1}`}
                            className="channel-avatar"
                            onError={() => {
                              const brokenKey = `${activeBoardId}:${column.id}`;
                              setBrokenChannelThumbnailKeys((prev) =>
                                prev.includes(brokenKey) ? prev : [...prev, brokenKey]
                              );
                            }}
                          />
                        ) : (
                          <div
                            className="channel-avatar channel-avatar-placeholder"
                            aria-label={`Channel ${index + 1} placeholder`}
                          >
                            <img
                              src={SAVED_LIST_PLACEHOLDER_ICON}
                              alt=""
                              className="channel-avatar-placeholder-icon"
                            />
                          </div>
                        )
                      ) : (
                        <button
                          type="button"
                          className="channel-avatar-toggle-btn"
                          aria-label={`Hide ${column.handleInput || column.currentHandle || `channel ${index + 1}`}`}
                          onClick={() => hideVisibleColumn(column.id)}
                        >
                          {channelThumbToShow ? (
                            <img
                              src={channelThumbToShow}
                              alt={`Channel ${index + 1}`}
                              className="channel-avatar"
                              onError={() => {
                                const brokenKey = `${activeBoardId}:${column.id}`;
                                setBrokenChannelThumbnailKeys((prev) =>
                                  prev.includes(brokenKey) ? prev : [...prev, brokenKey]
                                );
                              }}
                            />
                          ) : (
                            <div
                              className="channel-avatar channel-avatar-placeholder"
                              aria-label={`Channel ${index + 1} placeholder`}
                            >
                              <img
                                src={CHANNEL_PLACEHOLDER_ICON}
                                alt=""
                                className="channel-avatar-placeholder-icon"
                              />
                            </div>
                          )}
                        </button>
                      )}
                      <Input
                        placeholder={isSavedBoardActive ? "List name" : "@channel"}
                        value={column.handleInput}
                        className="channel-handle-input"
                        aria-label={`Channel ${index + 1} handle`}
                        readOnly
                        onClick={() => {
                          if (isSavedBoardActive) {
                            openEditSavedListModal(column);
                            return;
                          }
                          openEditChannelModal(column);
                        }}
                        onPressEnter={(event) => {
                          event.preventDefault();
                        }}
                      />
                      <Text
                        className={`column-video-count ${
                          filteredVideos.length === 0 ? "is-zero" : ""
                        }`}
                      >
                        {filteredVideos.length}
                      </Text>
                    </div>

                  </Form>

                  {column.loading && (
                    <Space direction="vertical" className="full-width">
                      <Text>Loading...</Text>
                      <Spin />
                      <Skeleton active paragraph={{ rows: 2 }} />
                    </Space>
                  )}

                  {column.error && <Alert type="error" message={column.error} showIcon={false} />}

                  {!column.loading && !column.error && filteredVideos.length === 0 && (
                    <Empty description="Empty" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  )}

                  {!column.loading && filteredVideos.length > 0 && (
                    <List
                      itemLayout="vertical"
                      dataSource={filteredVideos}
                      renderItem={(video) => {
                        const isWatched = watchedVideos[video.videoId] === true;
                        const isMetaRefreshInFlight = videoStatsBackfillInFlight.includes(
                          video.videoId
                        );
                        const metaFeedback = videoMetaFeedbackById[video.videoId];
                        return (
                          <List.Item key={video.videoId} className="video-tile-item">
                            <Space direction="vertical" size="small" className="full-width">
                              <div className="video-meta-row">
                                <button
                                  type="button"
                                  className="video-meta-btn"
                                  onClick={() => void backfillVideoStats(video.videoId)}
                                  aria-label={`Refresh metadata for ${video.title}`}
                                  disabled={isMetaRefreshInFlight}
                                >
                                  <Text className="video-meta">
                                    {metaFeedback ? (
                                      <span
                                        className={`video-meta-feedback is-${metaFeedback.kind}`}
                                      >
                                        {metaFeedback.text}
                                      </span>
                                    ) : isMetaRefreshInFlight ? (
                                      <span className="video-meta-feedback is-info">
                                        FETCHING
                                      </span>
                                    ) : (
                                      formatVideoMeta(video)
                                    )}
                                  </Text>
                                </button>
                                {isSavedBoardActive ? (
                                  <>
                                    {column.savedSortMode === "manual" ? (
                                      <>
                                        <Button
                                          htmlType="button"
                                          className="column-move-btn"
                                          aria-label={`Move ${video.title} up`}
                                          onClick={() =>
                                            moveSavedVideoInManualOrder(column.id, video.videoId, "up")
                                          }
                                          disabled={
                                            (manualOrderIndexByVideoId.get(video.videoId) ?? 0) === 0
                                          }
                                        >
                                          ↑
                                        </Button>
                                        <Button
                                          htmlType="button"
                                          className="column-move-btn"
                                          aria-label={`Move ${video.title} down`}
                                          onClick={() =>
                                            moveSavedVideoInManualOrder(
                                              column.id,
                                              video.videoId,
                                              "down"
                                            )
                                          }
                                          disabled={
                                            (manualOrderIndexByVideoId.get(video.videoId) ?? 0) ===
                                            filteredVideos.length - 1
                                          }
                                        >
                                          ↓
                                        </Button>
                                      </>
                                    ) : null}
                                    <Button
                                      htmlType="button"
                                      className={`column-move-btn link-copy-btn ${
                                        copiedLinkVideoId === video.videoId ? "is-copied" : ""
                                      }`}
                                      aria-label={`Copy link for ${video.title}`}
                                      onClick={() => void copyVideoLink(video)}
                                    >
                                      <span className="btn-icon btn-icon-link" aria-hidden />
                                    </Button>
                                    <Button
                                      htmlType="button"
                                      className="column-move-btn"
                                      aria-label={`Move ${video.title}`}
                                      onClick={() =>
                                        openMoveSavedVideoModal(column.id, video.videoId)
                                      }
                                      disabled={savedBoardColumns.length <= 1}
                                    >
                                      <span className="btn-icon btn-icon-move" aria-hidden />
                                    </Button>
                                    <Button
                                      htmlType="button"
                                      className="remove-column-btn video-delete-btn"
                                      aria-label={`Delete ${video.title}`}
                                      onClick={() =>
                                        setDeletingSavedVideo({
                                          columnId: column.id,
                                          videoId: video.videoId
                                        })
                                      }
                                    >
                                      <span className="btn-icon btn-icon-remove" aria-hidden />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      htmlType="button"
                                      className={`column-move-btn link-copy-btn ${
                                        copiedLinkVideoId === video.videoId ? "is-copied" : ""
                                      }`}
                                      aria-label={`Copy link for ${video.title}`}
                                      onClick={() => void copyVideoLink(video)}
                                    >
                                      <span className="btn-icon btn-icon-link" aria-hidden />
                                    </Button>
                                    <Button
                                      htmlType="button"
                                      className="column-move-btn"
                                      aria-label={`Save ${video.title}`}
                                      onClick={() => openSaveVideoModal(video)}
                                      disabled={saveDestinationColumns.length === 0}
                                    >
                                      <span className="btn-icon btn-icon-star" aria-hidden />
                                    </Button>
                                    <Button
                                      htmlType="button"
                                      className="video-watch-btn"
                                      aria-label={`Mark ${video.title} as ${
                                        isWatched ? "new" : "watched"
                                      }`}
                                      onClick={() => toggleWatched(video.videoId)}
                                    >
                                      {isWatched ? (
                                        <span className="btn-icon btn-icon-undo" aria-hidden />
                                      ) : (
                                        <span className="btn-icon btn-icon-check" aria-hidden />
                                      )}
                                    </Button>
                                  </>
                                )}
                              </div>
                              {video.thumbnailUrl ? (
                                <button
                                  type="button"
                                  className="video-thumb-btn"
                                  onClick={() => openVideo(video)}
                                >
                                  <img
                                    src={video.thumbnailUrl}
                                    alt={video.title}
                                    className="video-thumb"
                                  />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="video-link-btn"
                                onClick={() => openVideo(video)}
                              >
                                <Title level={5} className="video-title">
                                  {video.title}
                                </Title>
                              </button>
                            </Space>
                          </List.Item>
                        );
                      }}
                    />
                  )}
                </article>
              );
            })}
            <aside className="add-column-rail">
              <div className="add-column-stack">
                <Button
                  htmlType="button"
                  onClick={addColumn}
                  aria-label="Add column"
                  className="add-column-btn add-column-plus-btn"
                >
                  +
                </Button>
                {!isSavedBoardActive && hiddenColumns.length > 0 ? (
                  <div className="hidden-channel-thumbs">
                    {hiddenColumns.map((column, index) => {
                      const brokenKey = `${activeBoardId}:${column.id}`;
                      const thumbnailUrl = brokenChannelThumbnailKeys.includes(brokenKey)
                        ? column.videos[0]?.thumbnailUrl ?? ""
                        : column.channelThumbnailUrl || column.videos[0]?.thumbnailUrl || "";
                      const rawName = column.currentHandle.trim() || column.handleInput.trim();
                      const displayName = rawName
                        ? rawName.startsWith("@")
                          ? rawName
                          : `@${rawName}`
                        : `CHANNEL ${index + 1}`;
                      return (
                        <button
                          type="button"
                          key={column.id}
                          className="hidden-channel-thumb"
                          title={displayName.toUpperCase()}
                          aria-label={`Hidden ${displayName}`}
                          onClick={() => revealHiddenColumn(column.id)}
                        >
                          {thumbnailUrl ? (
                            <img
                              src={thumbnailUrl}
                              alt={displayName}
                              className="hidden-channel-thumb-image"
                              onError={() => {
                                setBrokenChannelThumbnailKeys((prev) =>
                                  prev.includes(brokenKey) ? prev : [...prev, brokenKey]
                                );
                              }}
                            />
                          ) : (
                            <div className="hidden-channel-thumb-placeholder">
                              <img
                                src={CHANNEL_PLACEHOLDER_ICON}
                                alt=""
                                className="channel-avatar-placeholder-icon"
                              />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </aside>
          </section>
        </div>
      </div>
      <div className="backup-actions">
        <Button
          htmlType="button"
          onClick={handleExportBackup}
          aria-label="Backup data"
          className="backup-btn"
        >
          <span className="btn-icon btn-icon-backup" aria-hidden />
        </Button>
        <Button
          htmlType="button"
          onClick={() => importInputRef.current?.click()}
          aria-label="Restore data"
          className="backup-btn"
        >
          <span className="btn-icon btn-icon-restore" aria-hidden />
        </Button>
        <Button
          htmlType="button"
          onClick={() => setIsLogsModalOpen(true)}
          aria-label="Open logs"
          className="backup-btn"
        >
          <span className="btn-icon btn-icon-logs" aria-hidden />
        </Button>
        <Button
          htmlType="button"
          onClick={openBoardDurationBackfillModal}
          aria-label="Backfill board duration"
          className="backup-btn"
          disabled={activeBoardDurationBackfillIds.length === 0}
        >
          BD
        </Button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          className="backup-file-input"
          onChange={handleImportBackup}
        />
      </div>

      <Modal
        title="Logs"
        open={isLogsModalOpen}
        onCancel={() => setIsLogsModalOpen(false)}
        footer={
          <Space>
            <Button
              htmlType="button"
              onClick={() => setErrorLogs([])}
              disabled={errorLogs.length === 0}
            >
              Clear
            </Button>
            <Button type="primary" onClick={() => setIsLogsModalOpen(false)}>
              Close
            </Button>
          </Space>
        }
        width={640}
      >
        {errorLogs.length === 0 ? (
          <Text>No logs.</Text>
        ) : (
          <List
            size="small"
            dataSource={errorLogs}
            renderItem={(log) => (
              <List.Item key={log.id}>
                <Text>
                  {log.time} | {log.board} | {log.column} | {log.action} | {log.message}
                </Text>
              </List.Item>
            )}
          />
        )}
      </Modal>

      <Modal
        title="Backfill Durations"
        open={boardDurationBackfillAction !== null}
        onCancel={() => {
          if (isBoardDurationBackfillRunning) {
            return;
          }
          setBoardDurationBackfillAction(null);
          setBoardDurationBackfillError(null);
        }}
        onOk={() => void confirmBoardDurationBackfill()}
        okText="Backfill"
        confirmLoading={isBoardDurationBackfillRunning}
        okButtonProps={{
          disabled:
            !boardDurationBackfillAction ||
            boardDurationBackfillAction.videoIds.length === 0 ||
            isBoardDurationBackfillRunning
        }}
      >
        {boardDurationBackfillAction ? (
          <Space direction="vertical" size="small" className="full-width">
            <Text>
              Board: <strong>{boardDurationBackfillAction.boardName.toUpperCase()}</strong>
            </Text>
            <Text>
              Videos to backfill: <strong>{boardDurationBackfillAction.videoIds.length}</strong>
            </Text>
            <Text>
              Estimated queries: <strong>{boardDurationBackfillAction.estimatedQueries}</strong>
            </Text>
            <Text type="secondary">
              Includes only NEW (unwatched) videos with missing duration.
            </Text>
            {boardDurationBackfillError ? (
              <Alert type="error" showIcon={false} message={boardDurationBackfillError} />
            ) : null}
          </Space>
        ) : null}
      </Modal>

      <Modal
        title="Edit Board"
        open={isRenameBoardModalOpen}
        onCancel={() => {
          setEditingBoardId(null);
          setIsRenameBoardModalOpen(false);
        }}
        onOk={confirmRenameBoard}
        okText="Save"
        cancelText="Cancel"
        width={360}
        footer={(_, { CancelBtn, OkBtn }) => (
          <div className="board-edit-footer">
            <Button
              htmlType="button"
              danger
              className="board-delete-btn"
              onClick={() => {
                setIsRenameBoardModalOpen(false);
                setIsDeleteBoardModalOpen(true);
              }}
              disabled={!editingBoard}
            >
              Delete
            </Button>
            <Space size={8}>
              <CancelBtn />
              <OkBtn />
            </Space>
          </div>
        )}
      >
        <Input
          value={renameBoardInput}
          onChange={(event) => setRenameBoardInput(event.target.value)}
          onPressEnter={(event) => {
            event.preventDefault();
            confirmRenameBoard();
          }}
          placeholder="Board name"
          maxLength={15}
          autoFocus
        />
      </Modal>

      <Modal
        title="Delete Board"
        open={isDeleteBoardModalOpen}
        onCancel={() => {
          setEditingBoardId(null);
          setIsDeleteBoardModalOpen(false);
        }}
        onOk={confirmDeleteBoard}
        okText="Delete"
        okButtonProps={{ danger: true, className: "delete-confirm-ok" }}
        width={360}
        className="delete-board-modal"
      >
        <Text>
          Delete board {editingBoard ? editingBoard.name : ""}?
        </Text>
      </Modal>

      <Modal
        title={isSavedBoardActive ? "Delete List" : "Delete Channel"}
        open={deletingColumnId !== null}
        onCancel={() => setDeletingColumnId(null)}
        onOk={confirmDeleteColumn}
        okText="Delete"
        okButtonProps={{ danger: true, className: "delete-confirm-ok" }}
        width={360}
      >
        <Text>
          {isSavedBoardActive
            ? `Delete list ${deletingColumn?.handleInput || ""}?`
            : `Delete channel${deletingChannelNameDisplay ? ` ${deletingChannelNameDisplay}` : ""}?`}
        </Text>
      </Modal>

      <Modal
        title="Edit List"
        open={editingSavedListColumnId !== null}
        onCancel={() => {
          setEditingSavedListColumnId(null);
          setSavedListNameInput("");
        }}
        onOk={confirmEditSavedListName}
        okText="Save"
        width={360}
      >
        <Input
          value={savedListNameInput}
          onChange={(event) => setSavedListNameInput(event.target.value)}
          onPressEnter={(event) => {
            event.preventDefault();
            confirmEditSavedListName();
          }}
          placeholder="List name"
          maxLength={30}
          autoFocus
        />
      </Modal>

      <Modal
        title="Edit Channel"
        open={editingChannelColumnId !== null}
        onCancel={() => {
          setEditingChannelColumnId(null);
          setChannelNameInput("");
        }}
        onOk={confirmEditChannelName}
        okText="Save"
        width={360}
      >
        <Input
          value={channelNameInput}
          onChange={(event) => setChannelNameInput(event.target.value)}
          onPressEnter={(event) => {
            event.preventDefault();
            confirmEditChannelName();
          }}
          placeholder="@channel"
          maxLength={100}
          autoFocus
        />
      </Modal>

      <Modal
        title="Save Video"
        open={savingVideo !== null}
        onCancel={() => {
          setSavingVideo(null);
          setSaveTargetColumnId("");
        }}
        onOk={saveVideoToSavedColumn}
        okText="Save"
        okButtonProps={{ disabled: !saveTargetColumnId }}
        width={360}
        zIndex={1300}
        className="save-video-modal"
      >
        <Space direction="vertical" size={10} className="full-width">
          <Text>Save video?</Text>
          <Select<string>
            value={saveTargetColumnId || undefined}
            onChange={setSaveTargetColumnId}
            aria-label="Save destination list"
            className="video-filter-select full-width"
            placeholder="Select list"
            options={saveDestinationColumns.map((column) => ({
              value: column.id,
              label: column.handleInput.toUpperCase()
            }))}
          />
        </Space>
      </Modal>

      <Modal
        title="Remove Video"
        open={deletingSavedVideo !== null}
        onCancel={() => setDeletingSavedVideo(null)}
        onOk={deleteSavedVideo}
        okText="Remove"
        okButtonProps={{ danger: true, className: "delete-confirm-ok" }}
        width={360}
      >
        <Text>
          Remove video from {deletingSavedVideoListName.toUpperCase() || "LIST"}?
        </Text>
      </Modal>

      <Modal
        title="Remove Videos"
        open={removeAllSavedColumnAction !== null}
        onCancel={() => setRemoveAllSavedColumnAction(null)}
        onOk={confirmRemoveAllSavedColumnVideos}
        okText="Remove"
        okButtonProps={{ danger: true, className: "delete-confirm-ok" }}
        width={380}
      >
        <Text>
          {removeAllSavedColumnAction
            ? `Remove ${removeAllSavedColumnAction.videoCount} video${
                removeAllSavedColumnAction.videoCount === 1 ? "" : "s"
              } from ${removeAllSavedColumnAction.listName.toUpperCase()}?`
            : ""}
        </Text>
      </Modal>

      <Modal
        title="Move Video"
        open={movingSavedVideo !== null}
        onCancel={() => {
          setMovingSavedVideo(null);
          setMoveSavedVideoTargetColumnId("");
        }}
        onOk={moveSavedVideo}
        okText="Move"
        okButtonProps={{ disabled: !moveSavedVideoTargetColumnId }}
        width={360}
      >
        <Space direction="vertical" size={10} className="full-width">
          <Text>Move video to list?</Text>
          <Select<string>
            value={moveSavedVideoTargetColumnId || undefined}
            onChange={setMoveSavedVideoTargetColumnId}
            aria-label="Move video destination list"
            className="video-filter-select full-width"
            placeholder="Select list"
            options={moveSavedVideoDestinationColumns.map((column) => ({
              value: column.id,
              label: column.handleInput.toUpperCase()
            }))}
          />
        </Space>
      </Modal>

      <Modal
        title="Move Channel"
        open={movingColumnId !== null}
        onCancel={() => {
          setMovingColumnId(null);
          setMoveTargetBoardId("");
        }}
        onOk={confirmMoveColumnToBoard}
        okText="Move"
        okButtonProps={{ disabled: !moveTargetBoardId }}
        width={360}
      >
        <Space direction="vertical" size={10} className="full-width">
          <Text>
            Move channel
            {movingChannelNameDisplay ? ` ${movingChannelNameDisplay}` : ""}
            ?
          </Text>
          <Select<string>
            value={moveTargetBoardId || undefined}
            onChange={setMoveTargetBoardId}
            aria-label="Move destination board"
            className="video-filter-select full-width"
            placeholder="Select board"
            options={moveDestinationBoards.map((board) => ({
              value: board.id,
              label: board.name.toUpperCase()
            }))}
          />
        </Space>
      </Modal>

      <Modal
        title={bulkWatchColumnAction?.markWatched ? "Mark Videos Watched" : "Mark Videos New"}
        open={bulkWatchColumnAction !== null}
        onCancel={() => setBulkWatchColumnAction(null)}
        onOk={confirmBulkWatchColumnAction}
        okText={bulkWatchColumnAction?.markWatched ? "WATCHED" : "NEW"}
        width={380}
      >
        <Text>
          {bulkWatchColumnAction
            ? bulkWatchColumnAction.markWatched
              ? `Mark ${bulkWatchColumnAction.videoIds.length} shown video${
                  bulkWatchColumnAction.videoIds.length === 1 ? "" : "s"
                }${
                  bulkWatchColumnAction.channelName
                    ? ` in ${bulkWatchColumnAction.channelName.toUpperCase()}`
                    : ""
                } watched?`
              : `Mark ${bulkWatchColumnAction.videoIds.length} shown video${
                  bulkWatchColumnAction.videoIds.length === 1 ? "" : "s"
                } NEW${
                  bulkWatchColumnAction.channelName
                    ? ` in ${bulkWatchColumnAction.channelName.toUpperCase()}`
                    : ""
                }?`
            : ""}
        </Text>
      </Modal>
    </main>
  );
}

export default App;
