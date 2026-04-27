import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { flushSync } from "react-dom";
import {
  Alert,
  Button,
  Checkbox,
  Input,
  List,
  Modal,
  Select,
  Space,
  Typography
} from "antd";
import type { FetchState } from "./types/youtube";
import {
  buildChannelAvatarProxyUrl,
  fetchPlaylistDiscoveryPage,
  fetchSummaryByVideoInput,
  fetchTranscriptByVideoInput,
  fetchVideoStatsByVideoIds,
  resolveChannelByInputWithThumbnail,
  resolveChannelByHandleWithThumbnail
} from "./api/youtube";
import type { VideoItem } from "./types/youtube";
import fixtureBoards from "./fixtures/fixture-boards.json";
import { AppTopbar } from "./components/AppTopbar";
import { BoardColumns } from "./components/BoardColumns";
import { BoardSummaryBatchPage, type BoardSummaryBatchItem } from "./components/BoardSummaryBatchModal";
import { BoardSummaryAggregateModal } from "./components/BoardSummaryAggregateModal";
const TranscriptSummaryModal = lazy(() => import("./components/TranscriptSummaryModal"));
import { VideoPlayerModal } from "./components/VideoPlayerModal";
import {
  persistBoardsPayload,
  readStoredActiveBoardId,
  readStoredBoardsPayload
} from "./storage/boardsStorage";
import {
  clearAllCachedSummaries,
  readCachedSummary
} from "./storage/summariesStorage";
import {
  readCachedTranscript,
  writeCachedTranscript
} from "./storage/transcriptsStorage";
import {
  BOARD_RUNTIME_STORAGE_KEY,
  ERROR_LOGS_STORAGE_KEY,
  QUOTA_ESTIMATE_STORAGE_KEY,
  readStoredJson as readProgressStoredJson,
  writeStoredJson as writeProgressStoredJson
} from "./storage/progressStorage";
import {
  appendBoardColumns,
  moveBoardColumnById,
  removeBoardColumnById,
  updateBoardById,
  updateBoardColumnById
} from "./domain/boards";
import {
  collectBoardAssetPreloadUrls,
  collectColumnAvatarPreloadUrls,
  selectChannelThumbnailUrl
} from "./domain/boardAssets";
import {
  CHANNEL_VIDEO_WINDOW_OPTIONS,
  DEFAULT_VIDEO_WINDOW_DAYS,
  SAVED_VIDEO_WINDOW_OPTIONS,
  VIDEO_DURATION_FILTER_OPTIONS,
  formatDurationFilterSummary,
  formatColumnScopeSummary,
  getVideoPublishedTime,
  matchesDurationFilter,
  matchesVideoWindowFilter,
  normalizeColumnScopeFilter,
  normalizeVideoDurationFilter,
  normalizeStoredVideoWindowFilterForKind,
  normalizeVideoWindowFilterForKind,
  resolveColumnScopeFilterSelection,
  resolveVideoDurationFilterSelection,
  type BoardKind,
  type ChannelVideoWindowFilter,
  type VideoDurationFilter,
  type VideoDurationFilterOption,
  type VideoWindowDays,
  type VideoWindowFilter
} from "./domain/filters";
import {
  collectMissingDurationNewVideoIds,
  isVideoMarkedWatched,
  pruneWatchedVideos,
  setWatchedForVideoIds,
  type WatchedVideosMap
} from "./domain/watched";
import {
  addVideoToSavedColumn,
  clearSavedColumnVideos,
  getNextSavedListName,
  moveSavedVideoBetweenColumns,
  moveSavedVideoInManualOrder as moveSavedVideoInManualOrderForColumn,
  normalizeSavedColumnOrderData,
  removeVideoFromSavedColumn,
  sortSavedVideosByMode,
  type SavedSortMode
} from "./domain/savedLists";
import {
  DEFAULT_SUMMARY_PROMPT,
  getDefaultSummaryFormat,
  hashText,
  readCachedSummaryForTranscript,
  useTranscriptSummary,
  writeCachedSummaryForTranscript,
  type SummaryFormat,
  type InlineMetaFeedback,
} from "./hooks/useTranscriptSummary";
import {
  type BoardFilterBoard,
  getBoardFilterDerivedData,
  useBoardFilters
} from "./hooks/useBoardFilters";
import { normalizeHandle } from "./utils/handle";

const { Text } = Typography;
const DEFAULT_COLUMN_COUNT = 3;
const CHANGE_STAMP = "180326090731";
const TOP_BAR_LOGO_SRC = import.meta.env.PROD ? "/svg/logo-prod.svg" : "/svg/logo-dev.svg";
const SAVED_LIST_PLACEHOLDER_ICON = "/svg/placeholder-list.svg";
const CHANNEL_PLACEHOLDER_ICON = "/svg/placeholder-channel.svg";
const BUILD_INFO_LABEL = CHANGE_STAMP;
const LEGACY_HANDLE_STORAGE_KEY = "youtube-watch:handles:v1";
const LEGACY_COLUMNS_STORAGE_KEY = "youtube-watch:columns:v2";
const LEGACY_WATCHED_STORAGE_KEY = "youtube-watch:watched:v1";
const LEGACY_PLAYBACK_RATE_STORAGE_KEY = "youtube-watch:playback-rate:v1";
const BOARDS_PERSIST_DEBOUNCE_MS = 400;
const APP_ROOT_PATH = "/";
const BOARD_SUMMARIES_PATH = "/summaries";
type VideoStatsPatch = {
  viewCount?: number | null;
  durationSeconds?: number | null;
  thumbnailUrl?: string;
  embeddable?: boolean;
};

type VideoFilter = "all" | "new" | "watched";
type PlaylistScope = "all" | "channel";
const SAVED_SORT_MODE_OPTIONS: Array<{ value: SavedSortMode; label: string }> = [
  { value: "time_asc", label: "TIME ↑" },
  { value: "time_desc", label: "TIME ↓" },
  { value: "added_asc", label: "ADDED ↑" },
  { value: "added_desc", label: "ADDED ↓" },
  { value: "manual", label: "MANUAL" }
];
const DEFAULT_SAVED_SORT_MODE: SavedSortMode = "added_desc";
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
  { value: "older_1", label: ">1D" },
  { value: "older_3", label: ">3D" },
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
const BOARD_SELECTOR_PREWARM_BOARD_LIMIT = 3;
const SAVED_BOARD_ID = "saved-board-system";
const SAVED_BOARD_NAME = "SAVED LISTS";

type FixturePayload = {
  boardName: string;
  channels: Array<{
    handle: string;
    channelId: string;
    uploadsPlaylistId: string;
    channelThumbnailUrl: string;
    videos: VideoItem[];
  }>;
  savedLists: Array<{
    name: string;
    videos: VideoItem[];
  }>;
};

const FIXTURE_DATA = fixtureBoards as FixturePayload;

declare global {
  interface Window {
    appAgent?: AppAgentApi;
  }
}

type ColumnState = FetchState & {
  id: string;
  handleInput: string;
  channelId: string;
  uploadsPlaylistId: string;
  channelThumbnailUrl: string;
  lastGoodChannelThumbnailUrl: string;
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
  lastGoodChannelThumbnailUrl?: string;
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
  boardSummaryFormatId: string;
  boardSummaryAggregateFormatId: string;
  columnScopeFilter: string[];
  watchedVideos: WatchedVideosMap;
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
  boardSummaryFormatId?: string;
  boardSummaryAggregateFormatId?: string;
  columnScopeFilter?: string | string[];
  watchedVideos: WatchedVideosMap;
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

type PersistedBoardRuntimeState = Record<
  string,
  {
    viewCountRefreshedAtByVideoId?: Record<string, number>;
  }
>;

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

type BoardSummaryBatchProgress = {
  completed: number;
  total: number;
};

type BoardSummaryBatchTarget = {
  video: VideoItem;
  column: ColumnState;
};

type ActiveVideoSource = "board" | "summaries" | null;

type PendingBoardSummaryBatch = {
  targets: BoardSummaryBatchTarget[];
  promptText: string;
  modelText: string;
  promptCacheKey: string;
  promptHash: string;
};

type BoardSummaryAggregateState = {
  open: boolean;
  loading: boolean;
  error: string | null;
  summaryText: string;
  keyPoints: string[];
  model: string;
  selectedFormatId: string;
  items: BoardSummaryBatchItem[];
};

type QuotaEstimateState = {
  dayKey: string;
  todayUnits: number;
  lastActionUnits: number;
};

type AgentScope = "board" | "channel" | "video";

type AgentActionResult = {
  ok: boolean;
  action: string;
  scope: AgentScope;
  changed?: {
    videoIds?: string[];
    columnIds?: string[];
  };
  data?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
};

type AgentPermission = "read-only" | "safe-write" | "full";

type AppAgentApi = {
  version: string;
  mode: "enabled" | "disabled";
  permission: AgentPermission;
  capabilities: {
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
  };
  readState: () => {
    activeBoardId: string | null;
    activeBoardKind: BoardKind | null;
    selectedFilters: {
      videoFilter: VideoFilter;
      videoWindowDays: VideoWindowFilter;
      videoDurationFilter: VideoDurationFilter;
      columnScopeFilter: string[];
      playbackRate: number;
    } | null;
    shownVideosTotal: number;
    boards: Array<{
      id: string;
      name: string;
      kind: BoardKind;
      columnCount: number;
      columns: Array<{
        id: string;
        handle: string;
        shownVideoCount: number;
        hidden: boolean;
        loading: boolean;
        error: string | null;
        videoIds: string[];
      }>;
    }>;
    visibleColumns: string[];
    hiddenColumns: string[];
  };
  actions: {
    ping: () => Promise<AgentActionResult>;
    selectBoard: (boardId: string) => Promise<AgentActionResult>;
    setFilters: (patch: {
      videoFilter?: VideoFilter;
      videoWindowDays?: VideoWindowFilter;
      videoDurationFilter?: VideoDurationFilter;
      columnScopeFilter?: string[];
      playbackRate?: number;
    }) => Promise<AgentActionResult>;
    fetchAllShownBoardChannels: () => Promise<AgentActionResult>;
    fetchChannel: (columnId: string) => Promise<AgentActionResult>;
    playBoardShownVideos: () => Promise<AgentActionResult>;
    playChannelShownVideos: (columnId: string) => Promise<AgentActionResult>;
    markBoardShownVideosWatched: () => Promise<AgentActionResult>;
    markBoardShownVideosNew: () => Promise<AgentActionResult>;
    markChannelShownVideosWatched: (columnId: string) => Promise<AgentActionResult>;
    markChannelShownVideosNew: (columnId: string) => Promise<AgentActionResult>;
    markVideoWatched: (videoId: string) => Promise<AgentActionResult>;
    markVideoNew: (videoId: string) => Promise<AgentActionResult>;
    saveVideo: (videoId: string, listId: string) => Promise<AgentActionResult>;
    copyVideoLink: (videoId: string) => Promise<AgentActionResult>;
    openVideo: (videoId: string) => Promise<AgentActionResult>;
  };
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
    lastGoodChannelThumbnailUrl: "",
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

function readLegacyStoredWatchedVideos(): WatchedVideosMap {
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

    const now = Date.now();
    return Object.fromEntries(
      Object.entries(parsed).flatMap((entry): Array<[string, number]> => {
        if (typeof entry[0] !== "string") {
          return [];
        }
        if (typeof entry[1] === "number" && Number.isFinite(entry[1])) {
          return [[entry[0], entry[1]]];
        }
        if (entry[1] === true) {
          return [[entry[0], now]];
        }
        return [];
      })
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

function sanitizeWatchedVideos(raw: unknown): WatchedVideosMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const now = Date.now();
  return Object.fromEntries(
    Object.entries(raw).flatMap((entry): Array<[string, number]> => {
      if (typeof entry[0] !== "string") {
        return [];
      }
      if (typeof entry[1] === "number" && Number.isFinite(entry[1])) {
        return [[entry[0], entry[1]]];
      }
      if (entry[1] === true) {
        return [[entry[0], now]];
      }
      return [];
    })
  );
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

function normalizePersistedVideo(video: VideoItem): VideoItem {
  return {
    videoId: video.videoId,
    title: video.title,
    publishedAt: video.publishedAt,
    durationSeconds:
      typeof video.durationSeconds === "number" && Number.isFinite(video.durationSeconds)
        ? video.durationSeconds
        : null,
    thumbnailUrl: video.thumbnailUrl,
    channelTitle: video.channelTitle,
    videoUrl: video.videoUrl,
    viewCount:
      typeof video.viewCount === "number" && Number.isFinite(video.viewCount)
        ? video.viewCount
        : null
  };
}

function sanitizePersistedBoardRuntime(raw: unknown): PersistedBoardRuntimeState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(raw).flatMap(([boardId, value]) => {
      if (typeof boardId !== "string" || !value || typeof value !== "object" || Array.isArray(value)) {
        return [];
      }
      const entry = value as { viewCountRefreshedAtByVideoId?: unknown };
      return [
        [
          boardId,
          {
            viewCountRefreshedAtByVideoId: sanitizeNumericMap(entry.viewCountRefreshedAtByVideoId)
          }
        ]
      ];
    })
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
    lastGoodChannelThumbnailUrl?: unknown;
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
    !(
      typeof candidate.lastGoodChannelThumbnailUrl === "string" ||
      typeof candidate.lastGoodChannelThumbnailUrl === "undefined"
    ) ||
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
    lastGoodChannelThumbnailUrl: candidate.lastGoodChannelThumbnailUrl ?? "",
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
    boardSummaryFormatId: "",
    boardSummaryAggregateFormatId: "",
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

function cloneVideo(video: VideoItem): VideoItem {
  return {
    ...video
  };
}

function createFixtureBoardsState(): { boards: BoardState[]; activeBoardId: string } {
  const channelColumns = FIXTURE_DATA.channels.map((channel, index) =>
    createColumnState({
      id: `fixture-channel-${index + 1}`,
      handleInput: channel.handle,
      currentHandle: channel.handle,
      channelId: channel.channelId,
      uploadsPlaylistId: channel.uploadsPlaylistId,
      channelThumbnailUrl: channel.channelThumbnailUrl,
      lastGoodChannelThumbnailUrl: channel.channelThumbnailUrl,
      videos: [],
      lastFetchAt: null
    })
  );

  const channelBoard = createBoardState(FIXTURE_DATA.boardName, {
    id: "fixture-board-main",
    kind: "channels",
    columns: channelColumns,
    columnScopeFilter: [COLUMN_SCOPE_ALL],
    watchedVideos: {},
    viewCountRefreshedAtByVideoId: {},
    videoFilter: "new",
    videoDurationFilter: ["all"],
    videoWindowDays: 90,
    defaultPlaybackRate: 1.5
  }, 0);

  const savedColumns = FIXTURE_DATA.savedLists.map((list, index) =>
    createColumnState({
      id: `fixture-list-${index + 1}`,
      handleInput: list.name,
      currentHandle: "",
      channelId: "",
      uploadsPlaylistId: "",
      channelThumbnailUrl: "",
      lastGoodChannelThumbnailUrl: "",
      videos: list.videos.map(cloneVideo),
      savedSortMode: DEFAULT_SAVED_SORT_MODE,
      savedAddedAtByVideoId: Object.fromEntries(
        list.videos.map((video, offset) => [video.videoId, Date.now() - offset])
      ),
      savedManualOrder: list.videos.map((video) => video.videoId)
    })
  );

  const savedBoard = createSavedBoardState({
    columns: savedColumns.length > 0 ? savedColumns : [createSavedListColumn([])],
    watchedVideos: {}
  });

  const boards = ensureSavedBoard([channelBoard, savedBoard]);
  return {
    boards,
    activeBoardId: channelBoard.id
  };
}

function getFixtureChannelByHandle(
  rawHandle: string
): FixturePayload["channels"][number] | null {
  try {
    const normalized = normalizeHandle(rawHandle).toUpperCase();
    return FIXTURE_DATA.channels.find((channel) => channel.handle.toUpperCase() === normalized) ?? null;
  } catch {
    return null;
  }
}

function getNextBoardName(boards: BoardState[]): string {
  let index = 1;
  while (boards.some((board) => board.name === `BOARD ${index}`)) {
    index += 1;
  }
  return `BOARD ${index}`;
}

function toPersistedColumns(columns: ColumnState[]): PersistedColumnState[] {
  return columns.map((column) => {
    const persisted: PersistedColumnState = {
      id: column.id,
      handleInput: column.handleInput,
      currentHandle: column.currentHandle,
      channelThumbnailUrl: column.channelThumbnailUrl,
      lastGoodChannelThumbnailUrl: column.lastGoodChannelThumbnailUrl,
      videos: column.videos.map(normalizePersistedVideo),
      lastFetchAt: column.lastFetchAt
    };

    if (column.channelId) {
      persisted.channelId = column.channelId;
    }
    if (column.uploadsPlaylistId) {
      persisted.uploadsPlaylistId = column.uploadsPlaylistId;
    }
    if (column.savedSortMode !== DEFAULT_SAVED_SORT_MODE) {
      persisted.savedSortMode = column.savedSortMode;
    }
    if (Object.keys(column.savedAddedAtByVideoId).length > 0) {
      persisted.savedAddedAtByVideoId = column.savedAddedAtByVideoId;
    }
    if (column.savedManualOrder.length > 0) {
      persisted.savedManualOrder = column.savedManualOrder;
    }

    return persisted;
  });
}

function toPersistedBoards(boards: BoardState[]): PersistedBoardState[] {
  const presentVideoIds = new Set<string>();
  boards.forEach((board) => {
    board.columns.forEach((column) => {
      column.videos.forEach((video) => {
        presentVideoIds.add(video.videoId);
      });
    });
  });
  return boards.map((board) => {
    const persisted: PersistedBoardState = {
      id: board.id,
      name: board.name,
      kind: board.kind,
      columns: toPersistedColumns(board.columns),
      watchedVideos: pruneWatchedVideos(board.watchedVideos, presentVideoIds),
      videoFilter: board.videoFilter,
      videoWindowDays: board.videoWindowDays,
      defaultPlaybackRate: board.defaultPlaybackRate
    };

    if (board.boardSummaryFormatId.trim().length > 0) {
      persisted.boardSummaryFormatId = board.boardSummaryFormatId.trim();
    }
    if (board.boardSummaryAggregateFormatId.trim().length > 0) {
      persisted.boardSummaryAggregateFormatId = board.boardSummaryAggregateFormatId.trim();
    }
    if (!(board.columnScopeFilter.length === 1 && board.columnScopeFilter[0] === COLUMN_SCOPE_ALL)) {
      persisted.columnScopeFilter = board.columnScopeFilter;
    }
    if (!(board.videoDurationFilter.length === 1 && board.videoDurationFilter[0] === "all")) {
      persisted.videoDurationFilter = board.videoDurationFilter;
    }

    return persisted;
  });
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
    boardSummaryFormatId?: unknown;
    boardSummaryAggregateFormatId?: unknown;
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
    boardSummaryFormatId:
      typeof candidate.boardSummaryFormatId === "string" ? candidate.boardSummaryFormatId : "",
    boardSummaryAggregateFormatId:
      typeof candidate.boardSummaryAggregateFormatId === "string"
        ? candidate.boardSummaryAggregateFormatId
        : "",
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
    videoWindowDays: normalizeStoredVideoWindowFilterForKind(kind, candidate.videoWindowDays),
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
      lastGoodChannelThumbnailUrl: column.lastGoodChannelThumbnailUrl ?? "",
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
    boardSummaryFormatId: board.boardSummaryFormatId ?? "",
    boardSummaryAggregateFormatId: board.boardSummaryAggregateFormatId ?? "",
    columnScopeFilter: normalizeColumnScopeFilter(
      board.columnScopeFilter,
      restoredColumns,
      COLUMN_SCOPE_ALL,
      COLUMN_SCOPE_NOT_EMPTY
    ),
    watchedVideos: board.watchedVideos,
    viewCountRefreshedAtByVideoId: board.viewCountRefreshedAtByVideoId,
    videoFilter: board.videoFilter,
    videoDurationFilter: normalizeVideoDurationFilter(board.videoDurationFilter),
    videoWindowDays: board.videoWindowDays,
    defaultPlaybackRate: board.defaultPlaybackRate
  });
}

function readStoredBoards(): BoardState[] {
  const boards = readStoredBoardsPayload()
    .map((item) => sanitizePersistedBoard(item))
    .filter((item): item is PersistedBoardState => item !== null)
    .map((board) => fromPersistedBoard(board));
  return boards.length > 0 ? ensureSavedBoard(boards) : [];
}

function readStoredBoardRuntime(): PersistedBoardRuntimeState {
  return sanitizePersistedBoardRuntime(
    readProgressStoredJson<unknown>(BOARD_RUNTIME_STORAGE_KEY, {})
  );
}

function isFixtureModeEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).get("fixture") === "1";
}

function normalizeAppPath(pathname: string): string {
  return pathname === BOARD_SUMMARIES_PATH ? BOARD_SUMMARIES_PATH : APP_ROOT_PATH;
}

function getInitialBoardsState(): { boards: BoardState[]; activeBoardId: string } {
  const storedBoards = readStoredBoards();
  if (storedBoards.length > 0) {
    const boardRuntime = readStoredBoardRuntime();
    const boardsWithRuntime = storedBoards.map((board) => ({
      ...board,
      viewCountRefreshedAtByVideoId:
        boardRuntime[board.id]?.viewCountRefreshedAtByVideoId ?? board.viewCountRefreshedAtByVideoId
    }));
    const storedActiveBoardId = readStoredActiveBoardId();
    const activeBoardId =
      storedActiveBoardId &&
      boardsWithRuntime.some((board) => board.id === storedActiveBoardId)
        ? storedActiveBoardId
        : boardsWithRuntime[0].id;
    return { boards: boardsWithRuntime, activeBoardId };
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
        lastGoodChannelThumbnailUrl: legacyColumns[index]?.lastGoodChannelThumbnailUrl ?? "",
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

function columnNeedsAvatarRecovery(
  column: Pick<ColumnState, "id" | "handleInput" | "channelThumbnailUrl" | "lastGoodChannelThumbnailUrl">,
  brokenChannelThumbnailKeySet: Set<string>,
  boardId: string
): boolean {
  if (column.handleInput.trim().length === 0) {
    return false;
  }
  if (column.lastGoodChannelThumbnailUrl.trim().length > 0) {
    return false;
  }
  const brokenKey = `${boardId}:${column.id}`;
  return (
    column.channelThumbnailUrl.trim().length === 0 ||
    brokenChannelThumbnailKeySet.has(brokenKey)
  );
}

function buildSummaryPromptCacheKey(prompt: string, model: string): string {
  return `${prompt}\n__MODEL__:${model || ""}`;
}

function resolveBoardSummaryFormat(
  formats: SummaryFormat[],
  preferredFormatId: string
): SummaryFormat {
  const preferred = preferredFormatId.trim()
    ? formats.find((item) => item.id === preferredFormatId.trim()) ?? null
    : null;
  return preferred ?? getDefaultSummaryFormat(formats);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function collectBoardMissingDurationNewVideoIds(board: BoardState): string[] {
  return collectMissingDurationNewVideoIds(
    board.watchedVideos,
    board.columns.flatMap((column) => column.videos)
  );
}

function formatVideoMeta(video: VideoItem): string {
  const dateLabel = video.publishedAt ? formatPublishedDate(video.publishedAt) : "--.--";
  return `${dateLabel} | ${formatDuration(video.durationSeconds)} | ${formatViewCount(video.viewCount)}`;
}

function getWindowCutoffTime(days: VideoWindowFilter, now = Date.now()): number {
  if (
    days === "all" ||
    days === "older_1" ||
    days === "older_3" ||
    days === "older_7" ||
    days === "older_30" ||
    days === "older_60"
  ) {
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

function exitAnyFullscreen(): void {
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  if (typeof doc.exitFullscreen === "function") {
    void doc.exitFullscreen();
    return;
  }
  if (typeof doc.webkitExitFullscreen === "function") {
    void doc.webkitExitFullscreen();
  }
}

function requestElementFullscreen(element: HTMLElement): void {
  const target = element as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  if (typeof target.requestFullscreen === "function") {
    void target.requestFullscreen();
    return;
  }
  if (typeof target.webkitRequestFullscreen === "function") {
    void target.webkitRequestFullscreen();
  }
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
  const parsed = readProgressStoredJson<unknown>(ERROR_LOGS_STORAGE_KEY, []);
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
  const parsed = readProgressStoredJson<unknown>(QUOTA_ESTIMATE_STORAGE_KEY, null);
  if (!parsed || typeof parsed !== "object") {
    return initial;
  }
  const candidate = parsed as {
    dayKey?: unknown;
    todayUnits?: unknown;
    lastActionUnits?: unknown;
  };
  const dayKey = typeof candidate.dayKey === "string" ? candidate.dayKey : initial.dayKey;
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
}

function App() {
  const fixtureMode = isFixtureModeEnabled();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const videoModalWrapRef = useRef<HTMLDivElement | null>(null);
  const transcriptRequestIdRef = useRef(0);
  const videoMetaFeedbackTimeoutsRef = useRef<Record<string, number>>({});
  const linkCopyFeedbackTimeoutRef = useRef<number | null>(null);
  const boardSummaryCopyFeedbackTimeoutRef = useRef<number | null>(null);
  const activeLogoSpinCountRef = useRef(0);
  const preloadedImageUrlsRef = useRef<Set<string>>(new Set());
  const preloadingImageUrlsRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const initialBoardsState = fixtureMode ? createFixtureBoardsState() : getInitialBoardsState();
  const [boards, setBoards] = useState<BoardState[]>(initialBoardsState.boards);
  const [appPath, setAppPath] = useState<string>(() =>
    typeof window === "undefined" ? APP_ROOT_PATH : normalizeAppPath(window.location.pathname)
  );
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
  const [isBoardSummaryBatchRunning, setIsBoardSummaryBatchRunning] = useState(false);
  const [boardSummaryBatchProgress, setBoardSummaryBatchProgress] = useState<BoardSummaryBatchProgress>({
    completed: 0,
    total: 0
  });
  const [boardSummaryBatchItems, setBoardSummaryBatchItems] = useState<BoardSummaryBatchItem[]>([]);
  const [isBoardSummaryBatchPreparing, setIsBoardSummaryBatchPreparing] = useState(false);
  const [isBoardSummaryBatchCopied, setIsBoardSummaryBatchCopied] = useState(false);
  const [pendingBoardSummaryBatch, setPendingBoardSummaryBatch] = useState<PendingBoardSummaryBatch | null>(null);
  const [boardSummaryAggregateState, setBoardSummaryAggregateState] =
    useState<BoardSummaryAggregateState | null>(null);
  const [isBoardSummaryAggregateCopied, setIsBoardSummaryAggregateCopied] = useState(false);
  const boardSummaryBatchRunIdRef = useRef(0);
  const boardSummaryAggregateCopyFeedbackTimeoutRef = useRef<number | null>(null);
  const [pendingSummarySaveRemovalVideoId, setPendingSummarySaveRemovalVideoId] = useState<string | null>(null);
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
  const [isDeleteSummariesModalOpen, setIsDeleteSummariesModalOpen] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [isLogoSpinning, setIsLogoSpinning] = useState(false);
  const [errorLogs, setErrorLogs] = useState<ErrorLogEntry[]>(readStoredErrorLogs);
  const [quotaEstimate, setQuotaEstimate] = useState<QuotaEstimateState>(readStoredQuotaEstimate);
  const [fetchAllVisibleColumnIdsByBoard, setFetchAllVisibleColumnIdsByBoard] = useState<
    Record<string, string[]>
  >({});
  const [fetchAllErrorVisibleColumnIdsByBoard, setFetchAllErrorVisibleColumnIdsByBoard] =
    useState<Record<string, string[]>>({});
  const [videoStatsBackfillInFlight, setVideoStatsBackfillInFlight] = useState<string[]>(
    []
  );
  const [videoMetaFeedbackById, setVideoMetaFeedbackById] = useState<
    Record<string, InlineMetaFeedback>
  >({});
  const [videoThumbnailFallbackUrlById, setVideoThumbnailFallbackUrlById] = useState<
    Record<string, string>
  >({});
  const [copiedLinkVideoId, setCopiedLinkVideoId] = useState<string | null>(null);
  const [bulkInput, setBulkInput] = useState("");
  const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null);
  const [activeVideoSource, setActiveVideoSource] = useState<ActiveVideoSource>(null);
  const bulkInputDraftRef = useRef("");
  const renameBoardInputDraftRef = useRef("");
  const savedListNameDraftRef = useRef("");
  const channelNameDraftRef = useRef("");
  const {
    transcriptVideo,
    summaryHydrating,
    transcriptHydrating,
    transcriptLoading,
    transcriptText,
    transcriptError,
    transcriptViewMode,
    isTranscriptCopied,
    summaryLoading,
    summaryText,
    summaryKeyPoints,
    summaryError,
    summaryModel,
    isPublishingSummary,
    publishSummaryFeedback,
    summaryFormats,
    summaryModelPresets,
    activeSummaryFormat,
    activeSummaryFormatId,
    isSummaryPromptEditMode,
    editingSummaryFormatId,
    summaryFormatNameDraft,
    summaryPromptDraft,
    summaryFormatModelDraft,
    isNewSummaryModelDraftMode,
    summaryFormatDefaultDraft,
    hasPublishableSummary,
    isSummaryBusy,
    setSummaryFormatNameDraft,
    setSummaryPromptDraft,
    setSummaryFormatModelDraft,
    setSummaryFormats,
    setIsNewSummaryModelDraftMode,
    setSummaryFormatDefaultDraft,
    setActiveSummaryFormatId,
    setIsSummaryPromptEditMode,
    cancelSummaryFormatEditing,
    clearPublishFeedback,
    openTranscript,
    closeTranscriptModal,
    handleTranscriptViewModeChange,
    copyTranscriptText,
    regenerateSummary,
    publishCurrentVideoSummary,
    openSummaryFormatEditor,
    moveSummaryFormat,
    removeSummaryModelPreset,
    saveSummaryPromptAndClose,
    deleteSummaryFormatAndClose
  } = useTranscriptSummary();
  const [playlistQueue, setPlaylistQueue] = useState<VideoItem[]>([]);
  const [playlistIndex, setPlaylistIndex] = useState<number>(-1);
  const [playlistScope, setPlaylistScope] = useState<PlaylistScope>("all");
  const [playlistChannelLabel, setPlaylistChannelLabel] = useState<string>("");
  const [playlistOrderLabel, setPlaylistOrderLabel] = useState<string>("NEWEST FIRST");
  const [brokenChannelThumbnailKeys, setBrokenChannelThumbnailKeys] = useState<string[]>(
    []
  );
  const [channelThumbnailRetryAttemptedKeys, setChannelThumbnailRetryAttemptedKeys] =
    useState<string[]>([]);
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
  const isBoardSummariesPage = appPath === BOARD_SUMMARIES_PATH;
  const navigateToAppPath = useCallback((nextPath: string, replace = false): void => {
    if (typeof window === "undefined") {
      return;
    }
    const normalizedPath = normalizeAppPath(nextPath);
    const nextUrl = `${normalizedPath}${window.location.search}${window.location.hash}`;
    if (replace) {
      window.history.replaceState({ appPath: normalizedPath }, "", nextUrl);
    } else if (window.location.pathname !== normalizedPath) {
      window.history.pushState({ appPath: normalizedPath }, "", nextUrl);
    }
    setAppPath(normalizedPath);
  }, []);

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
  const getSourceVideosForBoard = useCallback(
    (board: BoardFilterBoard<ColumnState>, column: ColumnState): VideoItem[] =>
      board.kind === "saved" ? sortSavedVideosByMode(column, getVideoPublishedTime) : column.videos,
    []
  );
  const fetchAllVisibleColumnIds = useMemo(
    () => new Set(fetchAllVisibleColumnIdsByBoard[activeBoardId] ?? []),
    [activeBoardId, fetchAllVisibleColumnIdsByBoard]
  );
  const fetchAllErrorVisibleColumnIds = useMemo(
    () => new Set(fetchAllErrorVisibleColumnIdsByBoard[activeBoardId] ?? []),
    [activeBoardId, fetchAllErrorVisibleColumnIdsByBoard]
  );
  const {
    columnScopeFilter,
    filteredVideosByColumnId,
    shownVideoCountByColumnId,
    visibleColumns,
    hiddenColumns,
    shownVideosTotal,
    visibleColumnIdSet,
    hiddenColumnIdSet,
    columnScopeOptions
  } = useBoardFilters({
    board: activeBoard,
    allValue: COLUMN_SCOPE_ALL,
    notEmptyValue: COLUMN_SCOPE_NOT_EMPTY,
    getSourceVideos: getSourceVideosForBoard,
    forceVisibleColumnIds: fetchAllVisibleColumnIds,
    errorVisibleColumnIds: fetchAllErrorVisibleColumnIds
  });
  const boardSummaryChannelScopeLabel = formatColumnScopeSummary(
    columnScopeFilter,
    isSavedBoardActive,
    activeBoard?.columns ?? [],
    COLUMN_SCOPE_ALL,
    COLUMN_SCOPE_NOT_EMPTY
  );
  const boardSummaryVideoFilterLabel =
    videoFilter === "all" ? "ALL" : videoFilter === "watched" ? "WATCHED" : "NEW";
  const boardSummaryTimeFilterLabel = (
    (isSavedBoardActive ? SAVED_VIDEO_WINDOW_SELECT_OPTIONS : CHANNEL_VIDEO_WINDOW_SELECT_OPTIONS).find(
      (option) => option.value === videoWindowDays
    )?.label ?? String(videoWindowDays)
  );
  const boardSummaryShownVideosLabel = String(shownVideosTotal);
  const boardSummarySelectedFormat = useMemo(
    () => resolveBoardSummaryFormat(summaryFormats, activeBoard?.boardSummaryFormatId ?? ""),
    [activeBoard?.boardSummaryFormatId, summaryFormats]
  );
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
  const getShownVideosForColumn = (column: ColumnState, _now?: number): VideoItem[] =>
    filteredVideosByColumnId.get(column.id) ?? [];
  const shownVideosInBoardOrder = useMemo(
    () =>
      visibleColumns.flatMap((column) =>
        (filteredVideosByColumnId.get(column.id) ?? []).map((video) => ({
          video,
          column
        }))
      ),
    [visibleColumns, filteredVideosByColumnId]
  );
  const channelScopeDropdownListHeight =
    Math.min(columnScopeOptions.length, CHANNEL_SCOPE_DROPDOWN_MAX_VISIBLE) *
      BOARD_DROPDOWN_ITEM_HEIGHT +
    BOARD_DROPDOWN_PADDING;
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const nextUrl = `${appPath}${window.location.search}${window.location.hash}`;
    window.history.replaceState({ appPath }, "", nextUrl);
  }, [appPath]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handlePopState = (): void => {
      setAppPath(normalizeAppPath(window.location.pathname));
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const activeBoardDurationBackfillIds = activeBoard
    ? collectBoardMissingDurationNewVideoIds(activeBoard)
    : [];
  const activeBoardAvatarRefreshIds =
    activeBoard && activeBoard.kind === "channels"
      ? activeBoard.columns
          .filter((column) =>
            columnNeedsAvatarRecovery(column, new Set(brokenChannelThumbnailKeys), activeBoard.id)
          )
          .map((column) => column.id)
      : [];
  const activeBoardDurationBackfillEstimatedQueries = Math.ceil(
    activeBoardDurationBackfillIds.length / 50
  );
  const editingSummaryFormat =
    editingSummaryFormatId !== null
      ? summaryFormats.find((item) => item.id === editingSummaryFormatId) ?? null
      : null;
  const trimmedSummaryFormatNameDraft = summaryFormatNameDraft.trim();
  const normalizedSummaryPromptDraft = summaryPromptDraft.trim() || DEFAULT_SUMMARY_PROMPT;
  const normalizedSummaryModelDraft = summaryFormatModelDraft.trim();
  const hasSummaryPromptChanges =
    editingSummaryFormat === null
      ? trimmedSummaryFormatNameDraft.length > 0 &&
        (normalizedSummaryPromptDraft !== DEFAULT_SUMMARY_PROMPT ||
          normalizedSummaryModelDraft.length > 0 ||
          summaryFormatDefaultDraft !== false)
      : trimmedSummaryFormatNameDraft !== editingSummaryFormat.name ||
        normalizedSummaryPromptDraft !== editingSummaryFormat.prompt ||
        normalizedSummaryModelDraft !== (editingSummaryFormat.model ?? "") ||
        summaryFormatDefaultDraft !== editingSummaryFormat.isDefault;

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
      activeLogoSpinCountRef.current = 0;
    };
  }, []);

  useEffect(() => {
    if (fixtureMode) {
      return;
    }
    writeProgressStoredJson(QUOTA_ESTIMATE_STORAGE_KEY, quotaEstimate);
  }, [fixtureMode, quotaEstimate]);

  useEffect(() => {
    if (fixtureMode) {
      return;
    }
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
  }, [fixtureMode]);

  useEffect(() => {
    if (fixtureMode) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      try {
        const persistedBoards = toPersistedBoards(boards);
        const boardsPayload = JSON.stringify(persistedBoards);
        const didPersist = persistBoardsPayload(
          boardsPayload,
          activeBoardId,
          () => false
        );
        if (!didPersist) {
          // eslint-disable-next-line no-console
          console.warn("Failed to persist boards to localStorage.");
        }
      } catch {
        // Ignore write failures (private mode / restricted environments).
      }
    }, BOARDS_PERSIST_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeBoardId, boards, fixtureMode]);

  useEffect(() => {
    if (fixtureMode) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const runtimePayload: PersistedBoardRuntimeState = Object.fromEntries(
        boards
          .filter((board) => Object.keys(board.viewCountRefreshedAtByVideoId).length > 0)
          .map((board) => [
            board.id,
            {
              viewCountRefreshedAtByVideoId: board.viewCountRefreshedAtByVideoId
            }
          ])
      );
      writeProgressStoredJson(BOARD_RUNTIME_STORAGE_KEY, runtimePayload);
    }, BOARDS_PERSIST_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [boards, fixtureMode]);

  useEffect(() => {
    if (fixtureMode) {
      return;
    }
    writeProgressStoredJson(ERROR_LOGS_STORAGE_KEY, errorLogs.slice(0, 100));
  }, [errorLogs, fixtureMode]);

  useEffect(() => {
    if (pendingBulkFetch.length === 0) {
      return;
    }

    pendingBulkFetch.forEach((target) => {
      runFetch(target.boardId, target.id, target.handle);
    });
    setPendingBulkFetch([]);
  }, [pendingBulkFetch]);

  const setBoard = (
    boardId: string,
    updater: (state: BoardState) => BoardState
  ) => {
    setBoards((previous) => updateBoardById(previous, boardId, updater));
  };

  const setColumn = (
    boardId: string,
    columnId: string,
    updater: (state: ColumnState) => ColumnState
  ) => {
    setBoard(boardId, (board) => ({
      ...updateBoardColumnById(board, columnId, updater)
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
    handle: string,
    options?: { forceRefreshMetadata?: boolean }
  ): Promise<boolean> => {
    startLogoSpin();
    setFetchAllErrorVisibleColumnIdsByBoard((previous) => {
      const boardColumnIds = previous[boardId];
      if (!boardColumnIds || !boardColumnIds.includes(columnId)) {
        return previous;
      }
      const nextBoardColumnIds = boardColumnIds.filter((id) => id !== columnId);
      const next = { ...previous };
      if (nextBoardColumnIds.length > 0) {
        next[boardId] = nextBoardColumnIds;
      } else {
        delete next[boardId];
      }
      return next;
    });
    const boardState = boards.find((board) => board.id === boardId);
    let estimatedQuotaUnits = 0;
    if (boardState?.kind === "saved") {
      recordEstimatedQuotaUsage(0);
      return false;
    }

    if (fixtureMode) {
      setColumn(boardId, columnId, (prev) => ({ ...prev, loading: true, error: null }));
      const fixtureChannel = getFixtureChannelByHandle(handle);
      if (!fixtureChannel) {
        setColumn(boardId, columnId, (prev) => ({
          ...prev,
          loading: false,
          error: "Channel not found."
        }));
        recordEstimatedQuotaUsage(0);
        return false;
      }
      setColumn(boardId, columnId, (prev) => ({
        ...prev,
        loading: false,
        error: null,
        handleInput: fixtureChannel.handle,
        currentHandle: fixtureChannel.handle,
        channelId: fixtureChannel.channelId,
        uploadsPlaylistId: fixtureChannel.uploadsPlaylistId,
        channelThumbnailUrl: fixtureChannel.channelThumbnailUrl,
        lastGoodChannelThumbnailUrl: fixtureChannel.channelThumbnailUrl,
        videos: fixtureChannel.videos.map(cloneVideo),
        lastFetchAt: new Date().toLocaleString()
      }));
      recordEstimatedQuotaUsage(0);
      return true;
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
      const brokenKey = `${boardId}:${columnId}`;
      const shouldForceRefreshMetadata =
        options?.forceRefreshMetadata === true ||
        columnNeedsAvatarRecovery(currentColumn, new Set(brokenChannelThumbnailKeys), boardId);
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
      let previousLastGoodChannelThumbnailUrl = currentColumn.lastGoodChannelThumbnailUrl;
      if (resolvedFromInput) {
        channelId = resolvedFromInput.channelId;
        uploadsPlaylistId = resolvedFromInput.uploadsPlaylistId;
        nextChannelThumbnailUrl = resolvedFromInput.channelThumbnailUrl;
      }

      if (
        !resolvedFromInput &&
        (
          !channelId ||
          !uploadsPlaylistId ||
          currentColumn.currentHandle !== normalized ||
          shouldForceRefreshMetadata
        )
      ) {
        estimatedQuotaUnits += 1; // channels.list for handle resolve + uploads playlist
        const lookup = await resolveChannelByHandleWithThumbnail(normalized);
        channelId = lookup.channelId;
        uploadsPlaylistId = lookup.uploadsPlaylistId;
        nextChannelThumbnailUrl = lookup.channelThumbnailUrl;
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
              durationSeconds: stats?.durationSeconds ?? video.durationSeconds ?? null,
              embeddable: stats?.embeddable ?? video.embeddable
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
        channelThumbnailUrl: nextChannelThumbnailUrl,
        lastGoodChannelThumbnailUrl: isChannelSwitch ? "" : prev.lastGoodChannelThumbnailUrl,
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
        const normalizedNextChannelThumbnailUrl = nextChannelThumbnailUrl.trim();
        if (
          normalizedNextChannelThumbnailUrl &&
          normalizedNextChannelThumbnailUrl === previousLastGoodChannelThumbnailUrl
        ) {
          setBrokenChannelThumbnailKeys((prev) => prev.filter((key) => key !== brokenKey));
          setChannelThumbnailRetryAttemptedKeys((prev) => prev.filter((key) => key !== brokenKey));
        } else if (await preloadImage(buildChannelAvatarProxyUrl(normalizedNextChannelThumbnailUrl))) {
          setColumn(boardId, columnId, (prev) => ({
            ...prev,
            lastGoodChannelThumbnailUrl: normalizedNextChannelThumbnailUrl
          }));
          previousLastGoodChannelThumbnailUrl = normalizedNextChannelThumbnailUrl;
          setBrokenChannelThumbnailKeys((prev) => prev.filter((key) => key !== brokenKey));
          setChannelThumbnailRetryAttemptedKeys((prev) => prev.filter((key) => key !== brokenKey));
        }
      }
      return true;
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
      return false;
    } finally {
      stopLogoSpin();
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
    bulkInputDraftRef.current = "";
    setIsBulkModalOpen(true);
  };

  const removeColumnById = (columnIdToRemove: string): void => {
    if (!activeBoard) {
      return;
    }
    setBoard(activeBoard.id, (board) => {
      const nextColumns = board.columns.filter((column) => column.id !== columnIdToRemove);
      return removeBoardColumnById(
        board,
        columnIdToRemove,
        normalizeColumnScopeFilter(
          board.columnScopeFilter,
          nextColumns,
          COLUMN_SCOPE_ALL,
          COLUMN_SCOPE_NOT_EMPTY
        )
      );
    });
  };

  const moveColumnById = (columnIdToMove: string, direction: "left" | "right"): void => {
    if (!activeBoard) {
      return;
    }
    setBoard(activeBoard.id, (board) => moveBoardColumnById(board, columnIdToMove, direction));
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
      const names = parseBulkListNames(bulkInputDraftRef.current || bulkInput);
      const createdNames =
        names.length > 0
          ? names
          : [getNextSavedListName(activeBoard.columns)];
      const created = createdNames.map((name) =>
        createColumnState({
          handleInput: name.trim().length > 0 ? name : getNextSavedListName(activeBoard.columns)
        })
      );
      setBoard(activeBoard.id, (board) => appendBoardColumns(board, created));
      scrollToColumnsEndSoon();
      setIsBulkModalOpen(false);
      setBulkInput("");
      bulkInputDraftRef.current = "";
      return;
    }

    const handles = parseBulkHandles(bulkInputDraftRef.current || bulkInput);
    if (handles.length === 0) {
      setIsBulkModalOpen(false);
      setBulkInput("");
      bulkInputDraftRef.current = "";
      return;
    }

    const created = handles.map((handle) =>
      createColumnState({ handleInput: handle })
    );
    setBoard(activeBoard.id, (board) =>
      appendBoardColumns(
        board,
        created,
        includeNewColumnsInScope(
          board,
          created.map((column) => column.id)
        )
      )
    );
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
    bulkInputDraftRef.current = "";
  };

  const fetchAllColumns = async (): Promise<void> => {
    if (!activeBoard || activeBoard.kind === "saved") {
      return;
    }
    const boardId = activeBoard.id;
    const targetColumns = activeBoard.columns.filter(
      (column) => column.handleInput.trim().length > 0
    );
    const shouldTemporarilyReveal = columnScopeFilter.includes(COLUMN_SCOPE_NOT_EMPTY);
    startLogoSpin();
    if (shouldTemporarilyReveal) {
      setFetchAllVisibleColumnIdsByBoard((previous) => ({
        ...previous,
        [boardId]: targetColumns.map((column) => column.id)
      }));
      setFetchAllErrorVisibleColumnIdsByBoard((previous) => {
        if (!(boardId in previous)) {
          return previous;
        }
        const next = { ...previous };
        delete next[boardId];
        return next;
      });
    }
    try {
      await Promise.allSettled(
        targetColumns.map((column) => runFetch(boardId, column.id, column.handleInput))
      );
    } finally {
      stopLogoSpin();
    }
  };

  const refreshBoardAvatars = async (): Promise<void> => {
    if (!activeBoard || activeBoard.kind === "saved") {
      return;
    }
    const brokenKeySet = new Set(brokenChannelThumbnailKeys);
    const targetColumns = activeBoard.columns.filter((column) =>
      columnNeedsAvatarRecovery(column, brokenKeySet, activeBoard.id)
    );
    if (targetColumns.length === 0) {
      return;
    }
    startLogoSpin();
    try {
      await Promise.allSettled(
        targetColumns.map((column) =>
          runFetch(activeBoard.id, column.id, column.handleInput, { forceRefreshMetadata: true })
        )
      );
    } finally {
      stopLogoSpin();
    }
  };

  const launchBoardSummaryBatch = (
    format: SummaryFormat,
    options?: { navigate?: boolean }
  ): void => {
    if (shownVideosInBoardOrder.length === 0) {
      return;
    }

    const promptText = format.prompt.trim() || DEFAULT_SUMMARY_PROMPT;
    const modelText = (format.model ?? "").trim();
    const promptCacheKey = buildSummaryPromptCacheKey(promptText, modelText);
    const promptHash = hashText(promptCacheKey);
    boardSummaryBatchRunIdRef.current += 1;

    flushSync(() => {
      setIsBoardSummaryBatchRunning(true);
      setBoardSummaryBatchProgress({ completed: 0, total: shownVideosInBoardOrder.length });
      setBoardSummaryBatchItems([]);
      setIsBoardSummaryBatchPreparing(true);
      setPendingBoardSummaryBatch({
        targets: shownVideosInBoardOrder.map(({ video, column }) => ({ video, column })),
        promptText,
        modelText,
        promptCacheKey,
        promptHash
      });
    });
    if (options?.navigate !== false) {
      navigateToAppPath(BOARD_SUMMARIES_PATH);
    }
  };

  const startBoardSummaryBatch = (): void => {
    if (shownVideosInBoardOrder.length === 0 || isBoardSummaryBatchRunning || !activeBoard) {
      return;
    }

    const resolvedSummaryFormat = resolveBoardSummaryFormat(
      summaryFormats,
      activeBoard.boardSummaryFormatId
    );
    launchBoardSummaryBatch(resolvedSummaryFormat);
  };

  const changeBoardSummaryFormat = (formatId: string): void => {
    if (!activeBoard) {
      return;
    }
    const nextFormat = summaryFormats.find((item) => item.id === formatId);
    if (!nextFormat) {
      return;
    }

    setBoard(activeBoard.id, (board) => ({
      ...board,
      boardSummaryFormatId: formatId
    }));
    launchBoardSummaryBatch(nextFormat, { navigate: false });
  };

  useEffect(() => {
    if (!isBoardSummariesPage || !pendingBoardSummaryBatch) {
      return;
    }

    const runId = boardSummaryBatchRunIdRef.current;
    const { targets, promptText, modelText, promptCacheKey, promptHash } = pendingBoardSummaryBatch;
    setPendingBoardSummaryBatch(null);

    const initialItems: BoardSummaryBatchItem[] = targets.map(({ video, column }) => ({
      videoId: video.videoId,
      video,
      column,
      status: "loading",
      summary: "",
      keyPoints: [],
      error: null
    }));
    setBoardSummaryBatchItems(initialItems);
    setIsBoardSummaryBatchPreparing(false);

    const concurrency = 2;
    let nextIndex = 0;
    let completed = 0;
    const yieldToBrowser = (): Promise<void> =>
      new Promise((resolve) => {
        window.setTimeout(resolve, 0);
      });

    const updateBatchItem = (
      index: number,
      next: Partial<BoardSummaryBatchItem> & Pick<BoardSummaryBatchItem, "status">
    ): void => {
      if (boardSummaryBatchRunIdRef.current !== runId) {
        return;
      }
      setBoardSummaryBatchItems((previous) =>
        previous.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                ...next
              }
            : item
        )
      );
    };

    const runSingle = async (target: BoardSummaryBatchTarget, index: number): Promise<void> => {
      const { video } = target;
      try {
        const directCachedSummary = await readCachedSummary(video.videoId, promptHash);
        if (directCachedSummary) {
          updateBatchItem(index, {
            status: "done",
            summary: directCachedSummary.summary,
            keyPoints: directCachedSummary.keyPoints,
            error: null
          });
          return;
        }

        let transcriptText = (await readCachedTranscript(video.videoId)) ?? "";
        if (!transcriptText) {
          const transcriptPayload = await fetchTranscriptByVideoInput({
            videoId: video.videoId,
            videoUrl: video.videoUrl
          });
          transcriptText = transcriptPayload.text.trim();
          if (!transcriptText) {
            throw new Error("Transcript unavailable.");
          }
          await writeCachedTranscript(video.videoId, transcriptText);
        }

        const cached = await readCachedSummaryForTranscript(
          video.videoId,
          transcriptText,
          promptCacheKey
        );
        if (cached) {
          updateBatchItem(index, {
            status: "done",
            summary: cached.summary,
            keyPoints: cached.keyPoints,
            error: null
          });
          return;
        }

        updateBatchItem(index, {
          status: "summarizing",
          error: null
        });

        const payload = await fetchSummaryByVideoInput({
          videoId: video.videoId,
          videoUrl: video.videoUrl,
          transcriptText,
          mode: "short",
          prompt: promptText,
          model: modelText || undefined
        });
        const nextSummary = payload.summary.trim();
        if (!nextSummary) {
          throw new Error("No summary.");
        }

        await writeCachedSummaryForTranscript(video.videoId, transcriptText, promptCacheKey, {
          summary: nextSummary,
          keyPoints: [],
          model: payload.model
        });
        updateBatchItem(index, {
          status: "done",
          summary: nextSummary,
          keyPoints: [],
          error: null
        });
      } catch (error) {
        updateBatchItem(index, {
          status: "error",
          summary: "",
          keyPoints: [],
          error: error instanceof Error ? error.message : "Summary failed."
        });
      } finally {
        completed += 1;
        if (boardSummaryBatchRunIdRef.current === runId) {
          setBoardSummaryBatchProgress({ completed, total: targets.length });
        }
      }
    };

    void (async () => {
      try {
        const workers = Array.from({ length: Math.min(concurrency, targets.length) }, async () => {
          while (true) {
            const current = nextIndex;
            nextIndex += 1;
            if (current >= targets.length) {
              return;
            }
            await runSingle(targets[current], current);
            await yieldToBrowser();
          }
        });
        await Promise.all(workers);
      } finally {
        if (boardSummaryBatchRunIdRef.current === runId) {
          setIsBoardSummaryBatchPreparing(false);
          setIsBoardSummaryBatchRunning(false);
        }
      }
    })();
  }, [isBoardSummariesPage, pendingBoardSummaryBatch]);

  const copyBoardSummaryBatchToClipboard = async (): Promise<void> => {
    const normalizedItems = boardSummaryBatchItems
      .map((item) => {
        const keyPoints = item.keyPoints
          .map((point) => point.trim())
          .filter((point) => point.length > 0);
        const textBody =
          item.status === "loading"
            ? "LOADING..."
            : item.status === "summarizing"
              ? "SUMMARIZING..."
              : item.error
                ? item.error
                : [item.summary.trim(), keyPoints.map((point) => `- ${point}`).join("\n")]
                    .filter(Boolean)
                    .join("\n\n")
                    .trim();
        return {
          title: item.video.title.toUpperCase(),
          status: item.status,
          summary: item.summary.trim(),
          keyPoints,
          error: item.error,
          textBody,
          videoUrl: item.video.videoUrl.trim()
        };
      })
      .filter((item) => item.textBody.length > 0);

    const text = normalizedItems
      .map((item) => [item.title, item.textBody, item.videoUrl].filter(Boolean).join("\n\n").trim())
      .join("\n\n\n");

    const htmlBlocks = normalizedItems.map((item) => {
        if (item.status === "loading" || item.status === "summarizing") {
          return [
            '<div>',
            `<h3 style="margin:0 0 8px;font-size:16px;font-weight:700;">${escapeHtml(item.title)}</h3>`,
            `<p style="margin:0;">${escapeHtml(item.textBody)}</p>`,
            "</div>"
          ].join("");
        }
        if (item.error) {
          return [
            '<div>',
            `<h3 style="margin:0 0 8px;font-size:16px;font-weight:700;">${escapeHtml(item.title)}</h3>`,
            `<p style="margin:0;color:#c96c7e;">${escapeHtml(item.error)}</p>`,
            "</div>"
          ].join("");
        }
        const summaryHtml = item.summary
          ? `<p style="margin:0 0 10px;">${escapeHtml(item.summary).replace(/\n/g, "<br />")}</p>`
          : "";
        const keyPointsHtml =
          item.keyPoints.length > 0
            ? `<ul style="margin:0;padding-left:20px;">${item.keyPoints
                .map((point) => `<li>${escapeHtml(point)}</li>`)
                .join("")}</ul>`
            : "";
        const linkHtml = item.videoUrl
          ? `<p style="margin:10px 0 0;"><a href="${escapeHtml(item.videoUrl)}">${escapeHtml(item.videoUrl)}</a></p>`
          : "";
        return [
          '<div>',
          `<h3 style="margin:0 0 8px;font-size:16px;font-weight:700;">${escapeHtml(item.title)}</h3>`,
          summaryHtml,
          keyPointsHtml,
          linkHtml,
          "</div>"
        ].join("");
      });

    const html = `<div>${htmlBlocks.join('<div style="height:24px;"><br /></div>')}</div>`;

    if (!text) {
      return;
    }

    try {
      if (
        navigator.clipboard &&
        typeof navigator.clipboard.write === "function" &&
        typeof ClipboardItem !== "undefined"
      ) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([text], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" })
          })
        ]);
      } else if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
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

    setIsBoardSummaryBatchCopied(true);
    if (boardSummaryCopyFeedbackTimeoutRef.current) {
      window.clearTimeout(boardSummaryCopyFeedbackTimeoutRef.current);
    }
    boardSummaryCopyFeedbackTimeoutRef.current = window.setTimeout(() => {
      setIsBoardSummaryBatchCopied(false);
      boardSummaryCopyFeedbackTimeoutRef.current = null;
    }, 1000);
  };

  const summarizeShownBoardSummaries = async (
    items: BoardSummaryBatchItem[],
    formatId?: string
  ): Promise<void> => {
    const completedItems = items.filter(
      (item) =>
        item.status === "done" &&
        (item.summary.trim().length > 0 || item.keyPoints.some((point) => point.trim().length > 0))
    );

    const resolvedSummaryFormat = resolveBoardSummaryFormat(
      summaryFormats,
      formatId ?? activeBoard?.boardSummaryAggregateFormatId ?? ""
    );
    const selectedFormatId = resolvedSummaryFormat.id;

    setIsBoardSummaryAggregateCopied(false);
    setBoardSummaryAggregateState({
      open: true,
      loading: true,
      error: null,
      summaryText: "",
      keyPoints: [],
      model: "",
      selectedFormatId,
      items
    });

    if (completedItems.length === 0) {
      setBoardSummaryAggregateState({
        open: true,
        loading: false,
        error: "No completed summaries are currently shown.",
        summaryText: "",
        keyPoints: [],
        model: "",
        selectedFormatId,
        items
      });
      return;
    }

    const sourceText = completedItems
      .map((item) => {
        const keyPoints = item.keyPoints
          .map((point) => point.trim())
          .filter((point) => point.length > 0);
        return [
          item.video.title.trim(),
          item.summary.trim(),
          keyPoints.length > 0 ? keyPoints.map((point) => `- ${point}`).join("\n") : ""
        ]
          .filter(Boolean)
          .join("\n\n")
          .trim();
      })
      .filter(Boolean)
      .join("\n\n---\n\n");

    const promptText = [
      "Combine these video summaries into one concise overall summary.",
      resolvedSummaryFormat.prompt.trim() || DEFAULT_SUMMARY_PROMPT
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      const payload = await fetchSummaryByVideoInput({
        videoId: `board-summary-aggregate:${activeBoardId}:${Date.now()}`,
        transcriptText: sourceText,
        mode: "short",
        prompt: promptText,
        model: (resolvedSummaryFormat.model ?? "").trim() || undefined
      });
      const nextSummary = payload.summary.trim();
      if (!nextSummary) {
        throw new Error("No summary.");
      }
      setBoardSummaryAggregateState({
        open: true,
        loading: false,
        error: null,
        summaryText: nextSummary,
        keyPoints: [],
        model: payload.model,
        selectedFormatId,
        items
      });
    } catch (error) {
      setBoardSummaryAggregateState({
        open: true,
        loading: false,
        error: error instanceof Error ? error.message : "Summary failed.",
        summaryText: "",
        keyPoints: [],
        model: "",
        selectedFormatId,
        items
      });
    }
  };

  const handleBoardSummaryAggregateFormatChange = (formatId: string): void => {
    if (!activeBoard || !boardSummaryAggregateState) {
      return;
    }
    setBoard(activeBoard.id, (board) => ({
      ...board,
      boardSummaryAggregateFormatId: formatId
    }));
    void summarizeShownBoardSummaries(boardSummaryAggregateState.items, formatId);
  };

  const copyBoardSummaryAggregate = async (): Promise<void> => {
    const state = boardSummaryAggregateState;
    if (!state) {
      return;
    }
    const text = state.summaryText.trim();
    if (!text) {
      return;
    }
    const renderedSummaryContent = document.querySelector(
      ".board-summary-aggregate-modal .summary-content"
    );
    const fallbackSummaryHtml = state.summaryText.trim()
      ? `<p style="margin:0 0 10px;">${escapeHtml(state.summaryText.trim()).replace(/\n/g, "<br />")}</p>`
      : "";
    const html =
      renderedSummaryContent instanceof HTMLElement
        ? `<div>${renderedSummaryContent.innerHTML}</div>`
        : ["<div>", fallbackSummaryHtml, "</div>"].join("");
    try {
      if (
        navigator.clipboard &&
        typeof navigator.clipboard.write === "function" &&
        typeof ClipboardItem !== "undefined"
      ) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([text], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" })
          })
        ]);
      } else if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
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

    setIsBoardSummaryAggregateCopied(true);
    if (boardSummaryAggregateCopyFeedbackTimeoutRef.current) {
      window.clearTimeout(boardSummaryAggregateCopyFeedbackTimeoutRef.current);
    }
    boardSummaryAggregateCopyFeedbackTimeoutRef.current = window.setTimeout(() => {
      setIsBoardSummaryAggregateCopied(false);
      boardSummaryAggregateCopyFeedbackTimeoutRef.current = null;
    }, 1000);
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
            if (isVideoMarkedWatched(board.watchedVideos, video.videoId)) {
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (activeVideo || event.defaultPrevented) {
        return;
      }
      if (event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        void fetchAllColumns();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (shouldIgnoreShortcutTarget(event.target)) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        if (event.shiftKey) {
          scrollToEdge("start");
        } else {
          scrollColumns("left");
        }
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        if (event.shiftKey) {
          scrollToEdge("end");
        } else {
          scrollColumns("right");
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeVideo, fetchAllColumns]);

  const includeNewColumnsInScope = (board: BoardState, newColumnIds: string[]): string[] => {
    const normalizedScope = normalizeColumnScopeFilter(
      board.columnScopeFilter,
      board.columns,
      COLUMN_SCOPE_ALL,
      COLUMN_SCOPE_NOT_EMPTY
    );
    if (normalizedScope.includes(COLUMN_SCOPE_ALL)) {
      return [COLUMN_SCOPE_ALL];
    }
    if (normalizedScope.includes(COLUMN_SCOPE_NOT_EMPTY)) {
      return [COLUMN_SCOPE_NOT_EMPTY];
    }
    const withoutSpecial = normalizedScope.filter(
      (value) => value !== COLUMN_SCOPE_NOT_EMPTY && value !== COLUMN_SCOPE_ALL
    );
    const merged = [...new Set([...withoutSpecial, ...newColumnIds])];
    return merged.length > 0 ? merged : [COLUMN_SCOPE_ALL];
  };

  const clearFetchAllVisibilityState = useCallback((boardId?: string): void => {
    if (boardId) {
      setFetchAllVisibleColumnIdsByBoard((previous) => {
        if (!(boardId in previous)) {
          return previous;
        }
        const next = { ...previous };
        delete next[boardId];
        return next;
      });
      setFetchAllErrorVisibleColumnIdsByBoard((previous) => {
        if (!(boardId in previous)) {
          return previous;
        }
        const next = { ...previous };
        delete next[boardId];
        return next;
      });
      return;
    }

    setFetchAllVisibleColumnIdsByBoard((previous) =>
      Object.keys(previous).length === 0 ? previous : {}
    );
    setFetchAllErrorVisibleColumnIdsByBoard((previous) =>
      Object.keys(previous).length === 0 ? previous : {}
    );
  }, []);

  useEffect(() => {
    if (Object.keys(fetchAllVisibleColumnIdsByBoard).length === 0) {
      return;
    }

    const nextVisibleByBoard: Record<string, string[]> = {};
    let visibleChanged = false;
    let errorChanged = false;
    const nextErrorByBoard: Record<string, string[]> = {};

    Object.entries(fetchAllErrorVisibleColumnIdsByBoard).forEach(([boardId, columnIds]) => {
      if (columnIds.length > 0) {
        nextErrorByBoard[boardId] = [...columnIds];
      }
    });

    Object.entries(fetchAllVisibleColumnIdsByBoard).forEach(([boardId, columnIds]) => {
      const board = boards.find((item) => item.id === boardId);
      if (!board || board.kind === "saved") {
        visibleChanged = true;
        return;
      }

      const shownVideoCountByColumnId = getBoardFilterDerivedData({
        board,
        allValue: COLUMN_SCOPE_ALL,
        notEmptyValue: COLUMN_SCOPE_NOT_EMPTY,
        getSourceVideos: getSourceVideosForBoard
      }).shownVideoCountByColumnId;

      const remainingColumnIds = columnIds.filter((columnId) => {
        const column = board.columns.find((item) => item.id === columnId);
        if (!column) {
          visibleChanged = true;
          return false;
        }
        if (column.loading) {
          return true;
        }

        const shownCount = shownVideoCountByColumnId.get(columnId) ?? 0;
        visibleChanged = true;

        if (column.error && shownCount === 0) {
          const existing = new Set(nextErrorByBoard[boardId] ?? []);
          if (!existing.has(columnId)) {
            existing.add(columnId);
            nextErrorByBoard[boardId] = [...existing];
            errorChanged = true;
          }
        }

        return false;
      });

      if (remainingColumnIds.length > 0) {
        nextVisibleByBoard[boardId] = remainingColumnIds;
      }
    });

    Object.entries(nextErrorByBoard).forEach(([boardId, columnIds]) => {
      const board = boards.find((item) => item.id === boardId);
      if (!board || board.kind === "saved") {
        delete nextErrorByBoard[boardId];
        errorChanged = true;
        return;
      }

      const shownVideoCountByColumnId = getBoardFilterDerivedData({
        board,
        allValue: COLUMN_SCOPE_ALL,
        notEmptyValue: COLUMN_SCOPE_NOT_EMPTY,
        getSourceVideos: getSourceVideosForBoard
      }).shownVideoCountByColumnId;

      const retainedColumnIds = columnIds.filter((columnId) => {
        const column = board.columns.find((item) => item.id === columnId);
        if (!column || column.loading) {
          errorChanged = true;
          return false;
        }
        if (!column.error) {
          errorChanged = true;
          return false;
        }
        return (shownVideoCountByColumnId.get(columnId) ?? 0) === 0;
      });

      if (retainedColumnIds.length === 0) {
        delete nextErrorByBoard[boardId];
        if (columnIds.length > 0) {
          errorChanged = true;
        }
        return;
      }

      if (retainedColumnIds.length !== columnIds.length) {
        nextErrorByBoard[boardId] = retainedColumnIds;
        errorChanged = true;
      }
    });

    if (visibleChanged) {
      setFetchAllVisibleColumnIdsByBoard(nextVisibleByBoard);
    }
    if (errorChanged) {
      setFetchAllErrorVisibleColumnIdsByBoard(nextErrorByBoard);
    }
  }, [
    boards,
    fetchAllVisibleColumnIdsByBoard,
    fetchAllErrorVisibleColumnIdsByBoard,
    getSourceVideosForBoard
  ]);

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

  const blurActiveTopbarControl = (): void => {
    window.setTimeout(() => {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement) {
        activeElement.blur();
      }
    }, 0);
  };

  const setWatchedStatusAcrossBoards = (
    videoIds: string[],
    watched: boolean
  ): void => {
    if (videoIds.length === 0) {
      return;
    }
    setBoards((previous) =>
      previous.map((board) => {
        return {
          ...board,
          watchedVideos: setWatchedForVideoIds(board.watchedVideos, videoIds, watched)
        };
      })
    );
  };

  const markWatched = (videoId: string): void => {
    if (!activeBoard) {
      return;
    }
    setWatchedStatusAcrossBoards([videoId], true);
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
    setActiveVideoSource(null);
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

  const markWatchedAndAdvanceOrCloseFromSummaries = (): void => {
    const currentVideo = activeVideo;
    const shouldRemove =
      currentVideo !== null &&
      activeVideoSource === "summaries" &&
      activeBoard !== null &&
      !isVideoMarkedWatched(activeBoard.watchedVideos, currentVideo.videoId);

    markWatchedAndAdvanceOrClose();

    if (shouldRemove && currentVideo) {
      removeBoardSummaryBatchItem(currentVideo.videoId);
    }
  };

  const openVideo = (video: VideoItem): void => {
    stopPlaylist();
    setActiveVideo(video);
    setActiveVideoSource("board");
  };

  const openVideoFromSummaries = (video: VideoItem): void => {
    stopPlaylist();
    setActiveVideo(video);
    setActiveVideoSource("summaries");
  };

  const toggleVideoFullscreen = (): void => {
    const fullscreenTarget = videoModalWrapRef.current;
    if (!fullscreenTarget) {
      return;
    }
    try {
      if (document.fullscreenElement) {
        exitAnyFullscreen();
      } else {
        requestElementFullscreen(fullscreenTarget);
      }
    } catch {
      // Ignore unsupported fullscreen requests.
    }
  };

  const getVideoThumbnailSrc = (video: VideoItem): string => {
    return videoThumbnailFallbackUrlById[video.videoId] || video.thumbnailUrl;
  };

  const applyVideoStatsPatch = (videoId: string, patch: VideoStatsPatch): void => {
    if (Object.keys(patch).length === 0) {
      return;
    }

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
                  viewCount: patch.viewCount ?? video.viewCount,
                  durationSeconds: patch.durationSeconds ?? video.durationSeconds ?? null,
                  thumbnailUrl: patch.thumbnailUrl ?? video.thumbnailUrl,
                  embeddable: patch.embeddable ?? video.embeddable
                }
          )
        }))
      }))
    );
    setActiveVideo((previous) =>
      previous && previous.videoId === videoId
        ? {
            ...previous,
            viewCount: patch.viewCount ?? previous.viewCount,
            durationSeconds: patch.durationSeconds ?? previous.durationSeconds ?? null,
            thumbnailUrl: patch.thumbnailUrl ?? previous.thumbnailUrl,
            embeddable: patch.embeddable ?? previous.embeddable
          }
        : previous
    );
  };

  useEffect(() => {
    if (!activeVideo || typeof activeVideo.embeddable === "boolean") {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const stats = await fetchVideoStatsByVideoIds([activeVideo.videoId]);
        const nextStats = stats[activeVideo.videoId];
        if (!nextStats || cancelled) {
          return;
        }
        applyVideoStatsPatch(activeVideo.videoId, nextStats);
      } catch {
        // Leave unknown embeddability videos on the normal iframe path.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeVideo]);

  const handleVideoThumbnailError = (video: VideoItem): void => {
    setVideoThumbnailFallbackUrlById((previous) => {
      if (previous[video.videoId]) {
        return previous;
      }
      return {
        ...previous,
        [video.videoId]: `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`
      };
    });
  };

  const toggleWatched = (videoId: string): void => {
    if (!activeBoard) {
      return;
    }
    const shouldMarkWatched = !isVideoMarkedWatched(activeBoard.watchedVideos, videoId);
    setWatchedStatusAcrossBoards([videoId], shouldMarkWatched);
  };

  const removeBoardSummaryBatchItem = (videoId: string): void => {
    setBoardSummaryBatchItems((previous) =>
      previous.filter((item) => item.videoId !== videoId)
    );
  };

  const toggleWatchedFromSummaries = (videoId: string): void => {
    if (!activeBoard) {
      return;
    }
    const shouldMarkWatched = !isVideoMarkedWatched(activeBoard.watchedVideos, videoId);
    setWatchedStatusAcrossBoards([videoId], shouldMarkWatched);
    if (shouldMarkWatched) {
      removeBoardSummaryBatchItem(videoId);
    }
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
      const nextThumbnailUrl = nextStats.thumbnailUrl ?? previousVideo?.thumbnailUrl;
      applyVideoStatsPatch(videoId, {
        viewCount: nextViewCount,
        durationSeconds: nextDurationSeconds,
        thumbnailUrl: nextThumbnailUrl,
        embeddable: nextStats.embeddable
      });
      setBoards((previous) =>
        previous.map((board) => ({
          ...board,
          viewCountRefreshedAtByVideoId: {
            ...board.viewCountRefreshedAtByVideoId,
            [videoId]: refreshedAt
          }
        }))
      );
      if (nextStats.thumbnailUrl) {
        setVideoThumbnailFallbackUrlById((previous) => {
          if (!previous[videoId]) {
            return previous;
          }
          const next = { ...previous };
          delete next[videoId];
          return next;
        });
      }
      const didChange =
        previousVideo?.viewCount !== nextViewCount ||
        previousVideo?.durationSeconds !== nextDurationSeconds ||
        previousVideo?.thumbnailUrl !== nextThumbnailUrl ||
        previousVideo?.embeddable !== nextStats.embeddable;
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

  const copyAllShownBoardLinks = async (): Promise<void> => {
    if (!activeBoardId) {
      return;
    }
    const shownVideos = visibleColumns.flatMap(
      (column) => filteredVideosByColumnId.get(column.id) ?? []
    );
    if (shownVideos.length === 0) {
      return;
    }
    const text = shownVideos.map((video) => video.videoUrl).join("\n");
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
    const feedbackId = `board-links:${activeBoardId}`;
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
    setWatchedStatusAcrossBoards(
      bulkWatchColumnAction.videoIds,
      bulkWatchColumnAction.markWatched
    );
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
      activeBoard?.kind === "saved"
        ? sortSavedVideosByMode(column, getVideoPublishedTime)
        : [...column.videos];
    const queue = sourceVideos
      .filter((video) => {
        if (!matchesVideoWindowFilter(getVideoPublishedTime(video), videoWindowDays, now)) {
          return false;
        }
        if (!matchesDurationFilter(video.durationSeconds, videoDurationFilter)) {
          return false;
        }
        const isWatched = isVideoMarkedWatched(watchedVideos, video.videoId);
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
    const movedVideoIds = columnToMove.videos.map((video) => video.videoId);
    const watchedBySourceBoard = activeBoard.watchedVideos;

    setBoards((previous) =>
      previous.map((board) => {
        if (board.id === activeBoard.id) {
          return {
            ...board,
            columns: board.columns.filter((column) => column.id !== movingId)
          };
        }
        if (board.id === moveTargetBoardId) {
          const nextWatchedVideos = { ...board.watchedVideos };
          movedVideoIds.forEach((videoId) => {
            const watchedAt = watchedBySourceBoard[videoId];
            if (typeof watchedAt === "number" && Number.isFinite(watchedAt)) {
              nextWatchedVideos[videoId] = watchedAt;
            }
          });
          return {
            ...board,
            columns: [...board.columns, columnToMove],
            watchedVideos: nextWatchedVideos
          };
        }
        return board;
      })
    );
    setBrokenChannelThumbnailKeys((previous) =>
      previous.filter((key) => !key.endsWith(`:${movingId}`))
    );
    setChannelThumbnailRetryAttemptedKeys((previous) =>
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
    clearFetchAllVisibilityState();
    preloadBoardAssets(value);
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
    renameBoardInputDraftRef.current = targetBoard.name;
    setIsRenameBoardModalOpen(true);
  };

  const confirmRenameBoard = (): void => {
    const targetBoardId = editingBoardId ?? activeBoard?.id;
    if (!targetBoardId) {
      return;
    }
    const nextName = (renameBoardInputDraftRef.current || renameBoardInput).trim().slice(0, 15);
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
      boards: toPersistedBoards(boards),
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
      } catch {
        window.alert("Backup file could not be imported.");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleClearAllCachedSummaries = async (): Promise<void> => {
    try {
      await clearAllCachedSummaries();
      setIsDeleteSummariesModalOpen(false);
    } catch {
      setIsDeleteSummariesModalOpen(false);
    }
  };

  const saveVideoToSavedColumn = (): void => {
    if (!savingVideo || !saveTargetColumnId || !savedBoard) {
      return;
    }
    const savedVideoId = savingVideo.videoId;
    const now = Date.now();
    setBoards((previous) =>
      previous.map((board) => {
        const nextWatchedVideos = {
          ...board.watchedVideos,
          [savingVideo.videoId]: now
        };
        if (board.id !== savedBoard.id) {
          return {
            ...board,
            watchedVideos: nextWatchedVideos
          };
        }
        return {
          ...board,
          columns: board.columns.map((column) =>
            column.id === saveTargetColumnId
              ? addVideoToSavedColumn(column, savingVideo, now)
              : column
          ),
          watchedVideos: nextWatchedVideos,
          viewCountRefreshedAtByVideoId: {
            ...board.viewCountRefreshedAtByVideoId,
            [savingVideo.videoId]: now
          }
        };
      })
    );
    setSavingVideo(null);
    setSaveTargetColumnId("");
    if (pendingSummarySaveRemovalVideoId === savedVideoId) {
      removeBoardSummaryBatchItem(savedVideoId);
      setPendingSummarySaveRemovalVideoId(null);
    }
  };

  const openEditSavedListModal = (column: ColumnState): void => {
    setEditingSavedListColumnId(column.id);
    setSavedListNameInput(column.handleInput);
    savedListNameDraftRef.current = column.handleInput;
  };

  const openSaveVideoModalFromSummaries = (video: VideoItem): void => {
    setPendingSummarySaveRemovalVideoId(video.videoId);
    openSaveVideoModal(video);
  };

  const openSaveVideoModalFromPlayer = (video: VideoItem): void => {
    if (activeVideoSource === "summaries") {
      setPendingSummarySaveRemovalVideoId(video.videoId);
    }
    openSaveVideoModal(video);
  };

  const openEditChannelModal = (column: ColumnState): void => {
    setEditingChannelColumnId(column.id);
    setChannelNameInput(column.handleInput);
    channelNameDraftRef.current = column.handleInput;
  };

  const confirmEditSavedListName = (): void => {
    if (!activeBoard || activeBoard.kind !== "saved" || !editingSavedListColumnId) {
      return;
    }
    const nextName = (savedListNameDraftRef.current || savedListNameInput).trim();
    if (nextName.length === 0) {
      return;
    }
    setColumn(activeBoard.id, editingSavedListColumnId, (prev) => ({
      ...prev,
      handleInput: nextName
    }));
    setEditingSavedListColumnId(null);
    setSavedListNameInput("");
    savedListNameDraftRef.current = "";
  };

  const confirmEditChannelName = (): void => {
    if (!activeBoard || activeBoard.kind !== "channels" || !editingChannelColumnId) {
      return;
    }
    const currentColumn = activeBoard.columns.find(
      (column) => column.id === editingChannelColumnId
    );
    const nextName = (channelNameDraftRef.current || channelNameInput).trim();
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
    channelNameDraftRef.current = "";
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
        column.id === columnId ? removeVideoFromSavedColumn(column, videoId) : column
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
          ? clearSavedColumnVideos(column)
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

    setBoard(savedBoard.id, (board) =>
      moveSavedVideoBetweenColumns(
        board,
        sourceColumnId,
        moveSavedVideoTargetColumnId,
        videoId,
        Date.now()
      )
    );

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
      return moveSavedVideoInManualOrderForColumn(column, videoId, direction);
    });
  };

  const startLogoSpin = (): void => {
    activeLogoSpinCountRef.current += 1;
    if (activeLogoSpinCountRef.current === 1) {
      setIsLogoSpinning(true);
    }
  };

  const stopLogoSpin = (): void => {
    if (activeLogoSpinCountRef.current <= 0) {
      activeLogoSpinCountRef.current = 0;
      setIsLogoSpinning(false);
      return;
    }
    activeLogoSpinCountRef.current -= 1;
    if (activeLogoSpinCountRef.current === 0) {
      setIsLogoSpinning(false);
    }
  };

  const preloadImage = useCallback((src: string): Promise<boolean> => {
    if (typeof window === "undefined" || typeof Image === "undefined") {
      return Promise.resolve(true);
    }
    const normalized = src.trim();
    if (!normalized) {
      return Promise.resolve(false);
    }
    if (preloadedImageUrlsRef.current.has(normalized)) {
      return Promise.resolve(true);
    }
    const inFlight = preloadingImageUrlsRef.current.get(normalized);
    if (inFlight) {
      return inFlight;
    }
    const preloadPromise = new Promise<boolean>((resolve) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        preloadedImageUrlsRef.current.add(normalized);
        preloadingImageUrlsRef.current.delete(normalized);
        resolve(true);
      };
      image.onerror = () => {
        preloadingImageUrlsRef.current.delete(normalized);
        resolve(false);
      };
      image.src = normalized;
    });
    preloadingImageUrlsRef.current.set(normalized, preloadPromise);
    return preloadPromise;
  }, []);

  const getBoardColumnAvatarPreloadSrc = useCallback(
    (board: BoardState, column: ColumnState): string => {
      if (board.kind === "saved") {
        return column.channelThumbnailUrl || column.videos[0]?.thumbnailUrl || "";
      }

      const brokenKey = `${board.id}:${column.id}`;
      const rawThumbnailUrl = selectChannelThumbnailUrl(
        column,
        brokenChannelThumbnailKeys.includes(brokenKey)
      );
      return buildChannelAvatarProxyUrl(rawThumbnailUrl);
    },
    [brokenChannelThumbnailKeys]
  );

  const preloadBoardAssets = useCallback(
    (boardId: string): void => {
      const board = boards.find((item) => item.id === boardId);
      if (!board) {
        return;
      }

      const derivedData = getBoardFilterDerivedData({
        board,
        allValue: COLUMN_SCOPE_ALL,
        notEmptyValue: COLUMN_SCOPE_NOT_EMPTY,
        getSourceVideos: getSourceVideosForBoard
      });
      const urls = collectBoardAssetPreloadUrls({
        visibleColumns: derivedData.visibleColumns,
        hiddenColumns: derivedData.hiddenColumns,
        filteredVideosByColumnId: derivedData.filteredVideosByColumnId,
        getColumnAvatarSrc: (column) => getBoardColumnAvatarPreloadSrc(board, column),
        getVideoThumbnailSrc
      });

      urls.forEach((url) => {
        void preloadImage(url);
      });
    },
    [
      boards,
      getBoardColumnAvatarPreloadSrc,
      getSourceVideosForBoard,
      getVideoThumbnailSrc,
      preloadImage
    ]
  );

  const preloadAllChannelAvatars = useCallback((): void => {
    boards
      .filter((board) => board.kind === "channels")
      .forEach((board) => {
        const urls = collectColumnAvatarPreloadUrls(board.columns, (column) =>
          getBoardColumnAvatarPreloadSrc(board, column)
        );
        urls.forEach((url) => {
          void preloadImage(url);
        });
      });
  }, [boards, getBoardColumnAvatarPreloadSrc, preloadImage]);

  useEffect(() => {
    preloadAllChannelAvatars();
  }, [preloadAllChannelAvatars]);

  const preloadDisplayedBoardAssets = useCallback((): void => {
    const activeIndex = displayedBoards.findIndex((board) => board.id === activeBoardId);
    const orderedBoardIds = activeIndex >= 0
      ? [
          displayedBoards[activeIndex + 1]?.id,
          displayedBoards[activeIndex - 1]?.id,
          displayedBoards[activeIndex + 2]?.id,
          displayedBoards[activeIndex - 2]?.id
        ]
      : displayedBoards.map((board) => board.id);
    orderedBoardIds
      .filter((boardId): boardId is string => Boolean(boardId && boardId !== activeBoardId))
      .slice(0, BOARD_SELECTOR_PREWARM_BOARD_LIMIT)
      .forEach((boardId) => preloadBoardAssets(boardId));
  }, [activeBoardId, displayedBoards, preloadBoardAssets]);

  const agentModeEnabled =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("agent") === "1";
  const agentPermission: AgentPermission = (() => {
    if (typeof window === "undefined") {
      return "full";
    }
    const value = new URLSearchParams(window.location.search).get("agentPerm");
    if (value === "read-only" || value === "safe-write" || value === "full") {
      return value;
    }
    return "full";
  })();

  const emitAgentEvent = (eventName: string, detail: Record<string, unknown>): void => {
    if (typeof window === "undefined") {
      return;
    }
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail: {
          ts: Date.now(),
          ...detail
        }
      })
    );
  };

  const readAgentState = (): ReturnType<AppAgentApi["readState"]> => {
    const currentActiveBoard =
      boards.find((board) => board.id === activeBoardId) ?? boards[0] ?? null;
    const currentDerived = getBoardFilterDerivedData({
      board: currentActiveBoard,
      allValue: COLUMN_SCOPE_ALL,
      notEmptyValue: COLUMN_SCOPE_NOT_EMPTY,
      getSourceVideos: getSourceVideosForBoard
    });
    const visible = currentDerived.visibleColumns;
    const visibleSet = currentDerived.visibleColumnIdSet;
    const totalShown = currentDerived.shownVideosTotal;

    return {
      activeBoardId: currentActiveBoard?.id ?? null,
      activeBoardKind: currentActiveBoard?.kind ?? null,
      selectedFilters: currentActiveBoard
        ? {
            videoFilter: currentActiveBoard.videoFilter,
            videoWindowDays: currentActiveBoard.videoWindowDays,
            videoDurationFilter: currentActiveBoard.videoDurationFilter,
            columnScopeFilter: currentDerived.columnScopeFilter,
            playbackRate: currentActiveBoard.defaultPlaybackRate
          }
        : null,
      shownVideosTotal: totalShown,
      boards: boards.map((board) => {
        const boardDerived = getBoardFilterDerivedData({
          board,
          allValue: COLUMN_SCOPE_ALL,
          notEmptyValue: COLUMN_SCOPE_NOT_EMPTY,
          getSourceVideos: getSourceVideosForBoard
        });
        const boardVisibleSet = boardDerived.visibleColumnIdSet;
        return {
          id: board.id,
          name: board.name,
          kind: board.kind,
          columnCount: board.columns.length,
          columns: board.columns.map((column) => {
            const shown = boardDerived.filteredVideosByColumnId.get(column.id) ?? [];
            return {
              id: column.id,
              handle: column.currentHandle || column.handleInput,
              shownVideoCount: shown.length,
              hidden: !boardVisibleSet.has(column.id),
              loading: column.loading,
              error: column.error,
              videoIds: shown.map((video) => video.videoId)
            };
          })
        };
      }),
      visibleColumns: visible.map((column) => column.id),
      hiddenColumns: currentActiveBoard
        ? currentDerived.hiddenColumns.map((column) => column.id)
        : []
    };
  };

  const resolveVideoById = (
    videoId: string
  ): { board: BoardState; column: ColumnState; video: VideoItem } | null => {
    for (const board of boards) {
      for (const column of board.columns) {
        const video = column.videos.find((item) => item.videoId === videoId);
        if (video) {
          return { board, column, video };
        }
      }
    }
    return null;
  };

  const resolveColumnOnActiveBoard = (columnId: string): ColumnState | null => {
    if (!activeBoard) {
      return null;
    }
    return activeBoard.columns.find((column) => column.id === columnId) ?? null;
  };

  const runAgentAction = async (
    action: string,
    scope: AgentScope,
    executor: () => Promise<AgentActionResult> | AgentActionResult,
    options?: { allowReadOnly?: boolean; allowSafeWrite?: boolean }
  ): Promise<AgentActionResult> => {
    const actionId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const before = readAgentState();
    const beforeCounters = {
      shownVideosTotal: before.shownVideosTotal,
      visibleColumnCount: before.visibleColumns.length,
      hiddenColumnCount: before.hiddenColumns.length
    };
    emitAgentEvent("app:action-start", { actionId, action, scope, counters: { before: beforeCounters } });
    try {
      if (agentPermission === "read-only" && !options?.allowReadOnly) {
        const denied: AgentActionResult = {
          ok: false,
          action,
          scope,
          error: {
            code: "READ_ONLY",
            message: "Agent is in read-only mode."
          }
        };
        emitAgentEvent("app:error", { actionId, action, scope, error: denied.error });
        emitAgentEvent("app:action-end", {
          actionId,
          ...denied,
          counters: {
            before: beforeCounters,
            after: beforeCounters
          }
        });
        return denied;
      }
      if (agentPermission === "safe-write" && options?.allowSafeWrite === false) {
        const denied: AgentActionResult = {
          ok: false,
          action,
          scope,
          error: {
            code: "SAFE_WRITE_BLOCKED",
            message: "Action is blocked in safe-write mode."
          }
        };
        emitAgentEvent("app:error", { actionId, action, scope, error: denied.error });
        emitAgentEvent("app:action-end", {
          actionId,
          ...denied,
          counters: {
            before: beforeCounters,
            after: beforeCounters
          }
        });
        return denied;
      }
      const result = await executor();
      const after = readAgentState();
      const afterCounters = {
        shownVideosTotal: after.shownVideosTotal,
        visibleColumnCount: after.visibleColumns.length,
        hiddenColumnCount: after.hiddenColumns.length
      };
      emitAgentEvent("app:action-end", {
        actionId,
        ...result,
        counters: {
          before: beforeCounters,
          after: afterCounters
        }
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected action error.";
      const failed: AgentActionResult = {
        ok: false,
        action,
        scope,
        error: {
          code: "ACTION_FAILED",
          message
        }
      };
      emitAgentEvent("app:error", { actionId, action, scope, error: failed.error });
      const after = readAgentState();
      const afterCounters = {
        shownVideosTotal: after.shownVideosTotal,
        visibleColumnCount: after.visibleColumns.length,
        hiddenColumnCount: after.hiddenColumns.length
      };
      emitAgentEvent("app:action-end", {
        actionId,
        ...failed,
        counters: {
          before: beforeCounters,
          after: afterCounters
        }
      });
      return failed;
    }
  };

  useEffect(() => {
    emitAgentEvent("app:state-changed", {
      activeBoardId,
      shownVideosTotal
    });
  }, [activeBoardId, boards, shownVideosTotal]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const api: AppAgentApi = {
      version: "1.0.0",
      mode: agentModeEnabled ? "enabled" : "disabled",
      permission: agentPermission,
      capabilities: {
        canRead: true,
        canWrite: agentPermission !== "read-only",
        canDelete: agentPermission === "full"
      },
      readState: readAgentState,
      actions: {
        ping: async () =>
          runAgentAction("ping", "board", async () => {
            const state = readAgentState();
            return {
              ok: true,
              action: "ping",
              scope: "board",
              data: {
                version: "1.0.0",
                mode: agentModeEnabled ? "enabled" : "disabled",
                permission: agentPermission,
                activeBoardId: state.activeBoardId,
                shownVideosTotal: state.shownVideosTotal
              }
            };
          }, { allowReadOnly: true }),
        selectBoard: async (boardId: string) =>
          runAgentAction("selectBoard", "board", async () => {
            const targetBoard = boards.find((board) => board.id === boardId);
            if (!targetBoard) {
              return {
                ok: false,
                action: "selectBoard",
                scope: "board",
                error: {
                  code: "BOARD_NOT_FOUND",
                  message: "Board not found."
                }
              };
            }
            setActiveBoardId(boardId);
            return {
              ok: true,
              action: "selectBoard",
              scope: "board",
              changed: { columnIds: targetBoard.columns.map((column) => column.id) },
              data: { activeBoardId: boardId }
            };
          }),
        setFilters: async (patch) =>
          runAgentAction("setFilters", "board", async () => {
            if (!activeBoard) {
              return {
                ok: false,
                action: "setFilters",
                scope: "board",
                error: {
                  code: "NO_ACTIVE_BOARD",
                  message: "No active board."
                }
              };
            }
            const nextRate =
              typeof patch.playbackRate === "number" && Number.isFinite(patch.playbackRate) && patch.playbackRate > 0
                ? patch.playbackRate
                : activeBoard.defaultPlaybackRate;
            setBoard(activeBoard.id, (board) => ({
              ...board,
              videoFilter:
                patch.videoFilter === "all" || patch.videoFilter === "new" || patch.videoFilter === "watched"
                  ? patch.videoFilter
                  : board.videoFilter,
              videoWindowDays:
                typeof patch.videoWindowDays !== "undefined"
                  ? normalizeVideoWindowFilterForKind(board.kind, patch.videoWindowDays)
                  : board.videoWindowDays,
              videoDurationFilter:
                typeof patch.videoDurationFilter !== "undefined"
                  ? normalizeVideoDurationFilter(patch.videoDurationFilter)
                  : board.videoDurationFilter,
              columnScopeFilter:
                Array.isArray(patch.columnScopeFilter)
                  ? normalizeColumnScopeFilter(
                      patch.columnScopeFilter,
                      board.columns,
                      COLUMN_SCOPE_ALL,
                      COLUMN_SCOPE_NOT_EMPTY
                    )
                  : board.columnScopeFilter,
              defaultPlaybackRate: nextRate
            }));
            return {
              ok: true,
              action: "setFilters",
              scope: "board",
              data: {
                activeBoardId: activeBoard.id
              }
            };
          }),
        fetchAllShownBoardChannels: async () =>
          runAgentAction("fetchAllShownBoardChannels", "board", async () => {
            if (!activeBoard || activeBoard.kind === "saved") {
              return {
                ok: false,
                action: "fetchAllShownBoardChannels",
                scope: "board",
                error: {
                  code: "BOARD_NOT_FETCHABLE",
                  message: "Active board is not a channels board."
                }
              };
            }
            const targetColumns = activeBoard.columns.filter(
              (column) => column.handleInput.trim().length > 0
            );
            await Promise.all(
              targetColumns.map((column) =>
                runFetch(activeBoard.id, column.id, column.handleInput)
              )
            );
            return {
              ok: true,
              action: "fetchAllShownBoardChannels",
              scope: "board",
              changed: { columnIds: targetColumns.map((column) => column.id) }
            };
          }),
        fetchChannel: async (columnId: string) =>
          runAgentAction("fetchChannel", "channel", async () => {
            if (!activeBoard || activeBoard.kind === "saved") {
              return {
                ok: false,
                action: "fetchChannel",
                scope: "channel",
                error: {
                  code: "BOARD_NOT_FETCHABLE",
                  message: "Active board is not a channels board."
                }
              };
            }
            const column = resolveColumnOnActiveBoard(columnId);
            if (!column) {
              return {
                ok: false,
                action: "fetchChannel",
                scope: "channel",
                error: {
                  code: "COLUMN_NOT_FOUND",
                  message: "Column not found on active board."
                }
              };
            }
            await runFetch(activeBoard.id, column.id, column.handleInput);
            return {
              ok: true,
              action: "fetchChannel",
              scope: "channel",
              changed: { columnIds: [column.id] }
            };
          }),
        playBoardShownVideos: async () =>
          runAgentAction("playBoardShownVideos", "board", async () => {
            playAllVideos();
            return {
              ok: true,
              action: "playBoardShownVideos",
              scope: "board"
            };
          }),
        playChannelShownVideos: async (columnId: string) =>
          runAgentAction("playChannelShownVideos", "channel", async () => {
            const column = resolveColumnOnActiveBoard(columnId);
            if (!column) {
              return {
                ok: false,
                action: "playChannelShownVideos",
                scope: "channel",
                error: {
                  code: "COLUMN_NOT_FOUND",
                  message: "Column not found on active board."
                }
              };
            }
            playChannelVideos(column);
            return {
              ok: true,
              action: "playChannelShownVideos",
              scope: "channel",
              changed: { columnIds: [column.id] }
            };
          }),
        markBoardShownVideosWatched: async () =>
          runAgentAction("markBoardShownVideosWatched", "board", async () => {
            if (!activeBoard) {
              return {
                ok: false,
                action: "markBoardShownVideosWatched",
                scope: "board",
                error: { code: "NO_ACTIVE_BOARD", message: "No active board." }
              };
            }
            const now = Date.now();
            const ids = new Set<string>();
            visibleColumns.forEach((column) => {
              getShownVideosForColumn(column, now).forEach((video) => ids.add(video.videoId));
            });
            const videoIds = [...ids];
            setWatchedStatusAcrossBoards(videoIds, true);
            return {
              ok: true,
              action: "markBoardShownVideosWatched",
              scope: "board",
              changed: { videoIds }
            };
          }, { allowSafeWrite: false }),
        markBoardShownVideosNew: async () =>
          runAgentAction("markBoardShownVideosNew", "board", async () => {
            if (!activeBoard) {
              return {
                ok: false,
                action: "markBoardShownVideosNew",
                scope: "board",
                error: { code: "NO_ACTIVE_BOARD", message: "No active board." }
              };
            }
            const now = Date.now();
            const ids = new Set<string>();
            visibleColumns.forEach((column) => {
              getShownVideosForColumn(column, now).forEach((video) => ids.add(video.videoId));
            });
            const videoIds = [...ids];
            setWatchedStatusAcrossBoards(videoIds, false);
            return {
              ok: true,
              action: "markBoardShownVideosNew",
              scope: "board",
              changed: { videoIds }
            };
          }, { allowSafeWrite: false }),
        markChannelShownVideosWatched: async (columnId: string) =>
          runAgentAction("markChannelShownVideosWatched", "channel", async () => {
            if (!activeBoard) {
              return {
                ok: false,
                action: "markChannelShownVideosWatched",
                scope: "channel",
                error: { code: "NO_ACTIVE_BOARD", message: "No active board." }
              };
            }
            const column = resolveColumnOnActiveBoard(columnId);
            if (!column) {
              return {
                ok: false,
                action: "markChannelShownVideosWatched",
                scope: "channel",
                error: {
                  code: "COLUMN_NOT_FOUND",
                  message: "Column not found on active board."
                }
              };
            }
            const videoIds = getShownVideosForColumn(column, Date.now()).map((video) => video.videoId);
            setWatchedStatusAcrossBoards(videoIds, true);
            return {
              ok: true,
              action: "markChannelShownVideosWatched",
              scope: "channel",
              changed: { videoIds, columnIds: [column.id] }
            };
          }, { allowSafeWrite: false }),
        markChannelShownVideosNew: async (columnId: string) =>
          runAgentAction("markChannelShownVideosNew", "channel", async () => {
            if (!activeBoard) {
              return {
                ok: false,
                action: "markChannelShownVideosNew",
                scope: "channel",
                error: { code: "NO_ACTIVE_BOARD", message: "No active board." }
              };
            }
            const column = resolveColumnOnActiveBoard(columnId);
            if (!column) {
              return {
                ok: false,
                action: "markChannelShownVideosNew",
                scope: "channel",
                error: {
                  code: "COLUMN_NOT_FOUND",
                  message: "Column not found on active board."
                }
              };
            }
            const videoIds = getShownVideosForColumn(column, Date.now()).map((video) => video.videoId);
            setWatchedStatusAcrossBoards(videoIds, false);
            return {
              ok: true,
              action: "markChannelShownVideosNew",
              scope: "channel",
              changed: { videoIds, columnIds: [column.id] }
            };
          }, { allowSafeWrite: false }),
        markVideoWatched: async (videoId: string) =>
          runAgentAction("markVideoWatched", "video", async () => {
            const resolved = resolveVideoById(videoId);
            if (!resolved) {
              return {
                ok: false,
                action: "markVideoWatched",
                scope: "video",
                error: { code: "VIDEO_NOT_FOUND", message: "Video not found." }
              };
            }
            setWatchedStatusAcrossBoards([videoId], true);
            return {
              ok: true,
              action: "markVideoWatched",
              scope: "video",
              changed: { videoIds: [videoId], columnIds: [resolved.column.id] }
            };
          }, { allowSafeWrite: false }),
        markVideoNew: async (videoId: string) =>
          runAgentAction("markVideoNew", "video", async () => {
            const resolved = resolveVideoById(videoId);
            if (!resolved) {
              return {
                ok: false,
                action: "markVideoNew",
                scope: "video",
                error: { code: "VIDEO_NOT_FOUND", message: "Video not found." }
              };
            }
            setWatchedStatusAcrossBoards([videoId], false);
            return {
              ok: true,
              action: "markVideoNew",
              scope: "video",
              changed: { videoIds: [videoId], columnIds: [resolved.column.id] }
            };
          }, { allowSafeWrite: false }),
        saveVideo: async (videoId: string, listId: string) =>
          runAgentAction("saveVideo", "video", async () => {
            const resolved = resolveVideoById(videoId);
            if (!resolved) {
              return {
                ok: false,
                action: "saveVideo",
                scope: "video",
                error: { code: "VIDEO_NOT_FOUND", message: "Video not found." }
              };
            }
            if (!savedBoard || !savedBoard.columns.some((column) => column.id === listId)) {
              return {
                ok: false,
                action: "saveVideo",
                scope: "video",
                error: { code: "LIST_NOT_FOUND", message: "Destination list not found." }
              };
            }
            const now = Date.now();
            setBoards((previous) =>
              previous.map((board) => {
                const nextWatchedVideos = {
                  ...board.watchedVideos,
                  [videoId]: now
                };
                if (board.id !== savedBoard.id) {
                  return {
                    ...board,
                    watchedVideos: nextWatchedVideos
                  };
                }
                return {
                  ...board,
                  columns: board.columns.map((column) => {
                    if (column.id !== listId) {
                      return column;
                    }
                    const exists = column.videos.some((video) => video.videoId === videoId);
                    if (exists) {
                      return column;
                    }
                    return {
                      ...column,
                      videos: [resolved.video, ...column.videos],
                      savedAddedAtByVideoId: {
                        ...column.savedAddedAtByVideoId,
                        [videoId]: now
                      },
                      savedManualOrder: [
                        videoId,
                        ...column.savedManualOrder.filter((id) => id !== videoId)
                      ]
                    };
                  }),
                  watchedVideos: nextWatchedVideos,
                  viewCountRefreshedAtByVideoId: {
                    ...board.viewCountRefreshedAtByVideoId,
                    [videoId]: now
                  }
                };
              })
            );
            return {
              ok: true,
              action: "saveVideo",
              scope: "video",
              changed: { videoIds: [videoId], columnIds: [listId] }
            };
          }, { allowSafeWrite: false }),
        copyVideoLink: async (videoId: string) =>
          runAgentAction("copyVideoLink", "video", async () => {
            const resolved = resolveVideoById(videoId);
            if (!resolved) {
              return {
                ok: false,
                action: "copyVideoLink",
                scope: "video",
                error: { code: "VIDEO_NOT_FOUND", message: "Video not found." }
              };
            }
            await copyVideoLink(resolved.video);
            return {
              ok: true,
              action: "copyVideoLink",
              scope: "video",
              changed: { videoIds: [videoId], columnIds: [resolved.column.id] }
            };
          }),
        openVideo: async (videoId: string) =>
          runAgentAction("openVideo", "video", async () => {
            const resolved = resolveVideoById(videoId);
            if (!resolved) {
              return {
                ok: false,
                action: "openVideo",
                scope: "video",
                error: { code: "VIDEO_NOT_FOUND", message: "Video not found." }
              };
            }
            openVideo(resolved.video);
            return {
              ok: true,
              action: "openVideo",
              scope: "video",
              changed: { videoIds: [videoId], columnIds: [resolved.column.id] }
            };
          })
      }
    };
    window.appAgent = api;
    return () => {
      if (window.appAgent === api) {
        delete window.appAgent;
      }
    };
  });

  const handleColumnScopeChange = (value: string[]): void => {
    if (!activeBoard) {
      return;
    }
    const resolved = resolveColumnScopeFilterSelection(
      value,
      columnScopeFilter,
      columns,
      COLUMN_SCOPE_ALL,
      COLUMN_SCOPE_NOT_EMPTY
    );
    clearFetchAllVisibilityState(activeBoard.id);
    setBoard(activeBoard.id, (board) => ({
      ...board,
      columnScopeFilter: resolved
    }));
    blurActiveTopbarControl();
  };

  const handleVideoFilterSelect = (value: VideoFilter): void => {
    if (!activeBoard) {
      return;
    }
    clearFetchAllVisibilityState(activeBoard.id);
    setBoard(activeBoard.id, (board) => ({
      ...board,
      videoFilter: value
    }));
    blurActiveTopbarControl();
  };

  const handleVideoWindowSelect = (value: VideoWindowFilter): void => {
    if (!activeBoard) {
      return;
    }
    clearFetchAllVisibilityState(activeBoard.id);
    setBoard(activeBoard.id, (board) => ({
      ...board,
      videoWindowDays: value
    }));
    blurActiveTopbarControl();
  };

  const handleVideoDurationSelect = (value: string[]): void => {
    if (!activeBoard) {
      return;
    }
    const next = resolveVideoDurationFilterSelection(value, videoDurationFilter);
    clearFetchAllVisibilityState(activeBoard.id);
    setBoard(activeBoard.id, (board) => ({
      ...board,
      videoDurationFilter: next
    }));
    blurActiveTopbarControl();
  };

  const handleBrokenChannelThumbnail = async (
    boardId: string,
    columnId: string,
    src: string
  ): Promise<void> => {
    const brokenKey = `${boardId}:${columnId}`;
    const board = boards.find((item) => item.id === boardId);
    const column = board?.columns.find((item) => item.id === columnId);
    const normalizedSrc = src.trim();
    const lastGoodChannelThumbnailUrl = column?.lastGoodChannelThumbnailUrl.trim() ?? "";

    if (normalizedSrc && lastGoodChannelThumbnailUrl && normalizedSrc === lastGoodChannelThumbnailUrl) {
      setColumn(boardId, columnId, (prev) => ({
        ...prev,
        lastGoodChannelThumbnailUrl: ""
      }));
    }

    if (brokenChannelThumbnailKeys.includes(brokenKey)) {
      return;
    }

    const channelThumbnailUrl = column?.channelThumbnailUrl.trim() ?? "";

    if (
      channelThumbnailUrl &&
      !channelThumbnailRetryAttemptedKeys.includes(brokenKey)
    ) {
      setChannelThumbnailRetryAttemptedKeys((prev) =>
        prev.includes(brokenKey) ? prev : [...prev, brokenKey]
      );
      if (await preloadImage(buildChannelAvatarProxyUrl(channelThumbnailUrl))) {
        setChannelThumbnailRetryAttemptedKeys((prev) =>
          prev.filter((key) => key !== brokenKey)
        );
        return;
      }
    }

    setBrokenChannelThumbnailKeys((prev) => (prev.includes(brokenKey) ? prev : [...prev, brokenKey]));
  };

  const handleLoadedChannelThumbnail = (boardId: string, columnId: string, src: string): void => {
    const normalizedSrc = src.trim();
    if (!normalizedSrc) {
      return;
    }
    setColumn(boardId, columnId, (prev) =>
      prev.lastGoodChannelThumbnailUrl === normalizedSrc
        ? prev
        : {
            ...prev,
            lastGoodChannelThumbnailUrl: normalizedSrc
          }
    );
    const brokenKey = `${boardId}:${columnId}`;
    setBrokenChannelThumbnailKeys((prev) => prev.filter((key) => key !== brokenKey));
    setChannelThumbnailRetryAttemptedKeys((prev) => prev.filter((key) => key !== brokenKey));
  };

  const handleSetSavedSortMode = (columnId: string, value: string): void => {
    setColumn(activeBoardId, columnId, (prev) => ({
      ...prev,
      savedSortMode: value as SavedSortMode
    }));
  };

  return (
    <main className="app-shell">
      {isBoardSummariesPage ? (
        <BoardSummaryBatchPage
          open={isBoardSummariesPage}
          onGoHome={() => navigateToAppPath("/")}
          boardName={activeBoard?.name ?? "BOARD"}
          channelScopeLabel={boardSummaryChannelScopeLabel}
          videoFilterLabel={boardSummaryVideoFilterLabel}
          timeFilterLabel={boardSummaryTimeFilterLabel}
          lengthFilterLabel={formatDurationFilterSummary(videoDurationFilter)}
          shownVideosLabel={boardSummaryShownVideosLabel}
          summaryFormats={summaryFormats}
          selectedSummaryFormatId={boardSummarySelectedFormat.id}
          isPreparing={isBoardSummaryBatchPreparing}
          isCopied={isBoardSummaryBatchCopied}
          items={boardSummaryBatchItems}
          onCopyAll={copyBoardSummaryBatchToClipboard}
          onSummarizeShown={summarizeShownBoardSummaries}
          isSummarizingShown={boardSummaryAggregateState?.loading === true}
          onSummaryFormatChange={changeBoardSummaryFormat}
          activeBoardId={activeBoardId}
          isSavedBoardActive={isSavedBoardActive}
          copiedLinkVideoId={copiedLinkVideoId}
          saveDestinationColumnsLength={saveDestinationColumns.length}
          savedBoardColumnsLength={savedBoardColumns.length}
          filteredVideosByColumnId={filteredVideosByColumnId}
          isVideoMarkedWatched={(videoId) => isVideoMarkedWatched(watchedVideos, videoId)}
          videoStatsBackfillInFlight={videoStatsBackfillInFlight}
          videoMetaFeedbackById={videoMetaFeedbackById}
          formatVideoMeta={formatVideoMeta}
          backfillVideoStats={backfillVideoStats}
          getVideoThumbnailSrc={getVideoThumbnailSrc}
          onHandleVideoThumbnailError={handleVideoThumbnailError}
          onOpenTranscript={openTranscript}
          onCopyVideoLink={copyVideoLink}
          onOpenMoveSavedVideoModal={openMoveSavedVideoModal}
          onSetDeletingSavedVideo={setDeletingSavedVideo}
          onMoveSavedVideoInManualOrder={moveSavedVideoInManualOrder}
          onOpenSaveVideoModal={openSaveVideoModalFromSummaries}
          onToggleWatched={toggleWatchedFromSummaries}
          onOpenVideo={openVideoFromSummaries}
        />
      ) : (
        <>
          <AppTopbar
            buildInfoLabel={BUILD_INFO_LABEL}
            lastApiQueryUnits={quotaEstimate.lastActionUnits}
            totalApiQueryUnits={quotaEstimate.todayUnits}
            topBarLogoSrc={TOP_BAR_LOGO_SRC}
            isLogoSpinning={isLogoSpinning}
            isSavedBoardActive={isSavedBoardActive}
            topbarLastFetchLabel={topbarLastFetchLabel}
            fetchAllColumns={fetchAllColumns}
            activeBoardId={activeBoard?.id}
            displayedBoards={displayedBoards}
            newBoardOptionValue={NEW_BOARD_OPTION_VALUE}
            boardDropdownListHeight={boardDropdownListHeight}
            handleBoardSelectChange={handleBoardSelectChange}
            onBoardSelectorPrewarm={preloadDisplayedBoardAssets}
            blurActiveTopbarControl={blurActiveTopbarControl}
            moveBoard={moveBoard}
            openRenameBoardModal={openRenameBoardModal}
            columnScopeFilter={columnScopeFilter}
            columnScopeDropdownListHeight={channelScopeDropdownListHeight}
            formatColumnScopeSummary={() =>
              formatColumnScopeSummary(
                columnScopeFilter,
                isSavedBoardActive,
                columns,
                COLUMN_SCOPE_ALL,
                COLUMN_SCOPE_NOT_EMPTY
              )
            }
            columnScopeOptions={columnScopeOptions}
            onColumnScopeChange={handleColumnScopeChange}
            videoFilter={videoFilter}
            onVideoFilterChange={handleVideoFilterSelect}
            videoWindowDays={videoWindowDays}
            onVideoWindowChange={(value) => handleVideoWindowSelect(value as VideoWindowFilter)}
            savedVideoWindowSelectOptions={SAVED_VIDEO_WINDOW_SELECT_OPTIONS}
            channelVideoWindowSelectOptions={CHANNEL_VIDEO_WINDOW_SELECT_OPTIONS}
            videoDurationFilter={videoDurationFilter}
            onVideoDurationChange={handleVideoDurationSelect}
            formatDurationFilterSummary={() => formatDurationFilterSummary(videoDurationFilter)}
            videoDurationFilterOptions={VIDEO_DURATION_FILTER_OPTIONS}
            startBoardSummaryBatch={startBoardSummaryBatch}
            isBoardSummaryBatchRunning={isBoardSummaryBatchRunning}
            playAllVideos={playAllVideos}
            copyAllShownBoardLinks={copyAllShownBoardLinks}
            copiedLinkVideoId={copiedLinkVideoId}
            openBulkWatchBoardAction={openBulkWatchBoardAction}
            openMaintenanceMenuExport={handleExportBackup}
            openMaintenanceMenuRestore={() => importInputRef.current?.click()}
            openMaintenanceMenuLogs={() => setIsLogsModalOpen(true)}
            openMaintenanceMenuBoardDurationBackfill={openBoardDurationBackfillModal}
            openMaintenanceMenuRefreshBoardAvatars={() => void refreshBoardAvatars()}
            openMaintenanceMenuDeleteSummaries={() => setIsDeleteSummariesModalOpen(true)}
            canOpenMaintenanceBoardDurationBackfill={activeBoardDurationBackfillIds.length > 0}
            canOpenMaintenanceRefreshBoardAvatars={activeBoardAvatarRefreshIds.length > 0}
            shownVideosTotal={shownVideosTotal}
            scrollToEdge={scrollToEdge}
            scrollColumns={scrollColumns}
          />

          <Modal
            title={isSavedBoardActive ? "Add Lists" : "Add Channels"}
            open={isBulkModalOpen}
            onCancel={() => {
              setIsBulkModalOpen(false);
              bulkInputDraftRef.current = bulkInput;
            }}
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
              key={`bulk-input-${isBulkModalOpen ? "open" : "closed"}-${activeBoardId}`}
              defaultValue={bulkInput}
              onChange={(event) => {
                bulkInputDraftRef.current = event.target.value;
              }}
              autoSize={{ minRows: 6, maxRows: 12 }}
              placeholder={
                isSavedBoardActive
                  ? "List One\nList Two\nList Three"
                  : "@channelOne\n@channelTwo\n@channelThree"
              }
            />
          </Modal>
        </>
      )}

      <VideoPlayerModal
        activeVideo={activeVideo}
        closeVideoModal={closeVideoModal}
        stopPlaylist={stopPlaylist}
        videoModalWrapRef={videoModalWrapRef}
        toggleVideoFullscreen={toggleVideoFullscreen}
        copiedLinkVideoId={copiedLinkVideoId}
        copyVideoLink={copyVideoLink}
        openSaveVideoModal={openSaveVideoModalFromPlayer}
        saveDestinationColumnsLength={saveDestinationColumns.length}
        markWatchedAndAdvanceOrClose={markWatchedAndAdvanceOrCloseFromSummaries}
        isPlaylistActive={isPlaylistActive}
        playlistIndex={playlistIndex}
        playlistQueueLength={playlistQueue.length}
        playlistScope={playlistScope}
        playlistChannelLabel={playlistChannelLabel}
        isSavedBoardActive={isSavedBoardActive}
        playlistOrderLabel={playlistOrderLabel}
      />

      {transcriptVideo ? (
        <Suspense fallback={null}>
          <TranscriptSummaryModal
            transcriptVideo={transcriptVideo}
            summaryHydrating={summaryHydrating}
            transcriptHydrating={transcriptHydrating}
            transcriptLoading={transcriptLoading}
            transcriptText={transcriptText}
            transcriptError={transcriptError}
            transcriptViewMode={transcriptViewMode}
            isTranscriptCopied={isTranscriptCopied}
            summaryLoading={summaryLoading}
            summaryText={summaryText}
            summaryKeyPoints={summaryKeyPoints}
            summaryError={summaryError}
            summaryModel={summaryModel}
            isPublishingSummary={isPublishingSummary}
            publishSummaryFeedback={publishSummaryFeedback}
            summaryFormats={summaryFormats}
            summaryModelPresets={summaryModelPresets}
            activeSummaryFormat={activeSummaryFormat}
            isSummaryPromptEditMode={isSummaryPromptEditMode}
            editingSummaryFormatId={editingSummaryFormatId}
            summaryFormatNameDraft={summaryFormatNameDraft}
            summaryPromptDraft={summaryPromptDraft}
            summaryFormatModelDraft={summaryFormatModelDraft}
            isNewSummaryModelDraftMode={isNewSummaryModelDraftMode}
            summaryFormatDefaultDraft={summaryFormatDefaultDraft}
            hasPublishableSummary={hasPublishableSummary}
            isSummaryBusy={isSummaryBusy}
            onCancel={closeTranscriptModal}
            setSummaryFormatNameDraft={setSummaryFormatNameDraft}
            setSummaryPromptDraft={setSummaryPromptDraft}
            setSummaryFormatModelDraft={setSummaryFormatModelDraft}
            setIsNewSummaryModelDraftMode={setIsNewSummaryModelDraftMode}
            setSummaryFormatDefaultDraft={setSummaryFormatDefaultDraft}
            setActiveSummaryFormatId={setActiveSummaryFormatId}
            setIsSummaryPromptEditMode={setIsSummaryPromptEditMode}
            cancelSummaryFormatEditing={cancelSummaryFormatEditing}
            handleTranscriptViewModeChange={handleTranscriptViewModeChange}
            copyTranscriptText={copyTranscriptText}
            regenerateSummary={regenerateSummary}
            publishCurrentVideoSummary={publishCurrentVideoSummary}
            openSummaryFormatEditor={openSummaryFormatEditor}
            moveSummaryFormat={moveSummaryFormat}
            removeSummaryModelPreset={removeSummaryModelPreset}
            saveSummaryPromptAndClose={saveSummaryPromptAndClose}
            deleteSummaryFormatAndClose={deleteSummaryFormatAndClose}
          />
        </Suspense>
      ) : null}

      {boardSummaryAggregateState?.open ? (
        <BoardSummaryAggregateModal
          open={boardSummaryAggregateState.open}
          loading={boardSummaryAggregateState.loading}
          error={boardSummaryAggregateState.error}
          summaryText={boardSummaryAggregateState.summaryText}
          summaryKeyPoints={boardSummaryAggregateState.keyPoints}
          summaryModel={boardSummaryAggregateState.model}
          summaryFormats={summaryFormats}
          selectedSummaryFormatId={
            resolveBoardSummaryFormat(
              summaryFormats,
              boardSummaryAggregateState.selectedFormatId
            ).id
          }
          isCopied={isBoardSummaryAggregateCopied}
          onSummaryFormatChange={handleBoardSummaryAggregateFormatChange}
          onCancel={() => setBoardSummaryAggregateState(null)}
          onCopy={copyBoardSummaryAggregate}
        />
      ) : null}

      {!isBoardSummariesPage ? (
        <BoardColumns
          scrollRef={scrollRef}
          activeBoardId={activeBoardId}
          isSavedBoardActive={isSavedBoardActive}
          columns={columns}
          visibleColumns={visibleColumns}
          hiddenColumns={hiddenColumns}
          hiddenColumnIdSet={hiddenColumnIdSet}
          brokenChannelThumbnailKeys={brokenChannelThumbnailKeys}
          savedListPlaceholderIcon={SAVED_LIST_PLACEHOLDER_ICON}
          channelPlaceholderIcon={CHANNEL_PLACEHOLDER_ICON}
          copiedLinkVideoId={copiedLinkVideoId}
          videoFilter={videoFilter}
          saveDestinationColumnsLength={saveDestinationColumns.length}
          moveDestinationBoardsLength={moveDestinationBoards.length}
          savedBoardColumnsLength={savedBoardColumns.length}
          filteredVideosByColumnId={filteredVideosByColumnId}
          isVideoMarkedWatched={(videoId) => isVideoMarkedWatched(watchedVideos, videoId)}
          videoStatsBackfillInFlight={videoStatsBackfillInFlight}
          videoMetaFeedbackById={videoMetaFeedbackById}
          formatVideoMeta={formatVideoMeta}
          backfillVideoStats={backfillVideoStats}
          getVideoThumbnailSrc={getVideoThumbnailSrc}
          handleVideoThumbnailError={handleVideoThumbnailError}
          moveColumnById={moveColumnById}
          openMoveColumnModal={openMoveColumnModal}
          setSavedSortMode={handleSetSavedSortMode}
          runFetch={runFetch}
          playChannelVideos={(column) => playChannelVideos(column as ColumnState)}
          copyAllVideoLinks={copyAllVideoLinks}
          openRemoveAllSavedColumnModal={(column) => openRemoveAllSavedColumnModal(column as ColumnState)}
          openBulkWatchColumnAction={(column, videoIds, watched) =>
            openBulkWatchColumnAction(column as ColumnState, videoIds, watched)
          }
          setDeletingColumnId={setDeletingColumnId}
          hideVisibleColumn={hideVisibleColumn}
          revealHiddenColumn={revealHiddenColumn}
          openEditSavedListModal={(column) => openEditSavedListModal(column as ColumnState)}
          openEditChannelModal={(column) => openEditChannelModal(column as ColumnState)}
          openTranscript={openTranscript}
          copyVideoLink={copyVideoLink}
          openSaveVideoModal={openSaveVideoModal}
          toggleWatched={toggleWatched}
          openVideo={openVideo}
          openMoveSavedVideoModal={openMoveSavedVideoModal}
          setDeletingSavedVideo={setDeletingSavedVideo}
          moveSavedVideoInManualOrder={moveSavedVideoInManualOrder}
          addColumn={addColumn}
          onLoadedChannelThumbnail={handleLoadedChannelThumbnail}
          onBrokenChannelThumbnail={handleBrokenChannelThumbnail}
        />
      ) : null}
      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        className="backup-file-input"
        onChange={handleImportBackup}
      />

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
            renderItem={(log: ErrorLogEntry) => (
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
        title="Delete Summaries"
        open={isDeleteSummariesModalOpen}
        onCancel={() => setIsDeleteSummariesModalOpen(false)}
        onOk={() => void handleClearAllCachedSummaries()}
        okText="Delete"
        okButtonProps={{ danger: true, className: "delete-confirm-ok" }}
        width={360}
      >
        <Text>Delete all cached summaries?</Text>
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
          renameBoardInputDraftRef.current = "";
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
          key={`rename-board-${isRenameBoardModalOpen ? "open" : "closed"}-${editingBoard?.id ?? "none"}`}
          defaultValue={renameBoardInput}
          onChange={(event) => {
            renameBoardInputDraftRef.current = event.target.value;
          }}
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
          savedListNameDraftRef.current = "";
        }}
        onOk={confirmEditSavedListName}
        okText="Save"
        width={360}
      >
        <Input
          key={`saved-list-${editingSavedListColumnId ?? "none"}-${editingSavedListColumnId !== null ? "open" : "closed"}`}
          defaultValue={savedListNameInput}
          onChange={(event) => {
            savedListNameDraftRef.current = event.target.value;
          }}
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
          channelNameDraftRef.current = "";
        }}
        onOk={confirmEditChannelName}
        okText="Save"
        width={360}
      >
        <Input
          key={`channel-name-${editingChannelColumnId ?? "none"}-${editingChannelColumnId !== null ? "open" : "closed"}`}
          defaultValue={channelNameInput}
          onChange={(event) => {
            channelNameDraftRef.current = event.target.value;
          }}
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
          setPendingSummarySaveRemovalVideoId(null);
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
