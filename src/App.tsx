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
  Typography,
  message
} from "antd";
import type { FetchState } from "./types/youtube";
import {
  fetchVideoStatsByVideoIds,
  getLatestVideosAndChannelByHandle
} from "./api/youtube";
import { normalizeHandle } from "./utils/handle";
import type { VideoItem } from "./types/youtube";

const { Title, Text } = Typography;
const DEFAULT_LIMIT = 50;
const DEFAULT_COLUMN_COUNT = 3;
const CHANGE_STAMP = "170326103457";
const VIEWCOUNT_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const TOP_BAR_LOGO_SRC = import.meta.env.PROD ? "/svg/logo-prod.svg" : "/svg/logo-dev.svg";
const SAVED_LIST_PLACEHOLDER_ICON = "/svg/placeholder-list.svg";
const PLAYLIST_ADD_ICON = "/svg/btn-batch-add.svg";
const CHANNEL_PLACEHOLDER_ICON = "/svg/placeholder-channel.svg";
const PLAYBACK_RATE_OPTIONS = [0.5, 1, 1.5, 2] as const;
const BUILD_INFO_LABEL = CHANGE_STAMP;
const BOARDS_STORAGE_KEY = "youtube-watch:boards:v1";
const ACTIVE_BOARD_ID_STORAGE_KEY = "youtube-watch:active-board-id:v1";
const ERROR_LOGS_STORAGE_KEY = "youtube-watch:error-logs:v1";
const LEGACY_HANDLE_STORAGE_KEY = "youtube-watch:handles:v1";
const LEGACY_COLUMNS_STORAGE_KEY = "youtube-watch:columns:v2";
const LEGACY_WATCHED_STORAGE_KEY = "youtube-watch:watched:v1";
const LEGACY_PLAYBACK_RATE_STORAGE_KEY = "youtube-watch:playback-rate:v1";
const YOUTUBE_IFRAME_API_SRC = "https://www.youtube.com/iframe_api";

type VideoFilter = "all" | "new" | "watched";
type VideoWindowDays = 1 | 3 | 7 | 30 | 60 | 90 | 120 | 180 | 360;
type VideoWindowFilter = VideoWindowDays | "all";
type PlaylistScope = "all" | "channel";
type BoardKind = "channels" | "saved";
type SavedSortMode =
  | "time_asc"
  | "time_desc"
  | "added_asc"
  | "added_desc"
  | "manual";
const CHANNEL_VIDEO_WINDOW_OPTIONS: VideoWindowFilter[] = [1, 3, 7, 30, 60, 90];
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
const BOARD_DROPDOWN_MAX_VISIBLE = 25;
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
  watchedVideos: Record<string, boolean>;
  viewCountRefreshedAtByVideoId: Record<string, number>;
  videoFilter: VideoFilter;
  videoWindowDays: VideoWindowFilter;
  defaultPlaybackRate: number;
};

type PersistedBoardState = {
  id: string;
  name: string;
  kind?: BoardKind;
  columns: PersistedColumnState[];
  watchedVideos: Record<string, boolean>;
  viewCountRefreshedAtByVideoId?: Record<string, number>;
  videoFilter: VideoFilter;
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

const NEW_BOARD_OPTION_VALUE = "__new__";

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

function shouldRefreshViewCount(
  lastRefreshedAt: number | undefined,
  now = Date.now()
): boolean {
  if (typeof lastRefreshedAt !== "number" || !Number.isFinite(lastRefreshedAt)) {
    return true;
  }
  return now - lastRefreshedAt >= VIEWCOUNT_REFRESH_INTERVAL_MS;
}

function sanitizePersistedColumn(raw: unknown): PersistedColumnState | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as {
    id?: unknown;
    handleInput?: unknown;
    currentHandle?: unknown;
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
      watchedVideos: sanitizeWatchedVideos(candidate.watchedVideos),
      viewCountRefreshedAtByVideoId: {},
      videoFilter:
        candidate.videoFilter === "all" ||
        candidate.videoFilter === "new" ||
        candidate.videoFilter === "watched"
          ? candidate.videoFilter
          : "new",
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
    watchedVideos: {},
    viewCountRefreshedAtByVideoId: {},
    videoFilter: "new",
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
    watchedVideos?: unknown;
    viewCountRefreshedAtByVideoId?: unknown;
    videoFilter?: unknown;
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
  return createBoardState(board.name, {
    id: board.id,
    kind: board.kind === "saved" ? "saved" : "channels",
    columns: board.columns.map((column) =>
      createColumnState({
        id: column.id,
        handleInput: column.handleInput,
        currentHandle: column.currentHandle,
        channelThumbnailUrl: column.channelThumbnailUrl,
        videos: column.videos,
        lastFetchAt: column.lastFetchAt,
        savedSortMode: column.savedSortMode ?? DEFAULT_SAVED_SORT_MODE,
        savedAddedAtByVideoId: column.savedAddedAtByVideoId ?? {},
        savedManualOrder: column.savedManualOrder ?? []
      })
    ),
    watchedVideos: board.watchedVideos,
    viewCountRefreshedAtByVideoId: board.viewCountRefreshedAtByVideoId,
    videoFilter: board.videoFilter,
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
    return "--.--.--";
  }

  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
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

function formatVideoMeta(video: VideoItem): string {
  const dateLabel = video.publishedAt ? formatPublishedDate(video.publishedAt) : "--.--.--";
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
  return now - days * 24 * 60 * 60 * 1000;
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
    try {
      unique.add(normalizeHandle(token));
    } catch {
      // Ignore invalid handles in bulk mode.
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

function App() {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const videoModalWrapRef = useRef<HTMLDivElement | null>(null);
  const fallbackIframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const playerReadyRef = useRef(false);
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
  const [errorLogs, setErrorLogs] = useState<ErrorLogEntry[]>(readStoredErrorLogs);
  const [videoStatsBackfillInFlight, setVideoStatsBackfillInFlight] = useState<string[]>(
    []
  );
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
        watchedVideos: board.watchedVideos,
        viewCountRefreshedAtByVideoId: board.viewCountRefreshedAtByVideoId,
        videoFilter: board.videoFilter,
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
    if (boardState?.kind === "saved") {
      setColumn(boardId, columnId, (prev) => ({ ...prev, loading: true, error: null }));
      try {
        const now = Date.now();
        const ids = (boardState.columns.find((column) => column.id === columnId)?.videos ?? [])
          .filter(
            (video) =>
              video.durationSeconds === null ||
              typeof video.durationSeconds === "undefined" ||
              shouldRefreshViewCount(
                boardState.viewCountRefreshedAtByVideoId[video.videoId],
                now
              )
          )
          .map((video) => video.videoId);
        if (ids.length === 0) {
          setColumn(boardId, columnId, (prev) => ({
            ...prev,
            loading: false,
            error: null,
            lastFetchAt: new Date().toLocaleString()
          }));
          return;
        }
        const stats = await fetchVideoStatsByVideoIds(ids);
        const refreshedAt = Date.now();
        setColumn(boardId, columnId, (prev) => ({
          ...prev,
          loading: false,
          error: null,
          videos: prev.videos.map((video) => ({
            ...video,
            viewCount: stats[video.videoId]?.viewCount ?? video.viewCount,
            durationSeconds:
              typeof video.durationSeconds === "number"
                ? video.durationSeconds
                : stats[video.videoId]?.durationSeconds ?? null
          })),
          lastFetchAt: new Date().toLocaleString()
        }));
        setBoard(boardId, (board) => ({
          ...board,
          viewCountRefreshedAtByVideoId: {
            ...board.viewCountRefreshedAtByVideoId,
            ...Object.fromEntries(ids.map((videoId) => [videoId, refreshedAt]))
          }
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to refresh videos.";
        appendFetchErrorLog(boardId, columnId, message);
        setColumn(boardId, columnId, (prev) => ({
          ...prev,
          loading: false,
          error: message
        }));
      }
      return;
    }

    setColumn(boardId, columnId, (prev) => ({ ...prev, loading: true, error: null }));

    try {
      const normalized = normalizeHandle(handle);
      const { videos, channelThumbnailUrl } = await getLatestVideosAndChannelByHandle(
        normalized,
        DEFAULT_LIMIT
      );
      const boardState = boards.find((board) => board.id === boardId);
      const currentColumn = boardState?.columns.find((column) => column.id === columnId);
      const boardWatchedVideos = boardState?.watchedVideos ?? {};
      const boardViewRefreshedAt = boardState?.viewCountRefreshedAtByVideoId ?? {};
      const cutoffTime = getWindowCutoffTime(STORAGE_VIDEO_WINDOW_DAYS);
      const nextChannelThumbnailUrl =
        channelThumbnailUrl || videos[0]?.thumbnailUrl || "";
      const now = Date.now();
      const previousVideosById = new Map(
        (currentColumn?.videos ?? []).map((video) => [video.videoId, video])
      );
      const idsToRefresh = videos
        .filter((video) => getVideoPublishedTime(video) >= cutoffTime)
        .filter((video) => {
          const previousVideo = previousVideosById.get(video.videoId);
          if (!previousVideo) {
            return true;
          }
          if (
            previousVideo.durationSeconds === null ||
            typeof previousVideo.durationSeconds === "undefined"
          ) {
            return true;
          }
          return (
            previousVideo.viewCount === null ||
            shouldRefreshViewCount(boardViewRefreshedAt[video.videoId], now)
          );
        })
        .map((video) => video.videoId);
      const idsToRefreshSet = new Set(idsToRefresh);
      const statsByVideoId =
        idsToRefresh.length > 0 ? await fetchVideoStatsByVideoIds(idsToRefresh) : {};
      setColumn(boardId, columnId, (prev) => ({
        ...prev,
        loading: false,
        error: null,
        videos: (() => {
          const mergedById = new Map<string, VideoItem>();
          const prevById = new Map(prev.videos.map((video) => [video.videoId, video]));

          videos.forEach((video) => {
            if (getVideoPublishedTime(video) >= cutoffTime) {
              const previousVideo = prevById.get(video.videoId);
              const stats = statsByVideoId[video.videoId];
              if (!previousVideo) {
                mergedById.set(video.videoId, {
                  ...video,
                  viewCount: stats?.viewCount ?? video.viewCount,
                  durationSeconds: stats?.durationSeconds ?? video.durationSeconds ?? null
                });
                return;
              }
              const refreshDue = idsToRefreshSet.has(video.videoId);
              const mergedVideo: VideoItem = {
                ...previousVideo,
                ...video,
                viewCount: refreshDue
                  ? (stats?.viewCount ?? previousVideo.viewCount)
                  : previousVideo.viewCount,
                durationSeconds:
                  typeof previousVideo.durationSeconds === "number"
                    ? previousVideo.durationSeconds
                    : stats?.durationSeconds ?? video.durationSeconds ?? null
              };
              mergedById.set(video.videoId, mergedVideo);
            }
          });

          prev.videos.forEach((video) => {
            const isWatched = boardWatchedVideos[video.videoId] === true;
            const isWithinWindow = getVideoPublishedTime(video) >= cutoffTime;
            if (isWatched || !isWithinWindow) {
              return;
            }
            const existing = mergedById.get(video.videoId);
            if (!existing) {
              mergedById.set(video.videoId, video);
              return;
            }
            if (existing.viewCount === null && video.viewCount !== null) {
              mergedById.set(video.videoId, { ...existing, viewCount: video.viewCount });
            }
            if (
              (existing.durationSeconds === null ||
                typeof existing.durationSeconds === "undefined") &&
              typeof video.durationSeconds === "number"
            ) {
              const latest = mergedById.get(video.videoId) ?? existing;
              mergedById.set(video.videoId, {
                ...latest,
                durationSeconds: video.durationSeconds
              });
            }
          });

          return [...mergedById.values()].sort(
            (a, b) => getVideoPublishedTime(b) - getVideoPublishedTime(a)
          );
        })(),
        currentHandle: normalized,
        channelThumbnailUrl:
          nextChannelThumbnailUrl || prev.channelThumbnailUrl || "",
        lastFetchAt: new Date().toLocaleString()
      }));
      if (idsToRefresh.length > 0) {
        const refreshedAt = Date.now();
        setBoard(boardId, (board) => ({
          ...board,
          viewCountRefreshedAtByVideoId: {
            ...board.viewCountRefreshedAtByVideoId,
            ...Object.fromEntries(
              [...new Set(idsToRefresh)].map((videoId) => [videoId, refreshedAt])
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
      return;
    }
    setBoard(activeBoard.id, (board) => ({
      ...board,
      columns: [...board.columns, createColumnState()]
    }));
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
      columns: [...board.columns, ...created]
    }));
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
    if (!activeBoard) {
      return;
    }
    columns.forEach((column) => {
      if (activeBoard.kind === "saved") {
        runFetch(activeBoard.id, column.id, column.handleInput);
        return;
      }
      const rawHandle = column.handleInput.trim();
      if (rawHandle.length > 0) {
        runFetch(activeBoard.id, column.id, column.handleInput);
      }
    });
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
    const feedbackKey = `video-meta-refresh-${videoId}`;
    const previousVideo = boards
      .flatMap((board) => board.columns)
      .flatMap((column) => column.videos)
      .find((video) => video.videoId === videoId);
    setVideoStatsBackfillInFlight((prev) => [...prev, videoId]);
    message.open({
      key: feedbackKey,
      type: "loading",
      content: "REFRESHING METADATA",
      duration: 0
    });
    try {
      const stats = await fetchVideoStatsByVideoIds([videoId]);
      const nextStats = stats[videoId];
      if (!nextStats) {
        message.open({
          key: feedbackKey,
          type: "warning",
          content: "NO METADATA FOUND",
          duration: 2
        });
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
      message.open({
        key: feedbackKey,
        type: didChange ? "success" : typeof nextStats.durationSeconds === "number" ? "info" : "warning",
        content: didChange
          ? "METADATA UPDATED"
          : typeof nextStats.durationSeconds === "number"
            ? "METADATA ALREADY CURRENT"
            : "DURATION NOT RETURNED",
        duration: 2
      });
    } catch (error) {
      const messageText =
        error instanceof Error && error.message ? error.message.toUpperCase() : "METADATA REFRESH FAILED";
      message.open({
        key: feedbackKey,
        type: "error",
        content: messageText,
        duration: 3
      });
    } finally {
      setVideoStatsBackfillInFlight((prev) => prev.filter((item) => item !== videoId));
    }
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

    const cutoffTime = getWindowCutoffTime(videoWindowDays);
    const mergedById = new Map<string, VideoItem>();
    columns.forEach((column) => {
      const sourceVideos =
        activeBoard.kind === "saved" ? sortSavedVideosByMode(column) : column.videos;
      sourceVideos.forEach((video) => {
        if (getVideoPublishedTime(video) >= cutoffTime) {
          if (!mergedById.has(video.videoId)) {
            mergedById.set(video.videoId, video);
          }
        }
      });
    });

    const queue = [...mergedById.values()]
      .filter((video) => {
        const isWatched = watchedVideos[video.videoId] === true;
        if (videoFilter === "all") {
          return true;
        }
        if (videoFilter === "watched") {
          return isWatched;
        }
        return !isWatched;
      });
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
    const cutoffTime = getWindowCutoffTime(videoWindowDays);
    const sourceVideos =
      activeBoard?.kind === "saved" ? sortSavedVideosByMode(column) : [...column.videos];
    const queue = sourceVideos
      .filter((video) => {
        if (getVideoPublishedTime(video) < cutoffTime) {
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
    const nextName = channelNameInput.trim();
    if (nextName.length === 0) {
      return;
    }
    setColumn(activeBoard.id, editingChannelColumnId, (prev) => ({
      ...prev,
      handleInput: nextName
    }));
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

  return (
    <main className="app-shell">
      <div className="columns-nav">
        <img
          src={TOP_BAR_LOGO_SRC}
          alt="Logo"
          className="top-bar-logo"
        />
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
                      E
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
        <Button
          type="primary"
          htmlType="button"
          onClick={fetchAllColumns}
          aria-label="Fetch all channels"
          className="nav-btn"
        >
          <span className="btn-icon btn-icon-fetch" aria-hidden />
        </Button>
        <Button
          htmlType="button"
          onClick={playAllVideos}
          aria-label="Play all videos"
          className="nav-btn"
        >
          <span className="btn-icon btn-icon-play" aria-hidden />
        </Button>
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
          listHeight={isSavedBoardActive ? 360 : 256}
          options={(isSavedBoardActive
            ? SAVED_VIDEO_WINDOW_OPTIONS
            : CHANNEL_VIDEO_WINDOW_OPTIONS
          ).map((days) => ({
            value: days,
            label: days === "all" ? "ALL" : `${days}D`
          }))}
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
            {columns.map((column, index) => {
              const cutoffTime = getWindowCutoffTime(videoWindowDays);
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
                if (getVideoPublishedTime(video) < cutoffTime) {
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
                <article key={column.id} className="channel-column">
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
                        disabled={index === columns.length - 1 || column.loading}
                        aria-label={`Move column ${index + 1} right`}
                        className="column-move-btn"
                      >
                        {"›"}
                      </Button>
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
                        <Text className="column-video-count">
                          {filteredVideos.length}
                        </Text>
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
                      {isSavedBoardActive ? (
                        <Button
                          htmlType="button"
                          onClick={() => openRemoveAllSavedColumnModal(column)}
                          disabled={column.loading || column.videos.length === 0}
                          aria-label={`Remove all videos from list ${index + 1}`}
                          className="remove-column-btn"
                        >
                          <span className="btn-icon btn-icon-remove-all" aria-hidden />
                        </Button>
                      ) : null}
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
                          disabled={column.loading || filteredVideos.length === 0}
                          aria-label={`Mark all shown videos in channel ${index + 1} as ${
                            videoFilter === "watched" ? "new" : "watched"
                          }`}
                          className="bulk-watch-column-btn"
                        >
                          {videoFilter === "watched" ? (
                            <span className="btn-icon btn-icon-undo" aria-hidden />
                          ) : (
                            <span className="btn-icon btn-icon-check-all" aria-hidden />
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
                          {isSavedBoardActive ? (
                            <img
                              src={SAVED_LIST_PLACEHOLDER_ICON}
                              alt=""
                              className="channel-avatar-placeholder-icon"
                            />
                          ) : (
                            <img
                              src={CHANNEL_PLACEHOLDER_ICON}
                              alt=""
                              className="channel-avatar-placeholder-icon"
                            />
                          )}
                        </div>
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
                      <Button
                        htmlType="button"
                        onClick={() =>
                          runFetch(activeBoardId, column.id, column.handleInput)
                        }
                        disabled={
                          column.loading ||
                          (!isSavedBoardActive && !hasHandleInput) ||
                          (isSavedBoardActive && column.videos.length === 0)
                        }
                        loading={column.loading}
                        aria-label={`Fetch column ${index + 1}`}
                        className="inline-fetch-btn"
                      >
                        <span className="btn-icon btn-icon-fetch" aria-hidden />
                      </Button>
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
                                    {formatVideoMeta(video)}
                                    {isMetaRefreshInFlight ? " | ..." : ""}
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
              <Button
                htmlType="button"
                onClick={addColumn}
                aria-label="Add column"
                className="add-column-btn add-column-plus-btn"
              >
                +
              </Button>
              <Button
                htmlType="button"
                onClick={() => setIsBulkModalOpen(true)}
                aria-label="Bulk add channels"
                className="add-column-btn add-column-bulk-btn"
              >
                <img src={PLAYLIST_ADD_ICON} alt="" className="add-column-bulk-icon" />
              </Button>
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
        <Text className="backup-limits-text">
          MAX FETCH LIMIT: 50 VIDEOS | MAX VIDEO AGE: 90 DAYS | MAX SAVED VIDEO AGE: UNLIMITED |{" "}
          {BUILD_INFO_LABEL}
        </Text>
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
          maxLength={30}
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
        title="Remove All Videos"
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
            ? `${bulkWatchColumnAction.markWatched ? "Mark" : "Unmark"} ${
                bulkWatchColumnAction.videoIds.length
              } shown video${
                bulkWatchColumnAction.videoIds.length === 1 ? "" : "s"
              }${bulkWatchColumnAction.channelName ? ` in ${bulkWatchColumnAction.channelName.toUpperCase()}` : ""}?`
            : ""}
        </Text>
      </Modal>
    </main>
  );
}

export default App;
