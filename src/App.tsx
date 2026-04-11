import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Alert,
  Button,
  Checkbox,
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
  fetchSummaryByVideoInput,
  fetchTranscriptByVideoInput,
  fetchPlaylistDiscoveryPage,
  fetchVideoStatsByVideoIds,
  resolveChannelByInputWithThumbnail,
  resolveChannelByHandleWithThumbnail
} from "./api/youtube";
import { publishVideoSummary } from "./api/publisher";
import { normalizeHandle } from "./utils/handle";
import type { VideoItem } from "./types/youtube";
import fixtureBoards from "./fixtures/fixture-boards.json";

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
const TRANSCRIPT_CACHE_KEY_PREFIX = "youtube-watch:transcript:v1:";
const TRANSCRIPT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SUMMARY_CACHE_KEY_PREFIX = "youtube-watch:summary:v2:";
const SUMMARY_PROMPT_STORAGE_KEY = "youtube-watch:summary-prompt:v1";
const SUMMARY_FORMATS_STORAGE_KEY = "youtube-watch:summary-formats:v1";
const SUMMARY_MODEL_PRESETS_STORAGE_KEY = "youtube-watch:summary-model-presets:v1";
const DEFAULT_SUMMARY_FORMAT_ID = "summary-default";
const NEW_SUMMARY_FORMAT_OPTION = "__new_summary_format__";
const ALL_SUMMARY_FORMATS_OPTION = "__all_summary_formats__";
const NEW_SUMMARY_MODEL_OPTION = "__new_summary_model__";
const SUMMARY_MODE_OPTION_PREFIX = "summary:";
const DEFAULT_SUMMARY_PROMPT = [
  "Focus on practical takeaways.",
  "Keep summary concise.",
  "Highlight important risks and decisions."
].join(" ");
const DEFAULT_SUMMARY_FORMAT_NAME = "SUMMARY";
const DEFAULT_SUMMARY_MODEL_PRESETS: Array<{ value: string; label: string }> = [
  { value: "", label: "DEFAULT (ENV)" },
  { value: "openai/gpt-4o-mini", label: "OPENAI GPT-4O-MINI" },
  { value: "google/gemini-2.5-flash-lite", label: "GEMINI 2.5 FLASH-LITE" },
  { value: "google/gemini-2.5-flash", label: "GEMINI 2.5 FLASH" },
  { value: "qwen/qwen3.6-plus:free", label: "QWEN 3.6 PLUS FREE" },
  { value: "nvidia/nemotron-3-super-120b-a12b:free", label: "NEMOTRON FREE" },
  { value: "minimax/minimax-m2.7", label: "MINIMAX M2.7" }
];
const LEGACY_HANDLE_STORAGE_KEY = "youtube-watch:handles:v1";
const LEGACY_COLUMNS_STORAGE_KEY = "youtube-watch:columns:v2";
const LEGACY_WATCHED_STORAGE_KEY = "youtube-watch:watched:v1";
const LEGACY_PLAYBACK_RATE_STORAGE_KEY = "youtube-watch:playback-rate:v1";
const VIDEO_PROGRESS_STORAGE_KEY = "youtube-watch:video-progress:v1";
const YOUTUBE_IFRAME_API_SRC = "https://www.youtube.com/iframe_api";

type VideoFilter = "all" | "new" | "watched";
type VideoWindowDays = 1 | 3 | 7 | 30 | 60 | 90 | 120 | 180 | 360;
type ChannelVideoWindowFilter =
  | VideoWindowDays
  | "older_1"
  | "older_3"
  | "older_7"
  | "older_30"
  | "older_60";
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
type SummaryFormat = {
  id: string;
  name: string;
  prompt: string;
  model: string;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
};
type SummaryModelPreset = {
  value: string;
  label: string;
};
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
  "older_1",
  "older_3",
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

type YouTubePlayer = {
  destroy: () => void;
  setPlaybackRate: (suggestedRate: number) => void;
  getAvailablePlaybackRates: () => number[];
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration?: () => number;
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

type LazyRenderProps = {
  children: ReactNode;
  minHeight?: number;
  className?: string;
};

function LazyRender({ children, minHeight = 320, className }: LazyRenderProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isVisible) {
      return;
    }

    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { root: null, rootMargin: "700px 0px", threshold: 0.01 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible]);

  return (
    <div ref={rootRef} className={className}>
      {isVisible ? children : <div className="video-tile-placeholder" style={{ minHeight }} />}
    </div>
  );
}

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
    appAgent?: AppAgentApi;
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
    value === "older_1" ||
    value === "older_3" ||
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

type TranscriptCacheEntry = {
  text: string;
  cachedAt: number;
};

type SummaryCacheEntry = {
  summary: string;
  keyPoints: string[];
  model: string;
  transcriptHash: string;
  promptHash: string;
  cachedAt: number;
};

function createDefaultSummaryFormat(promptOverride?: string): SummaryFormat {
  const now = Date.now();
  const nextPrompt = (promptOverride ?? DEFAULT_SUMMARY_PROMPT).trim() || DEFAULT_SUMMARY_PROMPT;
  return {
    id: DEFAULT_SUMMARY_FORMAT_ID,
    name: DEFAULT_SUMMARY_FORMAT_NAME,
    prompt: nextPrompt,
    model: "",
    isDefault: true,
    createdAt: now,
    updatedAt: now
  };
}

function normalizeStoredSummaryFormats(input: unknown): SummaryFormat[] {
  if (!Array.isArray(input)) {
    return [createDefaultSummaryFormat()];
  }
  const sanitized = input
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const candidate = item as Partial<SummaryFormat>;
      const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
      const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
      const prompt = typeof candidate.prompt === "string" ? candidate.prompt.trim() : "";
      const model = typeof candidate.model === "string" ? candidate.model.trim() : "";
      if (!id || !name || !prompt) {
        return null;
      }
      return {
        id,
        name,
        prompt,
        model,
        isDefault: candidate.isDefault === true,
        createdAt:
          typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt)
            ? candidate.createdAt
            : Date.now(),
        updatedAt:
          typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt)
            ? candidate.updatedAt
            : Date.now()
      };
    })
    .filter((item): item is SummaryFormat => item !== null);

  if (sanitized.length === 0) {
    return [createDefaultSummaryFormat()];
  }

  const defaultCount = sanitized.filter((item) => item.isDefault).length;
  if (defaultCount !== 1) {
    sanitized.forEach((item, index) => {
      item.isDefault = index === 0;
    });
  }
  return sanitized;
}

function getDefaultSummaryFormat(formats: SummaryFormat[]): SummaryFormat {
  return formats.find((item) => item.isDefault) ?? formats[0] ?? createDefaultSummaryFormat();
}

function normalizeSummaryModelPresets(input: unknown): SummaryModelPreset[] {
  const defaults = [...DEFAULT_SUMMARY_MODEL_PRESETS];
  if (!Array.isArray(input)) {
    return defaults;
  }

  const merged = [...defaults];
  const existingValues = new Set(merged.map((item) => item.value.trim().toLowerCase()));

  input.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const candidate = item as Partial<SummaryModelPreset>;
    const value = typeof candidate.value === "string" ? candidate.value.trim() : "";
    if (!value) {
      return;
    }
    const key = value.toLowerCase();
    if (existingValues.has(key)) {
      return;
    }
    const label = typeof candidate.label === "string" && candidate.label.trim().length > 0
      ? candidate.label.trim()
      : value.toUpperCase();
    merged.push({ value, label });
    existingValues.add(key);
  });

  return merged;
}

function readStoredSummaryModelPresets(): SummaryModelPreset[] {
  if (typeof window === "undefined") {
    return [...DEFAULT_SUMMARY_MODEL_PRESETS];
  }
  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") {
      return [...DEFAULT_SUMMARY_MODEL_PRESETS];
    }
    const raw = storage.getItem(SUMMARY_MODEL_PRESETS_STORAGE_KEY);
    if (!raw) {
      return [...DEFAULT_SUMMARY_MODEL_PRESETS];
    }
    return normalizeSummaryModelPresets(JSON.parse(raw));
  } catch {
    return [...DEFAULT_SUMMARY_MODEL_PRESETS];
  }
}

function buildAllFormatsCombinedPrompt(formats: SummaryFormat[]): string {
  const normalizedFormats = formats
    .map((format) => ({
      id: format.id.trim(),
      name: format.name.trim() || "FORMAT",
      prompt: format.prompt.trim()
    }))
    .filter((format) => format.id && format.prompt);

  const instructionBlock = normalizedFormats
    .map(
      (format, index) =>
        `${index + 1}. ${format.name}\nInstruction: ${format.prompt}`
    )
    .join("\n\n");

  return [
    "Generate one combined response containing all requested formats.",
    "Use only transcript content. No fabricated facts.",
    "Return plain markdown text only.",
    "For each format, output:",
    "- A heading: ## <FORMAT NAME>",
    "- Then the formatted content based on its instruction.",
    "Do not add any preface or footer.",
    "",
    "Formats:",
    instructionBlock
  ].join("\n");
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

function looksLikeMarkdown(value: string): boolean {
  const text = value.trim();
  if (!text) {
    return false;
  }
  return (
    /^#{1,6}\s/m.test(text) ||
    /(^|\n)\s*[-*+]\s+/.test(text) ||
    /(^|\n)\s*\d+\.\s+/.test(text) ||
    /\[.+?\]\(.+?\)/.test(text) ||
    /\*\*[^*]+\*\*/.test(text) ||
    /`[^`]+`/.test(text) ||
    /^>\s/m.test(text)
  );
}

function preserveTreeBlocksInMarkdown(value: string): string {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  const isTreeLine = (line: string): boolean => /[│├└─]/.test(line) || /^\s*\|/.test(line);
  const chunks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    if (!isTreeLine(lines[index])) {
      chunks.push(lines[index]);
      index += 1;
      continue;
    }

    const treeLines: string[] = [];
    while (index < lines.length && isTreeLine(lines[index])) {
      treeLines.push(lines[index]);
      index += 1;
    }
    chunks.push("```text");
    chunks.push(...treeLines);
    chunks.push("```");
  }

  return chunks.join("\n");
}

function readCachedTranscript(videoId: string): string | null {
  if (typeof window === "undefined" || videoId.trim().length === 0) {
    return null;
  }

  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") {
      return null;
    }
    const raw = storage.getItem(`${TRANSCRIPT_CACHE_KEY_PREFIX}${videoId}`);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<TranscriptCacheEntry>;
    if (typeof parsed.text !== "string" || typeof parsed.cachedAt !== "number") {
      storage.removeItem(`${TRANSCRIPT_CACHE_KEY_PREFIX}${videoId}`);
      return null;
    }
    if (Date.now() - parsed.cachedAt > TRANSCRIPT_CACHE_TTL_MS) {
      storage.removeItem(`${TRANSCRIPT_CACHE_KEY_PREFIX}${videoId}`);
      return null;
    }
    const text = parsed.text.trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

function writeCachedTranscript(videoId: string, text: string): void {
  if (typeof window === "undefined" || videoId.trim().length === 0) {
    return;
  }
  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.setItem !== "function") {
      return;
    }
    const payload: TranscriptCacheEntry = {
      text,
      cachedAt: Date.now()
    };
    storage.setItem(`${TRANSCRIPT_CACHE_KEY_PREFIX}${videoId}`, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures.
  }
}

function pruneCachedTranscriptAndSummary(storage: Storage): boolean {
  const transcriptKeys: string[] = [];
  const summaryEntries: Array<{ key: string; cachedAt: number }> = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) {
      continue;
    }
    if (key.startsWith(TRANSCRIPT_CACHE_KEY_PREFIX)) {
      transcriptKeys.push(key);
      continue;
    }
    if (!key.startsWith(SUMMARY_CACHE_KEY_PREFIX)) {
      continue;
    }
    let cachedAt = 0;
    try {
      const raw = storage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as { cachedAt?: unknown };
        if (typeof parsed.cachedAt === "number" && Number.isFinite(parsed.cachedAt)) {
          cachedAt = parsed.cachedAt;
        }
      }
    } catch {
      cachedAt = 0;
    }
    summaryEntries.push({ key, cachedAt });
  }

  if (transcriptKeys.length > 0) {
    transcriptKeys.forEach((key) => storage.removeItem(key));
    return true;
  }

  if (summaryEntries.length === 0) {
    return false;
  }

  summaryEntries.sort((a, b) => a.cachedAt - b.cachedAt);
  const removeCount = Math.max(1, Math.ceil(summaryEntries.length * 0.25));
  summaryEntries.slice(0, removeCount).forEach((entry) => storage.removeItem(entry.key));
  return true;
}

function readStoredSummaryPrompt(): string {
  if (typeof window === "undefined") {
    return DEFAULT_SUMMARY_PROMPT;
  }
  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") {
      return DEFAULT_SUMMARY_PROMPT;
    }
    const raw = storage.getItem(SUMMARY_PROMPT_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SUMMARY_PROMPT;
    }
    const parsed = String(raw).trim();
    return parsed.length > 0 ? parsed : DEFAULT_SUMMARY_PROMPT;
  } catch {
    return DEFAULT_SUMMARY_PROMPT;
  }
}

function readStoredSummaryFormats(): SummaryFormat[] {
  if (typeof window === "undefined") {
    return [createDefaultSummaryFormat()];
  }
  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") {
      return [createDefaultSummaryFormat()];
    }
    const raw = storage.getItem(SUMMARY_FORMATS_STORAGE_KEY);
    if (raw) {
      return normalizeStoredSummaryFormats(JSON.parse(raw));
    }
    const legacyPrompt = readStoredSummaryPrompt();
    return [createDefaultSummaryFormat(legacyPrompt)];
  } catch {
    return [createDefaultSummaryFormat()];
  }
}

function readCachedSummary(
  videoId: string,
  transcriptText: string,
  promptText: string
): SummaryCacheEntry | null {
  if (typeof window === "undefined" || videoId.trim().length === 0) {
    return null;
  }
  const transcriptHash = hashText(transcriptText.trim());
  const promptHash = hashText(promptText.trim());
  const cacheKey = `${SUMMARY_CACHE_KEY_PREFIX}${videoId}:${promptHash}`;
  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") {
      return null;
    }
    const raw = storage.getItem(cacheKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<SummaryCacheEntry>;
    if (
      typeof parsed.summary !== "string" ||
      !Array.isArray(parsed.keyPoints) ||
      typeof parsed.model !== "string" ||
      typeof parsed.transcriptHash !== "string" ||
      typeof parsed.promptHash !== "string" ||
      typeof parsed.cachedAt !== "number"
    ) {
      storage.removeItem(cacheKey);
      return null;
    }
    if (parsed.transcriptHash !== transcriptHash) {
      return null;
    }
    if (parsed.promptHash !== promptHash) {
      return null;
    }
    const keyPoints = parsed.keyPoints
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    const summary = parsed.summary.trim();
    if (!summary && keyPoints.length === 0) {
      return null;
    }
    return {
      summary,
      keyPoints,
      model: parsed.model.trim(),
      transcriptHash: parsed.transcriptHash,
      promptHash: parsed.promptHash,
      cachedAt: parsed.cachedAt
    };
  } catch {
    return null;
  }
}

function writeCachedSummary(
  videoId: string,
  transcriptText: string,
  promptText: string,
  payload: { summary: string; keyPoints: string[]; model: string }
): void {
  if (typeof window === "undefined" || videoId.trim().length === 0) {
    return;
  }
  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.setItem !== "function") {
      return;
    }
    const promptHash = hashText(promptText.trim());
    const cacheKey = `${SUMMARY_CACHE_KEY_PREFIX}${videoId}:${promptHash}`;
    const cacheEntry: SummaryCacheEntry = {
      summary: payload.summary,
      keyPoints: payload.keyPoints,
      model: payload.model,
      transcriptHash: hashText(transcriptText.trim()),
      promptHash,
      cachedAt: Date.now()
    };
    storage.setItem(cacheKey, JSON.stringify(cacheEntry));
  } catch {
    // Ignore storage write failures.
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
    videoWindowDays: DEFAULT_VIDEO_WINDOW_DAYS,
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

function isFixtureModeEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).get("fixture") === "1";
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

function matchesVideoIdKey(storedVideoId: string, targetVideoId: string): boolean {
  return storedVideoId.toLowerCase() === targetVideoId.toLowerCase();
}

function isVideoMarkedWatched(
  watchedVideos: Record<string, boolean>,
  videoId: string
): boolean {
  if (watchedVideos[videoId] === true) {
    return true;
  }
  return Object.entries(watchedVideos).some(
    ([storedVideoId, watched]) => watched === true && matchesVideoIdKey(storedVideoId, videoId)
  );
}

function collectBoardMissingDurationNewVideoIds(board: BoardState): string[] {
  const unique = new Set<string>();
  board.columns.forEach((column) => {
    column.videos.forEach((video) => {
      const isWatched = isVideoMarkedWatched(board.watchedVideos, video.videoId);
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
  if (
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

type VideoProgressEntry = {
  seconds: number;
  updatedAt: number;
};

function readStoredVideoProgress(): Record<string, VideoProgressEntry> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") {
      return {};
    }
    const raw = storage.getItem(VIDEO_PROGRESS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, VideoProgressEntry] =>
          typeof entry[0] === "string" &&
          !!entry[1] &&
          typeof entry[1] === "object" &&
          typeof (entry[1] as { seconds?: unknown }).seconds === "number" &&
          Number.isFinite((entry[1] as { seconds?: number }).seconds) &&
          (entry[1] as { seconds: number }).seconds >= 0 &&
          typeof (entry[1] as { updatedAt?: unknown }).updatedAt === "number" &&
          Number.isFinite((entry[1] as { updatedAt?: number }).updatedAt)
      )
    );
  } catch {
    return {};
  }
}

function App() {
  const fixtureMode = isFixtureModeEnabled();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const videoModalWrapRef = useRef<HTMLDivElement | null>(null);
  const fallbackIframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const playerReadyRef = useRef(false);
  const playerSessionRef = useRef(0);
  const playerFallbackLockedRef = useRef(false);
  const fallbackPlaybackSecondsRef = useRef(0);
  const fallbackIsPlayingRef = useRef(false);
  const transcriptRequestIdRef = useRef(0);
  const videoMetaFeedbackTimeoutsRef = useRef<Record<string, number>>({});
  const linkCopyFeedbackTimeoutRef = useRef<number | null>(null);
  const transcriptCopyFeedbackTimeoutRef = useRef<number | null>(null);
  const logoSpinTimeoutRef = useRef<number | null>(null);
  const [playerHostNode, setPlayerHostNode] = useState<HTMLDivElement | null>(null);
  const initialBoardsState = fixtureMode ? createFixtureBoardsState() : getInitialBoardsState();
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
  const [isDeleteSummariesModalOpen, setIsDeleteSummariesModalOpen] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [isLogoSpinning, setIsLogoSpinning] = useState(false);
  const [errorLogs, setErrorLogs] = useState<ErrorLogEntry[]>(readStoredErrorLogs);
  const [quotaEstimate, setQuotaEstimate] = useState<QuotaEstimateState>(readStoredQuotaEstimate);
  const [videoProgressById, setVideoProgressById] = useState<Record<string, VideoProgressEntry>>(
    readStoredVideoProgress
  );
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
  const [transcriptVideo, setTranscriptVideo] = useState<VideoItem | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptText, setTranscriptText] = useState("");
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [transcriptSourceHandle, setTranscriptSourceHandle] = useState<string>("");
  const [transcriptViewMode, setTranscriptViewMode] = useState<"transcript" | "summary">(
    "transcript"
  );
  const [isTranscriptCopied, setIsTranscriptCopied] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const [summaryKeyPoints, setSummaryKeyPoints] = useState<string[]>([]);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryModel, setSummaryModel] = useState("");
  const [isPublishingSummary, setIsPublishingSummary] = useState(false);
  const [publishSummaryFeedback, setPublishSummaryFeedback] = useState<InlineMetaFeedback | null>(
    null
  );
  const [summaryFormats, setSummaryFormats] = useState<SummaryFormat[]>(readStoredSummaryFormats);
  const [summaryModelPresets, setSummaryModelPresets] = useState<SummaryModelPreset[]>(
    readStoredSummaryModelPresets
  );
  const [activeSummaryFormatId, setActiveSummaryFormatId] = useState<string>(() =>
    getDefaultSummaryFormat(readStoredSummaryFormats()).id
  );
  const [isAllSummaryFormatsMode, setIsAllSummaryFormatsMode] = useState(false);
  const [isSummaryPromptEditMode, setIsSummaryPromptEditMode] = useState(false);
  const [editingSummaryFormatId, setEditingSummaryFormatId] = useState<string | null>(null);
  const [summaryFormatNameDraft, setSummaryFormatNameDraft] = useState<string>("");
  const [summaryPromptDraft, setSummaryPromptDraft] = useState<string>("");
  const [summaryFormatModelDraft, setSummaryFormatModelDraft] = useState<string>("");
  const [isNewSummaryModelDraftMode, setIsNewSummaryModelDraftMode] = useState<boolean>(false);
  const [summaryFormatDefaultDraft, setSummaryFormatDefaultDraft] = useState<boolean>(false);
  const bulkInputDraftRef = useRef("");
  const renameBoardInputDraftRef = useRef("");
  const savedListNameDraftRef = useRef("");
  const channelNameDraftRef = useRef("");
  const summaryFormatNameDraftRef = useRef("");
  const summaryPromptDraftRef = useRef("");
  const summaryFormatModelDraftRef = useRef("");
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
  const activeSummaryFormat =
    summaryFormats.find((item) => item.id === activeSummaryFormatId) ??
    getDefaultSummaryFormat(summaryFormats);
  const defaultSummaryFormat = getDefaultSummaryFormat(summaryFormats);
  const activeSummaryPrompt = isAllSummaryFormatsMode
    ? buildAllFormatsCombinedPrompt(summaryFormats)
    : activeSummaryFormat.prompt;
  const activeSummaryModel = isAllSummaryFormatsMode
    ? (defaultSummaryFormat.model ?? "").trim()
    : (activeSummaryFormat.model ?? "").trim();
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
  const columnScopeFilter = useMemo(
    () =>
      normalizeColumnScopeFilter(activeBoard?.columnScopeFilter ?? [COLUMN_SCOPE_ALL], columns),
    [activeBoard?.columnScopeFilter, columns]
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
  const filteredVideosByColumnId = useMemo(() => {
    const nextMap = new Map<string, VideoItem[]>();
    if (!activeBoard) {
      return nextMap;
    }
    const now = Date.now();
    columns.forEach((column) => {
      const sourceVideos = activeBoard.kind === "saved" ? sortSavedVideosByMode(column) : column.videos;
      const filteredVideos = sourceVideos.filter((video) => {
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
      nextMap.set(column.id, filteredVideos);
    });
    return nextMap;
  }, [activeBoard, columns, videoWindowDays, videoDurationFilter, watchedVideos, videoFilter]);

  const shownVideoCountByColumnId = useMemo(() => {
    const nextMap = new Map<string, number>();
    columns.forEach((column) => {
      nextMap.set(column.id, filteredVideosByColumnId.get(column.id)?.length ?? 0);
    });
    return nextMap;
  }, [columns, filteredVideosByColumnId]);

  const visibleColumns = useMemo(() => {
    if (columnScopeFilter.includes(COLUMN_SCOPE_ALL)) {
      return columns;
    }
    if (columnScopeFilter.includes(COLUMN_SCOPE_NOT_EMPTY)) {
      return columns.filter((column) => (shownVideoCountByColumnId.get(column.id) ?? 0) > 0);
    }
    return columns.filter((column) => columnScopeFilter.includes(column.id));
  }, [columnScopeFilter, columns, shownVideoCountByColumnId]);

  const shownVideosTotal = useMemo(
    () =>
      visibleColumns.reduce(
        (total, column) => total + (shownVideoCountByColumnId.get(column.id) ?? 0),
        0
      ),
    [visibleColumns, shownVideoCountByColumnId]
  );

  const visibleColumnIdSet = useMemo(
    () => new Set(visibleColumns.map((column) => column.id)),
    [visibleColumns]
  );

  const hiddenColumns = useMemo(
    () =>
      isSavedBoardActive
        ? []
        : columns.filter((column) => !visibleColumnIdSet.has(column.id)),
    [isSavedBoardActive, columns, visibleColumnIdSet]
  );

  const hiddenColumnIdSet = useMemo(
    () => new Set(hiddenColumns.map((column) => column.id)),
    [hiddenColumns]
  );
  const getShownVideosForColumn = (column: ColumnState, _now?: number): VideoItem[] =>
    filteredVideosByColumnId.get(column.id) ?? [];

  const columnScopeOptions = useMemo(
    () => [
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
    ],
    [columns, isSavedBoardActive]
  );
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
  const hasPublishableSummary =
    summaryText.trim().length > 0 ||
    summaryKeyPoints.some((point) => point.trim().length > 0);
  const isSummaryBusy = transcriptViewMode === "summary" && summaryLoading;

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
      if (transcriptCopyFeedbackTimeoutRef.current) {
        window.clearTimeout(transcriptCopyFeedbackTimeoutRef.current);
      }
      if (logoSpinTimeoutRef.current) {
        window.clearTimeout(logoSpinTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (fixtureMode) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    try {
      const storage = window.localStorage;
      storage.setItem(QUOTA_ESTIMATE_STORAGE_KEY, JSON.stringify(quotaEstimate));
    } catch {
      // Ignore local storage write errors.
    }
  }, [fixtureMode, quotaEstimate]);

  useEffect(() => {
    if (fixtureMode) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    try {
      const storage = window.localStorage;
      if (!storage || typeof storage.setItem !== "function") {
        return;
      }
      storage.setItem(VIDEO_PROGRESS_STORAGE_KEY, JSON.stringify(videoProgressById));
    } catch {
      // Ignore local storage write errors.
    }
  }, [fixtureMode, videoProgressById]);

  useEffect(() => {
    const exists = summaryFormats.some((item) => item.id === activeSummaryFormatId);
    if (!exists) {
      setActiveSummaryFormatId(getDefaultSummaryFormat(summaryFormats).id);
    }
  }, [activeSummaryFormatId, summaryFormats]);

  useEffect(() => {
    if (fixtureMode) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    try {
      const storage = window.localStorage;
      if (!storage || typeof storage.setItem !== "function") {
        return;
      }
      storage.setItem(SUMMARY_FORMATS_STORAGE_KEY, JSON.stringify(summaryFormats));
    } catch {
      // Ignore local storage write errors.
    }
  }, [fixtureMode, summaryFormats]);

  useEffect(() => {
    if (fixtureMode) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    try {
      const storage = window.localStorage;
      if (!storage || typeof storage.setItem !== "function") {
        return;
      }
      storage.setItem(
        SUMMARY_MODEL_PRESETS_STORAGE_KEY,
        JSON.stringify(summaryModelPresets)
      );
    } catch {
      // Ignore local storage write errors.
    }
  }, [fixtureMode, summaryModelPresets]);

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
      const boardsPayload = JSON.stringify(persistedBoards);
      let didPersist = false;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          storage.setItem(BOARDS_STORAGE_KEY, boardsPayload);
          storage.setItem(ACTIVE_BOARD_ID_STORAGE_KEY, activeBoardId);
          didPersist = true;
          break;
        } catch {
          if (!pruneCachedTranscriptAndSummary(storage)) {
            break;
          }
        }
      }
      if (!didPersist) {
        // eslint-disable-next-line no-console
        console.warn("Failed to persist boards to localStorage.");
      }
    } catch {
      // Ignore write failures (private mode / restricted environments).
    }
  }, [activeBoardId, boards, fixtureMode]);

  useEffect(() => {
    if (fixtureMode) {
      return;
    }
    try {
      const storage = window.localStorage;
      if (!storage || typeof storage.setItem !== "function") {
        return;
      }
      storage.setItem(ERROR_LOGS_STORAGE_KEY, JSON.stringify(errorLogs.slice(0, 100)));
    } catch {
      // Ignore write failures.
    }
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

  useEffect(() => {
    if (!activeVideo || !playerHostNode) {
      return;
    }

    let isCancelled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    const playerSession = playerSessionRef.current + 1;
    playerSessionRef.current = playerSession;
    const shouldForceIframeFallback =
      typeof activeVideo.durationSeconds === "number" && activeVideo.durationSeconds <= 60;
    setAvailablePlaybackRates([...PLAYBACK_RATE_OPTIONS]);
    setPlaybackRate(preferredPlaybackRate);
    setIsPlayerReady(false);
    playerReadyRef.current = false;
    playerFallbackLockedRef.current = false;
    setUseIframeFallback(false);
    if (shouldForceIframeFallback) {
      playerFallbackLockedRef.current = true;
      setUseIframeFallback(true);
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      playerHostNode.innerHTML = "";
      return () => {
        isCancelled = true;
        if (fallbackTimer) {
          clearTimeout(fallbackTimer);
        }
        if (playerRef.current) {
          playerRef.current.destroy();
          playerRef.current = null;
        }
        if (playerHostNode) {
          playerHostNode.innerHTML = "";
        }
        playerReadyRef.current = false;
      };
    }
    fallbackTimer = setTimeout(() => {
      if (!isCancelled && !playerReadyRef.current) {
        playerFallbackLockedRef.current = true;
        if (playerRef.current) {
          playerRef.current.destroy();
          playerRef.current = null;
        }
        playerHostNode.innerHTML = "";
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
        // Defensive cleanup: ensure no stale iframe remains attached in the host.
        playerHostNode.innerHTML = "";

        playerRef.current = new window.YT.Player(playerHostNode, {
          videoId: activeVideo.videoId,
          playerVars: {
            autoplay: 1,
            rel: 0
          },
          events: {
            onReady: (event) => {
              if (isCancelled || playerSessionRef.current !== playerSession) {
                try {
                  event.target.destroy();
                } catch {
                  // Ignore stale player cleanup failures.
                }
                return;
              }
              if (playerFallbackLockedRef.current) {
                try {
                  event.target.destroy();
                } catch {
                  // Ignore fallback cleanup failures.
                }
                playerRef.current = null;
                return;
              }
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
              const resumeSeconds = getResumeSecondsForVideo(activeVideo);
              if (typeof resumeSeconds === "number" && resumeSeconds > 0) {
                try {
                  event.target.seekTo(resumeSeconds, true);
                } catch {
                  // Ignore unsupported resume seek.
                }
              }
              focusVideoPlayerSurface();
              if (fallbackTimer) {
                clearTimeout(fallbackTimer);
                fallbackTimer = null;
              }
            },
            onStateChange: (event) => {
              if (isCancelled || playerSessionRef.current !== playerSession) {
                return;
              }
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
      if (playerHostNode) {
        playerHostNode.innerHTML = "";
      }
      if (playerSessionRef.current === playerSession) {
        playerSessionRef.current += 1;
      }
      playerReadyRef.current = false;
      playerFallbackLockedRef.current = false;
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
    const resumeSeconds = getResumeSecondsForVideo(activeVideo);
    fallbackPlaybackSecondsRef.current =
      typeof resumeSeconds === "number" && resumeSeconds > 0 ? resumeSeconds : 0;
    fallbackIsPlayingRef.current = true;
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

      if (isSeekShortcut && useIframeFallback) {
        event.preventDefault();
        const delta = key === "arrowleft" || key === "j" ? -10 : 10;
        const duration =
          typeof activeVideo.durationSeconds === "number" && Number.isFinite(activeVideo.durationSeconds)
            ? activeVideo.durationSeconds
            : Number.POSITIVE_INFINITY;
        const nextTime = Math.max(
          0,
          Math.min(duration, fallbackPlaybackSecondsRef.current + delta)
        );
        fallbackPlaybackSecondsRef.current = nextTime;
        sendFallbackPlayerCommand("seekTo", [nextTime, true]);
        return;
      }

      if (isSeekShortcut && playerRef.current) {
        event.preventDefault();
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

      if (isSpaceShortcut && useIframeFallback) {
        event.preventDefault();
        if (fallbackIsPlayingRef.current) {
          sendFallbackPlayerCommand("pauseVideo");
        } else {
          sendFallbackPlayerCommand("playVideo");
        }
        fallbackIsPlayingRef.current = !fallbackIsPlayingRef.current;
        return;
      }

      if (isSpaceShortcut && playerRef.current) {
        event.preventDefault();
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
        event.preventDefault();
        toggleVideoFullscreen();
      }

    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeVideo, useIframeFallback]);

  useEffect(() => {
    if (!activeVideo || !isPlayerReady || !playerRef.current) {
      return;
    }

    const saveProgressTick = (): void => {
      if (!playerRef.current) {
        return;
      }
      try {
        const currentTime = playerRef.current.getCurrentTime();
        if (!Number.isFinite(currentTime) || currentTime <= 1) {
          return;
        }
        const duration = activeVideo.durationSeconds;
        if (
          typeof duration === "number" &&
          Number.isFinite(duration) &&
          duration > 0 &&
          currentTime >= duration * 0.95
        ) {
          setVideoProgressById((previous) => {
            if (!previous[activeVideo.videoId]) {
              return previous;
            }
            const next = { ...previous };
            delete next[activeVideo.videoId];
            return next;
          });
          return;
        }
        setVideoProgressById((previous) => ({
          ...previous,
          [activeVideo.videoId]: {
            seconds: Math.max(0, Math.floor(currentTime)),
            updatedAt: Date.now()
          }
        }));
      } catch {
        // Ignore unsupported progress reads.
      }
    };

    const intervalId = window.setInterval(saveProgressTick, 5000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeVideo, isPlayerReady]);

  const setPlayerHost = (node: HTMLDivElement | null): void => {
    playerHostRef.current = node;
    setPlayerHostNode(node);
  };

  const sendFallbackPlayerCommand = (func: string, args: unknown[] = []): void => {
    const targetWindow = fallbackIframeRef.current?.contentWindow;
    if (!targetWindow) {
      return;
    }
    targetWindow.postMessage(
      JSON.stringify({
        event: "command",
        func,
        args
      }),
      "*"
    );
  };

  const focusVideoPlayerSurface = (): void => {
    const focusAttempt = (): void => {
      const iframeTarget = playerHostRef.current?.querySelector("iframe");
      const target = useIframeFallback
        ? videoModalWrapRef.current ?? playerHostRef.current
        : iframeTarget ?? playerHostRef.current;
      if (!target) {
        return;
      }
      try {
        if (iframeTarget && !useIframeFallback) {
          iframeTarget.setAttribute("tabindex", "0");
        }
        if (useIframeFallback && videoModalWrapRef.current) {
          videoModalWrapRef.current.setAttribute("tabindex", "0");
        }
        target.focus();
      } catch {
        // Ignore focus failures.
      }
    };

    [0, 80, 180, 320, 520].forEach((delay) => {
      window.setTimeout(focusAttempt, delay);
    });
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
        return;
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
        videos: fixtureChannel.videos.map(cloneVideo),
        lastFetchAt: new Date().toLocaleString()
      }));
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
    bulkInputDraftRef.current = "";
    setIsBulkModalOpen(true);
  };

  const removeColumnById = (columnIdToRemove: string): void => {
    if (!activeBoard) {
      return;
    }
    setBoard(activeBoard.id, (board) => {
      const nextColumns = board.columns.filter((column) => column.id !== columnIdToRemove);
      return {
        ...board,
        columns: nextColumns,
        columnScopeFilter: normalizeColumnScopeFilter(board.columnScopeFilter, nextColumns)
      };
    });
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
      setBoard(activeBoard.id, (board) => ({
        ...board,
        columns: [...board.columns, ...created]
      }));
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
    bulkInputDraftRef.current = "";
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
  }, [activeVideo]);

  const includeNewColumnsInScope = (board: BoardState, newColumnIds: string[]): string[] => {
    const normalizedScope = normalizeColumnScopeFilter(board.columnScopeFilter, board.columns);
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

  const setWatchedStatusAcrossBoards = (
    videoIds: string[],
    watched: boolean
  ): void => {
    if (videoIds.length === 0) {
      return;
    }
    setBoards((previous) =>
      previous.map((board) => {
        const next = { ...board.watchedVideos };
        videoIds.forEach((videoId) => {
          if (watched) {
            next[videoId] = true;
          } else {
            Object.keys(next).forEach((storedVideoId) => {
              if (matchesVideoIdKey(storedVideoId, videoId)) {
                delete next[storedVideoId];
              }
            });
          }
        });
        return {
          ...board,
          watchedVideos: next
        };
      })
    );
  };

  const markWatched = (videoId: string): void => {
    if (!activeBoard) {
      return;
    }
    setVideoProgressById((previous) => {
      if (!previous[videoId]) {
        return previous;
      }
      const next = { ...previous };
      delete next[videoId];
      return next;
    });
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
    if (activeVideo && playerRef.current && playerReadyRef.current) {
      try {
        const currentTime = playerRef.current.getCurrentTime();
        if (Number.isFinite(currentTime) && currentTime > 1) {
          const duration = activeVideo.durationSeconds;
          if (
            typeof duration === "number" &&
            Number.isFinite(duration) &&
            duration > 0 &&
            currentTime >= duration * 0.95
          ) {
            setVideoProgressById((previous) => {
              if (!previous[activeVideo.videoId]) {
                return previous;
              }
              const next = { ...previous };
              delete next[activeVideo.videoId];
              return next;
            });
          } else {
            setVideoProgressById((previous) => ({
              ...previous,
              [activeVideo.videoId]: {
                seconds: Math.max(0, Math.floor(currentTime)),
                updatedAt: Date.now()
              }
            }));
          }
        }
      } catch {
        // Ignore unsupported progress reads.
      }
    }
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

  const toggleVideoFullscreen = (): void => {
    const fullscreenTarget = useIframeFallback
      ? fallbackIframeRef.current ?? videoModalWrapRef.current
      : videoModalWrapRef.current ?? playerHostRef.current?.querySelector("iframe");
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

  const getResumeSecondsForVideo = (video: VideoItem): number | null => {
    if (activeBoard && isVideoMarkedWatched(activeBoard.watchedVideos, video.videoId)) {
      return null;
    }
    const stored = videoProgressById[video.videoId];
    if (!stored || !Number.isFinite(stored.seconds) || stored.seconds <= 1) {
      return null;
    }
    if (
      typeof video.durationSeconds === "number" &&
      Number.isFinite(video.durationSeconds) &&
      video.durationSeconds > 0 &&
      stored.seconds >= video.durationSeconds * 0.95
    ) {
      return null;
    }
    return Math.floor(stored.seconds);
  };

  const openTranscript = async (
    video: VideoItem,
    sourceHandleRaw?: string
  ): Promise<void> => {
    let normalizedSourceHandle = "";
    const candidate = (sourceHandleRaw ?? "").trim();
    if (candidate) {
      try {
        normalizedSourceHandle = normalizeHandle(candidate);
      } catch {
        normalizedSourceHandle = candidate.startsWith("@") ? candidate : `@${candidate}`;
      }
    }
    setTranscriptSourceHandle(normalizedSourceHandle);
    const defaultSummaryFormat = getDefaultSummaryFormat(summaryFormats);
    setIsAllSummaryFormatsMode(false);
    setActiveSummaryFormatId(defaultSummaryFormat.id);
    setEditingSummaryFormatId(defaultSummaryFormat.id);
    setTranscriptVideo(video);
    setTranscriptViewMode("summary");
    setIsSummaryPromptEditMode(false);
    setSummaryFormatNameDraft(defaultSummaryFormat.name);
    setSummaryPromptDraft(defaultSummaryFormat.prompt);
    setSummaryFormatModelDraft(defaultSummaryFormat.model ?? "");
    summaryFormatNameDraftRef.current = defaultSummaryFormat.name;
    summaryPromptDraftRef.current = defaultSummaryFormat.prompt;
    summaryFormatModelDraftRef.current = defaultSummaryFormat.model ?? "";
    setIsNewSummaryModelDraftMode(false);
    setSummaryFormatDefaultDraft(defaultSummaryFormat.isDefault);
    setTranscriptLoading(true);
    setTranscriptError(null);
    setTranscriptText("");
    setIsTranscriptCopied(false);
    setSummaryLoading(false);
    setSummaryText("");
    setSummaryKeyPoints([]);
    setSummaryError(null);
    setSummaryModel("");
    setIsPublishingSummary(false);
    setPublishSummaryFeedback(null);
    transcriptRequestIdRef.current += 1;
    const requestId = transcriptRequestIdRef.current;
    try {
      const cached = readCachedTranscript(video.videoId);
      if (cached) {
        if (requestId !== transcriptRequestIdRef.current) {
          return;
        }
        setTranscriptText(cached);
        return;
      }
      const payload = await fetchTranscriptByVideoInput({
        videoId: video.videoId,
        videoUrl: video.videoUrl
      });
      if (requestId !== transcriptRequestIdRef.current) {
        return;
      }
      const text = payload.text.trim();
      if (!text) {
        setTranscriptError("No transcript.");
        return;
      }
      setTranscriptText(text);
      writeCachedTranscript(video.videoId, text);
    } catch (error) {
      if (requestId !== transcriptRequestIdRef.current) {
        return;
      }
      const message = error instanceof Error ? error.message : "No transcript.";
      setTranscriptError(message);
    } finally {
      if (requestId === transcriptRequestIdRef.current) {
        setTranscriptLoading(false);
      }
    }
  };

  const loadSummary = async (options?: {
    force?: boolean;
    promptOverride?: string;
    modelOverride?: string;
    allowFetch?: boolean;
  }): Promise<void> => {
    if (!transcriptVideo || transcriptLoading || transcriptError || !transcriptText.trim()) {
      return;
    }
    if (summaryLoading) {
      return;
    }

    const promptToUse =
      typeof options?.promptOverride === "string" && options.promptOverride.trim().length > 0
        ? options.promptOverride.trim()
        : activeSummaryPrompt;
    const hasExplicitModelOverride =
      options !== undefined && Object.prototype.hasOwnProperty.call(options, "modelOverride");
    const modelToUse = hasExplicitModelOverride
      ? String(options?.modelOverride ?? "").trim()
      : activeSummaryModel;

    if (!options?.force) {
      const cached = readCachedSummary(
        transcriptVideo.videoId,
        transcriptText,
        `${promptToUse}\n__MODEL__:${modelToUse || ""}`
      );
      if (cached) {
        setSummaryText(cached.summary);
        setSummaryKeyPoints(cached.keyPoints);
        setSummaryError(null);
        setSummaryModel(cached.model);
        return;
      }
      if (options?.allowFetch !== true) {
        setSummaryText("");
        setSummaryKeyPoints([]);
        setSummaryError(null);
        setSummaryModel("");
        return;
      }
    }

    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const payload = await fetchSummaryByVideoInput({
        videoId: transcriptVideo.videoId,
        videoUrl: transcriptVideo.videoUrl,
        transcriptText,
        mode: "short",
        prompt: promptToUse,
        model: modelToUse || undefined
      });
      const nextSummary = payload.summary.trim();
      const nextKeyPoints = payload.keyPoints
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      if (!nextSummary && nextKeyPoints.length === 0) {
        setSummaryError("No summary.");
        return;
      }
      setSummaryText(nextSummary);
      setSummaryKeyPoints(nextKeyPoints);
      setSummaryModel(payload.model);
      writeCachedSummary(
        transcriptVideo.videoId,
        transcriptText,
        `${promptToUse}\n__MODEL__:${modelToUse || ""}`,
        {
          summary: nextSummary,
          keyPoints: nextKeyPoints,
          model: payload.model
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Summary failed.";
      setSummaryError(message);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    if (!transcriptVideo) {
      return;
    }
    if (transcriptViewMode !== "summary") {
      return;
    }
    if (isSummaryPromptEditMode) {
      return;
    }
    if (transcriptLoading || transcriptError) {
      return;
    }
    if (!transcriptText.trim()) {
      return;
    }
    if (summaryLoading || summaryError) {
      return;
    }
    if (summaryText.trim().length > 0 || summaryKeyPoints.length > 0) {
      return;
    }
    void loadSummary({ allowFetch: true });
  }, [
    transcriptVideo,
    transcriptViewMode,
    isSummaryPromptEditMode,
    transcriptLoading,
    transcriptError,
    transcriptText,
    summaryLoading,
    summaryError,
    summaryText,
    summaryKeyPoints,
    activeSummaryPrompt,
    activeSummaryModel
  ]);

  const openSummaryFormatEditor = (formatId: string | null): void => {
    const format =
      formatId !== null ? summaryFormats.find((item) => item.id === formatId) ?? null : null;
    setEditingSummaryFormatId(format?.id ?? null);
    setSummaryFormatNameDraft(format?.name ?? "");
    setSummaryPromptDraft(format?.prompt ?? "");
    setSummaryFormatModelDraft(format?.model ?? "");
    summaryFormatNameDraftRef.current = format?.name ?? "";
    summaryPromptDraftRef.current = format?.prompt ?? "";
    summaryFormatModelDraftRef.current = format?.model ?? "";
    setIsNewSummaryModelDraftMode(false);
    setSummaryFormatDefaultDraft(format?.isDefault ?? false);
    setIsSummaryPromptEditMode(true);
  };

  const switchToSummaryFormat = async (formatId: string): Promise<void> => {
    const format = summaryFormats.find((item) => item.id === formatId);
    if (!format) {
      return;
    }
    setIsAllSummaryFormatsMode(false);
    setActiveSummaryFormatId(format.id);
    setEditingSummaryFormatId(format.id);
    setSummaryFormatNameDraft(format.name);
    setSummaryPromptDraft(format.prompt);
    setSummaryFormatModelDraft(format.model ?? "");
    summaryFormatNameDraftRef.current = format.name;
    summaryPromptDraftRef.current = format.prompt;
    summaryFormatModelDraftRef.current = format.model ?? "";
    setIsNewSummaryModelDraftMode(false);
    setSummaryFormatDefaultDraft(format.isDefault);
    setIsSummaryPromptEditMode(false);
    setTranscriptViewMode("summary");
    setSummaryText("");
    setSummaryKeyPoints([]);
    setSummaryError(null);
    setSummaryModel("");
    if (!transcriptLoading && !transcriptError && transcriptText.trim().length > 0) {
      await loadSummary({
        force: false,
        allowFetch: true,
        promptOverride: format.prompt,
        modelOverride: format.model
      });
    }
  };

  const moveSummaryFormat = (formatId: string, direction: "up" | "down"): void => {
    const currentIndex = summaryFormats.findIndex((item) => item.id === formatId);
    if (currentIndex < 0) {
      return;
    }
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= summaryFormats.length) {
      return;
    }
    const nextFormats = [...summaryFormats];
    const [moved] = nextFormats.splice(currentIndex, 1);
    nextFormats.splice(targetIndex, 0, moved);
    setSummaryFormats(normalizeStoredSummaryFormats(nextFormats));
  };

  const handleTranscriptViewModeChange = async (
    mode: "transcript" | "summary" | string
  ): Promise<void> => {
    setPublishSummaryFeedback(null);
    if (mode === NEW_SUMMARY_FORMAT_OPTION) {
      setIsAllSummaryFormatsMode(false);
      setTranscriptViewMode("summary");
      openSummaryFormatEditor(null);
      return;
    }
    if (mode === ALL_SUMMARY_FORMATS_OPTION) {
      setIsAllSummaryFormatsMode(true);
      setIsSummaryPromptEditMode(false);
      setTranscriptViewMode("summary");
      setSummaryText("");
      setSummaryKeyPoints([]);
      setSummaryError(null);
      setSummaryModel("");
      if (!transcriptLoading && !transcriptError && transcriptText.trim().length > 0) {
        const allFormatsDefault = getDefaultSummaryFormat(summaryFormats);
        await loadSummary({
          force: false,
          allowFetch: true,
          promptOverride: buildAllFormatsCombinedPrompt(summaryFormats),
          modelOverride: allFormatsDefault.model ?? ""
        });
      }
      return;
    }
    if (mode === "transcript") {
      setIsAllSummaryFormatsMode(false);
      setIsSummaryPromptEditMode(false);
      if (transcriptViewMode === "transcript") {
        return;
      }
      setTranscriptViewMode("transcript");
      return;
    }
    if (mode.startsWith(SUMMARY_MODE_OPTION_PREFIX)) {
      const formatId = mode.slice(SUMMARY_MODE_OPTION_PREFIX.length);
      await switchToSummaryFormat(formatId);
      return;
    }
    setIsSummaryPromptEditMode(false);
    setTranscriptViewMode("summary");
    if (!summaryText && summaryKeyPoints.length === 0 && !summaryError) {
      await loadSummary({ allowFetch: true });
    }
  };

  const regenerateSummary = async (): Promise<void> => {
    setPublishSummaryFeedback(null);
    setIsSummaryPromptEditMode(false);
    setTranscriptViewMode("summary");
    await loadSummary({ force: true });
  };

  const addSummaryModelPresetIfMissing = (modelValue: string): void => {
    const trimmed = modelValue.trim();
    if (!trimmed) {
      return;
    }
    setSummaryModelPresets((previous) => {
      const exists = previous.some(
        (item) => item.value.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (exists) {
        return previous;
      }
      return [...previous, { value: trimmed, label: trimmed.toUpperCase() }];
    });
  };

  const removeSummaryModelPreset = (modelValue: string): void => {
    const trimmed = modelValue.trim();
    if (!trimmed) {
      return;
    }
    setSummaryModelPresets((previous) =>
      previous.filter((item) => item.value.trim().toLowerCase() !== trimmed.toLowerCase())
    );
    if (summaryFormatModelDraft.trim().toLowerCase() === trimmed.toLowerCase()) {
      setSummaryFormatModelDraft("");
      summaryFormatModelDraftRef.current = "";
    }
  };

  const saveSummaryPromptAndClose = async (): Promise<void> => {
    setPublishSummaryFeedback(null);
    const nextName = (
      typeof summaryFormatNameDraftRef.current === "string"
        ? summaryFormatNameDraftRef.current
        : summaryFormatNameDraft
    )
      .trim()
      .slice(0, 20);
    const nextPrompt =
      (
        typeof summaryPromptDraftRef.current === "string"
          ? summaryPromptDraftRef.current
          : summaryPromptDraft
      ).trim() || DEFAULT_SUMMARY_PROMPT;
    const nextModel = (
      typeof summaryFormatModelDraftRef.current === "string"
        ? summaryFormatModelDraftRef.current
        : summaryFormatModelDraft
    ).trim();
    addSummaryModelPresetIfMissing(nextModel);
    const nextDefault = summaryFormatDefaultDraft;
    if (!nextName) {
      return;
    }

    if (
      summaryFormats.some(
        (format) =>
          format.id !== editingSummaryFormatId &&
          format.name.trim().toLowerCase() === nextName.toLowerCase()
      )
    ) {
      return;
    }

    if (editingSummaryFormatId === null) {
      const now = Date.now();
      const newFormat: SummaryFormat = {
        id: `summary-format-${now}`,
        name: nextName,
        prompt: nextPrompt,
        model: nextModel,
        isDefault: nextDefault,
        createdAt: now,
        updatedAt: now
      };
      const nextFormats = [...summaryFormats, newFormat].map((format) => ({
        ...format,
        isDefault: nextDefault ? format.id === newFormat.id : format.isDefault
      }));
      setSummaryFormats(normalizeStoredSummaryFormats(nextFormats));
      setIsAllSummaryFormatsMode(false);
      setActiveSummaryFormatId(newFormat.id);
      setEditingSummaryFormatId(newFormat.id);
      setSummaryFormatNameDraft(newFormat.name);
      setSummaryFormatModelDraft(newFormat.model ?? "");
      summaryFormatNameDraftRef.current = newFormat.name;
      summaryPromptDraftRef.current = newFormat.prompt;
      summaryFormatModelDraftRef.current = newFormat.model ?? "";
      setIsNewSummaryModelDraftMode(false);
      setIsSummaryPromptEditMode(false);
      setTranscriptViewMode("summary");
      setSummaryText("");
      setSummaryKeyPoints([]);
      setSummaryError(null);
      setSummaryModel("");
      await loadSummary({
        force: true,
        promptOverride: nextPrompt,
        modelOverride: nextModel
      });
      return;
    }

    const baseFormat =
      summaryFormats.find((format) => format.id === editingSummaryFormatId) ?? activeSummaryFormat;
    const hasNoChanges =
      baseFormat.name === nextName &&
      baseFormat.prompt === nextPrompt &&
      (baseFormat.model ?? "") === nextModel &&
      baseFormat.isDefault === nextDefault;
    if (hasNoChanges) {
      setSummaryFormatNameDraft(baseFormat.name);
      setSummaryPromptDraft(baseFormat.prompt);
      setSummaryFormatModelDraft(baseFormat.model ?? "");
      summaryFormatNameDraftRef.current = baseFormat.name;
      summaryPromptDraftRef.current = baseFormat.prompt;
      summaryFormatModelDraftRef.current = baseFormat.model ?? "";
      setIsNewSummaryModelDraftMode(false);
      setSummaryFormatDefaultDraft(baseFormat.isDefault);
      setEditingSummaryFormatId(baseFormat.id);
      setIsSummaryPromptEditMode(false);
      return;
    }

    const now = Date.now();
    const nextFormats = summaryFormats.map((format) => {
      if (format.id === baseFormat.id) {
        return {
          ...format,
          name: nextName,
          prompt: nextPrompt,
          model: nextModel,
          isDefault: nextDefault,
          updatedAt: now
        };
      }
      return {
        ...format,
        isDefault: nextDefault ? false : format.isDefault
      };
    });
    const normalizedFormats = normalizeStoredSummaryFormats(nextFormats);
    setSummaryFormats(normalizedFormats);
    setIsAllSummaryFormatsMode(false);
    setActiveSummaryFormatId(baseFormat.id);
    setEditingSummaryFormatId(baseFormat.id);
    setSummaryFormatNameDraft(nextName);
    setSummaryPromptDraft(nextPrompt);
    setSummaryFormatModelDraft(nextModel);
    summaryFormatNameDraftRef.current = nextName;
    summaryPromptDraftRef.current = nextPrompt;
    summaryFormatModelDraftRef.current = nextModel;
    setIsNewSummaryModelDraftMode(false);
    setSummaryFormatDefaultDraft(nextDefault);
    setIsSummaryPromptEditMode(false);
    setTranscriptViewMode("summary");
    setSummaryText("");
    setSummaryKeyPoints([]);
    setSummaryError(null);
    setSummaryModel("");
    await loadSummary({
      force: true,
      promptOverride: nextPrompt,
      modelOverride: nextModel
    });
  };

  const deleteSummaryFormatAndClose = (): void => {
    if (!editingSummaryFormatId || summaryFormats.length <= 1) {
      return;
    }
    const nextFormats = summaryFormats.filter((format) => format.id !== editingSummaryFormatId);
    if (nextFormats.length === 0) {
      return;
    }
    const hadDefault =
      summaryFormats.find((format) => format.id === editingSummaryFormatId)?.isDefault === true;
    if (hadDefault || !nextFormats.some((format) => format.isDefault)) {
      nextFormats.forEach((format, index) => {
        format.isDefault = index === 0;
      });
    }
    const normalizedFormats = normalizeStoredSummaryFormats(nextFormats);
    setSummaryFormats(normalizedFormats);
    setIsAllSummaryFormatsMode(false);
    const defaultFormat = getDefaultSummaryFormat(normalizedFormats);
    setActiveSummaryFormatId(defaultFormat.id);
    setEditingSummaryFormatId(defaultFormat.id);
    setSummaryFormatNameDraft(defaultFormat.name);
    setSummaryPromptDraft(defaultFormat.prompt);
    setSummaryFormatModelDraft(defaultFormat.model ?? "");
    summaryFormatNameDraftRef.current = defaultFormat.name;
    summaryPromptDraftRef.current = defaultFormat.prompt;
    summaryFormatModelDraftRef.current = defaultFormat.model ?? "";
    setIsNewSummaryModelDraftMode(false);
    setSummaryFormatDefaultDraft(defaultFormat.isDefault);
    setIsSummaryPromptEditMode(false);
    setTranscriptViewMode("summary");
    setSummaryText("");
    setSummaryKeyPoints([]);
    setSummaryError(null);
    setSummaryModel("");
  };

  const buildSummaryTextForPublish = (): string => {
    const summary = summaryText.trim();
    const points = summaryKeyPoints
      .map((point) => point.trim())
      .filter((point) => point.length > 0);
    const pointsBlock =
      points.length > 0 ? `\n\n${points.map((point) => `- ${point}`).join("\n")}` : "";
    return `${summary}${pointsBlock}`.trim();
  };

  const normalizePublishStatusText = (value: string): string => {
    const next = value.trim();
    if (!next) {
      return next;
    }
    if (next.endsWith("...")) {
      return next;
    }
    return next.replace(/[.]+$/, "");
  };

  const publishCurrentVideoSummary = async (): Promise<void> => {
    if (!transcriptVideo) {
      return;
    }
    const summaryForPublish = buildSummaryTextForPublish();
    if (!summaryForPublish) {
      return;
    }
    if (isPublishingSummary) {
      return;
    }

    setPublishSummaryFeedback(null);
    setIsPublishingSummary(true);
    try {
      await publishVideoSummary({
        videoId: transcriptVideo.videoId,
        videoUrl: transcriptVideo.videoUrl,
        title: transcriptVideo.title,
        summary: summaryForPublish,
        thumbnailUrl: transcriptVideo.thumbnailUrl,
        channelTitle: transcriptSourceHandle || transcriptVideo.channelTitle,
        publishedAt: transcriptVideo.publishedAt,
        durationSeconds: transcriptVideo.durationSeconds ?? null,
        viewCount: transcriptVideo.viewCount ?? null
      });
      setPublishSummaryFeedback({
        kind: "success",
        text: "PUBLISHED"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Publish failed.";
      setPublishSummaryFeedback({
        kind: "error",
        text: normalizePublishStatusText(message)
      });
    } finally {
      setIsPublishingSummary(false);
    }
  };

  const getVisibleTranscriptPanelText = (): string => {
    if (transcriptViewMode === "summary") {
      const summary = summaryText.trim();
      const points = summaryKeyPoints
        .map((point) => point.trim())
        .filter((point) => point.length > 0);
      const pointsBlock =
        points.length > 0 ? `\n\n${points.map((point) => `- ${point}`).join("\n")}` : "";
      return `${summary}${pointsBlock}`.trim();
    }
    return transcriptText.trim();
  };

  const copyTranscriptText = async (): Promise<void> => {
    setPublishSummaryFeedback(null);
    const text = getVisibleTranscriptPanelText();
    if (!text) {
      return;
    }
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
    setIsTranscriptCopied(true);
    if (transcriptCopyFeedbackTimeoutRef.current) {
      window.clearTimeout(transcriptCopyFeedbackTimeoutRef.current);
    }
    transcriptCopyFeedbackTimeoutRef.current = window.setTimeout(() => {
      setIsTranscriptCopied(false);
      transcriptCopyFeedbackTimeoutRef.current = null;
    }, 1000);
  };

  const getVideoThumbnailSrc = (video: VideoItem): string => {
    return videoThumbnailFallbackUrlById[video.videoId] || video.thumbnailUrl;
  };

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
                    durationSeconds: nextDurationSeconds,
                    thumbnailUrl: nextThumbnailUrl ?? video.thumbnailUrl
                  }
            )
          })),
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
        previousVideo?.thumbnailUrl !== nextThumbnailUrl;
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
      activeBoard?.kind === "saved" ? sortSavedVideosByMode(column) : [...column.videos];
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
            if (watchedBySourceBoard[videoId] === true) {
              nextWatchedVideos[videoId] = true;
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

  const clearAllCachedSummaries = (): void => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const storage = window.localStorage;
      if (!storage) {
        return;
      }
      const keysToDelete: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key && key.startsWith(SUMMARY_CACHE_KEY_PREFIX)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach((key) => storage.removeItem(key));
      setSummaryFormats((previous) =>
        normalizeStoredSummaryFormats(
          previous.map((format) => ({
            ...format,
            model: ""
          }))
        )
      );
      setSummaryFormatModelDraft("");
      summaryFormatModelDraftRef.current = "";
      setIsNewSummaryModelDraftMode(false);
      setIsDeleteSummariesModalOpen(false);
    } catch {
      setIsDeleteSummariesModalOpen(false);
    }
  };

  const saveVideoToSavedColumn = (): void => {
    if (!savingVideo || !saveTargetColumnId || !savedBoard) {
      return;
    }
    const now = Date.now();
    setBoards((previous) =>
      previous.map((board) => {
        const nextWatchedVideos = {
          ...board.watchedVideos,
          [savingVideo.videoId]: true
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
            if (column.id !== saveTargetColumnId) {
              return column;
            }
            const exists = column.videos.some((video) => video.videoId === savingVideo.videoId);
            if (exists) {
              return column;
            }
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
  };

  const openEditSavedListModal = (column: ColumnState): void => {
    setEditingSavedListColumnId(column.id);
    setSavedListNameInput(column.handleInput);
    savedListNameDraftRef.current = column.handleInput;
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

  const getShownVideosForColumnInBoard = (board: BoardState, column: ColumnState): VideoItem[] => {
    const watched = board.watchedVideos ?? {};
    const now = Date.now();
    const sourceVideos = board.kind === "saved" ? sortSavedVideosByMode(column) : column.videos;
    return sourceVideos.filter((video) => {
      if (!matchesVideoWindowFilter(getVideoPublishedTime(video), board.videoWindowDays, now)) {
        return false;
      }
      if (!matchesDurationFilter(video.durationSeconds, board.videoDurationFilter)) {
        return false;
      }
      const isWatched = watched[video.videoId] === true;
      if (board.videoFilter === "all") {
        return true;
      }
      if (board.videoFilter === "watched") {
        return isWatched;
      }
      return !isWatched;
    });
  };

  const getVisibleColumnsForBoard = (board: BoardState): ColumnState[] => {
    const scope = normalizeColumnScopeFilter(board.columnScopeFilter, board.columns);
    if (scope.includes(COLUMN_SCOPE_ALL)) {
      return board.columns;
    }
    if (scope.includes(COLUMN_SCOPE_NOT_EMPTY)) {
      return board.columns.filter((column) => getShownVideosForColumnInBoard(board, column).length > 0);
    }
    return board.columns.filter((column) => scope.includes(column.id));
  };

  const readAgentState = (): ReturnType<AppAgentApi["readState"]> => {
    const currentActiveBoard =
      boards.find((board) => board.id === activeBoardId) ?? boards[0] ?? null;
    const visible = currentActiveBoard ? getVisibleColumnsForBoard(currentActiveBoard) : [];
    const visibleSet = new Set(visible.map((column) => column.id));
    const totalShown = currentActiveBoard
      ? visible.reduce(
          (sum, column) => sum + getShownVideosForColumnInBoard(currentActiveBoard, column).length,
          0
        )
      : 0;

    return {
      activeBoardId: currentActiveBoard?.id ?? null,
      activeBoardKind: currentActiveBoard?.kind ?? null,
      selectedFilters: currentActiveBoard
        ? {
            videoFilter: currentActiveBoard.videoFilter,
            videoWindowDays: currentActiveBoard.videoWindowDays,
            videoDurationFilter: currentActiveBoard.videoDurationFilter,
            columnScopeFilter: normalizeColumnScopeFilter(
              currentActiveBoard.columnScopeFilter,
              currentActiveBoard.columns
            ),
            playbackRate: currentActiveBoard.defaultPlaybackRate
          }
        : null,
      shownVideosTotal: totalShown,
      boards: boards.map((board) => {
        const boardVisibleSet = new Set(getVisibleColumnsForBoard(board).map((column) => column.id));
        return {
          id: board.id,
          name: board.name,
          kind: board.kind,
          columnCount: board.columns.length,
          columns: board.columns.map((column) => {
            const shown = getShownVideosForColumnInBoard(board, column);
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
        ? currentActiveBoard.columns
            .filter((column) => !visibleSet.has(column.id))
            .map((column) => column.id)
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
                  ? normalizeColumnScopeFilter(patch.columnScopeFilter, board.columns)
                  : board.columnScopeFilter,
              defaultPlaybackRate: nextRate
            }));
            setPlaybackRate(nextRate);
            if (playerRef.current) {
              try {
                playerRef.current.setPlaybackRate(nextRate);
              } catch {
                // Ignore unsupported playback-rate calls.
              }
            }
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
                  [videoId]: true
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
            data-testid="topbar-logo"
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
              data-testid="topbar-fetch-all"
            >
              <span className="btn-icon btn-icon-fetch" aria-hidden />
            </Button>
          </Tooltip>
        ) : null}
        <Select<string>
          value={activeBoard?.id}
          onChange={(value) => {
            handleBoardSelectChange(value);
            blurActiveTopbarControl();
          }}
          aria-label="Board selector"
          className="video-filter-select board-select"
          data-testid="topbar-board-select"
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
            blurActiveTopbarControl();
          }}
          aria-label="Channel scope filter"
          className="video-filter-select channel-scope-select"
          data-testid="topbar-channel-scope-select"
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
              blurActiveTopbarControl();
            }}
            aria-label="Video filter"
            className="video-filter-select video-status-select"
            data-testid="topbar-status-select"
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
            blurActiveTopbarControl();
          }}
          aria-label="Video age window"
          className="video-filter-select video-window-select"
          data-testid="topbar-days-select"
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
            blurActiveTopbarControl();
          }}
          aria-label="Video duration filter"
          className="video-filter-select video-duration-select"
          data-testid="topbar-duration-select"
          maxTagCount={0}
          maxTagPlaceholder={() => formatDurationFilterSummary(videoDurationFilter)}
          showSearch={false}
          options={VIDEO_DURATION_FILTER_OPTIONS}
        />
        <Select<number>
          value={preferredPlaybackRate}
          onChange={(value) => {
            handlePreferredPlaybackRateChange(value);
            blurActiveTopbarControl();
          }}
          aria-label="Default playback speed"
          className="video-filter-select playback-speed-select"
          data-testid="topbar-speed-select"
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
          data-testid="topbar-play-all"
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
            data-testid="topbar-mark-all"
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

      <Modal
        title={activeVideo?.title ?? "Video"}
        open={activeVideo !== null}
        afterOpenChange={(open) => {
          if (open) {
            focusVideoPlayerSurface();
          }
        }}
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
                  src={`https://www.youtube.com/embed/${activeVideo.videoId}?autoplay=1&rel=0${
                    (() => {
                      const resume = getResumeSecondsForVideo(activeVideo);
                      return typeof resume === "number" && resume > 0 ? `&start=${resume}` : "";
                    })()
                  }&enablejsapi=1&playsinline=1${
                    typeof window !== "undefined"
                      ? `&origin=${encodeURIComponent(window.location.origin)}`
                      : ""
                  }`}
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
                  className="video-watch-btn modal-save-btn modal-fullscreen-btn"
                  aria-label="Toggle fullscreen"
                  onClick={toggleVideoFullscreen}
                >
                  <span className="btn-icon btn-icon-fullscreen" aria-hidden />
                </Button>
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

      <Modal
        title={
          <div>
            <div className="transcript-modal-status-row">
              {transcriptLoading ? (
                <Text className="video-meta-feedback is-info">FETCHING TRANSCRIPT...</Text>
              ) : null}
              {!transcriptLoading && summaryLoading ? (
                <Text className="video-meta-feedback is-info">SUMMARIZING...</Text>
              ) : null}
              {publishSummaryFeedback ? (
                <Text className={`video-meta-feedback is-${publishSummaryFeedback.kind}`}>
                  {publishSummaryFeedback.text}
                </Text>
              ) : null}
              {isPublishingSummary ? (
                <Text className="video-meta-feedback is-info">PUBLISHING...</Text>
              ) : null}
              {!transcriptLoading &&
              !summaryLoading &&
              !isPublishingSummary &&
              !publishSummaryFeedback &&
              transcriptViewMode === "summary" &&
              !isSummaryPromptEditMode &&
              summaryModel ? (
                <Text className="video-meta-feedback is-info">MODEL: {summaryModel}</Text>
              ) : null}
            </div>
            <div className="transcript-modal-header-row">
              <span className="transcript-modal-header-title">
                {isSummaryPromptEditMode
                  ? "EDIT SUMMARY FORMAT"
                  : transcriptVideo?.title ?? "Transcript"}
              </span>
              <div className="transcript-modal-header-controls">
                <Select<string>
                  value={
                    isSummaryPromptEditMode && editingSummaryFormatId === null
                      ? NEW_SUMMARY_FORMAT_OPTION
                      : transcriptViewMode === "transcript"
                      ? "transcript"
                      : isAllSummaryFormatsMode
                      ? ALL_SUMMARY_FORMATS_OPTION
                      : `${SUMMARY_MODE_OPTION_PREFIX}${activeSummaryFormat.id}`
                  }
                  onChange={(value) => void handleTranscriptViewModeChange(value)}
                  aria-label="Transcript view mode"
                  className="video-filter-select transcript-mode-select"
                  popupClassName="summary-format-dropdown"
                  optionLabelProp="title"
                  disabled={
                    isSummaryBusy ||
                    transcriptLoading ||
                    !!transcriptError ||
                    transcriptText.trim().length === 0
                  }
                >
                  <Select.Option value="transcript" title="TRANSCRIPT">
                    TRANSCRIPT
                  </Select.Option>
                  <Select.Option value={ALL_SUMMARY_FORMATS_OPTION} title="ALL FORMATS">
                    ALL FORMATS
                  </Select.Option>
                  {summaryFormats.map((format, formatIndex) => (
                    <Select.Option
                      key={format.id}
                      value={`${SUMMARY_MODE_OPTION_PREFIX}${format.id}`}
                      title={format.name.toUpperCase()}
                    >
                      <div className="board-option-row">
                        <span className="board-option-name">{format.name.toUpperCase()}</span>
                        <div className="board-option-actions">
                          <button
                            type="button"
                            className="board-option-move-btn"
                            aria-label={`Move ${format.name} up`}
                            disabled={formatIndex === 0}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              moveSummaryFormat(format.id, "up");
                            }}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="board-option-move-btn"
                            aria-label={`Move ${format.name} down`}
                            disabled={formatIndex === summaryFormats.length - 1}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              moveSummaryFormat(format.id, "down");
                            }}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="board-option-edit-btn"
                            aria-label={`Edit ${format.name}`}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setIsAllSummaryFormatsMode(false);
                              setActiveSummaryFormatId(format.id);
                              openSummaryFormatEditor(format.id);
                            }}
                          >
                            <span className="btn-icon btn-icon-edit-board" aria-hidden />
                          </button>
                        </div>
                      </div>
                    </Select.Option>
                  ))}
                  <Select.Option value={NEW_SUMMARY_FORMAT_OPTION} title="NEW FORMAT">
                    NEW FORMAT
                  </Select.Option>
                </Select>
                <Button
                  htmlType="button"
                  className={`column-move-btn transcript-copy-btn ${
                    isTranscriptCopied ? "is-copied" : ""
                  }`}
                  aria-label={
                    transcriptViewMode === "summary" ? "Copy summary" : "Copy transcript"
                  }
                  onClick={() => void copyTranscriptText()}
                  disabled={
                    isSummaryPromptEditMode
                      ? true
                      : transcriptViewMode === "summary"
                    ? summaryLoading ||
                      !!summaryError ||
                      (summaryText.trim().length === 0 && summaryKeyPoints.length === 0)
                    : transcriptLoading || !!transcriptError || transcriptText.trim().length === 0
                  }
                >
                  {isTranscriptCopied ? (
                    <span className="btn-icon btn-icon-check" aria-hidden />
                  ) : (
                    <span className="btn-icon btn-icon-copy" aria-hidden />
                  )}
                </Button>
                <Button
                  htmlType="button"
                  className="column-move-btn transcript-regenerate-btn"
                  aria-label="Regenerate summary"
                  onClick={() => void regenerateSummary()}
                  disabled={
                    transcriptViewMode === "transcript" ||
                    isSummaryBusy ||
                    isSummaryPromptEditMode ||
                    transcriptLoading ||
                    !!transcriptError ||
                    transcriptText.trim().length === 0
                  }
                >
                  <span className="btn-icon btn-icon-fetch" aria-hidden />
                </Button>
                <Button
                  htmlType="button"
                  className="column-move-btn transcript-publish-btn"
                  aria-label="Publish summary"
                  onClick={() => void publishCurrentVideoSummary()}
                  disabled={
                    transcriptViewMode === "transcript" ||
                    isSummaryBusy ||
                    isSummaryPromptEditMode ||
                    isPublishingSummary ||
                    transcriptLoading ||
                    !!transcriptError ||
                    !hasPublishableSummary
                  }
                >
                  <span
                    className={`btn-icon btn-icon-feed ${isPublishingSummary ? "is-spinning" : ""}`}
                    aria-hidden
                  />
                </Button>
              </div>
            </div>
          </div>
        }
        open={transcriptVideo !== null}
        onCancel={() => {
          transcriptRequestIdRef.current += 1;
          setTranscriptVideo(null);
          setTranscriptLoading(false);
          setTranscriptText("");
          setTranscriptError(null);
          setTranscriptViewMode("transcript");
          setIsTranscriptCopied(false);
          setSummaryLoading(false);
          setSummaryText("");
          setSummaryKeyPoints([]);
          setSummaryError(null);
          setSummaryModel("");
          setIsPublishingSummary(false);
          setPublishSummaryFeedback(null);
          setIsSummaryPromptEditMode(false);
          setEditingSummaryFormatId(activeSummaryFormat.id);
          setSummaryFormatNameDraft(activeSummaryFormat.name);
          setSummaryPromptDraft(activeSummaryFormat.prompt);
          setSummaryFormatModelDraft(activeSummaryFormat.model ?? "");
          summaryFormatNameDraftRef.current = activeSummaryFormat.name;
          summaryPromptDraftRef.current = activeSummaryFormat.prompt;
          summaryFormatModelDraftRef.current = activeSummaryFormat.model ?? "";
          setIsNewSummaryModelDraftMode(false);
          setSummaryFormatDefaultDraft(activeSummaryFormat.isDefault);
        }}
        footer={null}
        width={900}
        destroyOnHidden
        className="transcript-modal"
      >
        <div className="transcript-modal-body">
          {isSummaryPromptEditMode ? (
            <div className="summary-prompt-editor">
              <Input
                key={`summary-name-${editingSummaryFormatId ?? "new"}-${isSummaryPromptEditMode ? "open" : "closed"}`}
                defaultValue={summaryFormatNameDraft}
                onChange={(event) => {
                  summaryFormatNameDraftRef.current = event.target.value;
                }}
                placeholder="Name"
                maxLength={20}
              />
              <Input.TextArea
                key={`summary-prompt-${editingSummaryFormatId ?? "new"}-${isSummaryPromptEditMode ? "open" : "closed"}`}
                defaultValue={summaryPromptDraft}
                onChange={(event) => {
                  summaryPromptDraftRef.current = event.target.value;
                }}
                autoSize={{ minRows: 8, maxRows: 18 }}
                placeholder="Enter plain summary instructions (style/focus)."
              />
              <Select<string>
                value={
                  isNewSummaryModelDraftMode
                    ? NEW_SUMMARY_MODEL_OPTION
                    : summaryFormatModelDraft || "__default_model__"
                }
                onChange={(value) => {
                  if (value === NEW_SUMMARY_MODEL_OPTION) {
                    setIsNewSummaryModelDraftMode(true);
                    setSummaryFormatModelDraft("");
                    summaryFormatModelDraftRef.current = "";
                    return;
                  }
                  setIsNewSummaryModelDraftMode(false);
                  const nextValue = value === "__default_model__" ? "" : value;
                  setSummaryFormatModelDraft(nextValue);
                  summaryFormatModelDraftRef.current = nextValue;
                }}
                className="video-filter-select"
                options={[
                  ...summaryModelPresets.map((preset) => ({
                    value: preset.value.trim().length === 0 ? "__default_model__" : preset.value,
                    label: preset.label
                  })),
                  { value: NEW_SUMMARY_MODEL_OPTION, label: "NEW MODEL" }
                ]}
                optionRender={(option) => {
                  const optionValue = String(option.data.value ?? "");
                  const optionLabel = String(option.data.label ?? optionValue);
                  const isDefaultEnv = optionValue === "__default_model__";
                  const isNewModel = optionValue === NEW_SUMMARY_MODEL_OPTION;
                  return (
                    <div className="summary-model-option-row">
                      <span>{optionLabel}</span>
                      {!isDefaultEnv && !isNewModel ? (
                        <button
                          type="button"
                          className="summary-model-remove-btn"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            removeSummaryModelPreset(optionValue);
                          }}
                          aria-label={`Remove model preset ${optionLabel}`}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  );
                }}
              />
              <Input
                value={summaryFormatModelDraft}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setSummaryFormatModelDraft(nextValue);
                  summaryFormatModelDraftRef.current = nextValue;
                }}
                placeholder="OPENROUTER MODEL ID"
              />
              <Checkbox
                className="summary-default-checkbox"
                checked={summaryFormatDefaultDraft}
                onChange={(event) => setSummaryFormatDefaultDraft(event.target.checked)}
              >
                SET DEFAULT
              </Checkbox>
              <div className="summary-prompt-actions">
                <Button
                  htmlType="button"
                  className="summary-prompt-action-btn red-outline-btn"
                  disabled={summaryFormats.length <= 1 || editingSummaryFormatId === null}
                  onClick={deleteSummaryFormatAndClose}
                >
                  DELETE
                </Button>
                <Space size={8}>
                  <Button
                    htmlType="button"
                    className="summary-prompt-action-btn"
                    onClick={() => {
                      setIsSummaryPromptEditMode(false);
                      setEditingSummaryFormatId(activeSummaryFormat.id);
                      setSummaryFormatNameDraft(activeSummaryFormat.name);
                      setSummaryPromptDraft(activeSummaryFormat.prompt);
                      setSummaryFormatModelDraft(activeSummaryFormat.model ?? "");
                      summaryFormatNameDraftRef.current = activeSummaryFormat.name;
                      summaryPromptDraftRef.current = activeSummaryFormat.prompt;
                      summaryFormatModelDraftRef.current = activeSummaryFormat.model ?? "";
                      setIsNewSummaryModelDraftMode(false);
                      setSummaryFormatDefaultDraft(activeSummaryFormat.isDefault);
                    }}
                  >
                    CANCEL
                  </Button>
                  <Button
                    htmlType="button"
                    type="primary"
                    className="summary-prompt-action-btn"
                    onClick={() => void saveSummaryPromptAndClose()}
                  >
                    SAVE
                  </Button>
                </Space>
              </div>
            </div>
          ) : transcriptViewMode === "transcript" ? (
            <>
              {!transcriptLoading && transcriptError ? (
                <Text type="danger">{transcriptError}</Text>
              ) : null}
              {!transcriptLoading && !transcriptError ? (
                <pre className="transcript-text">{transcriptText}</pre>
              ) : null}
            </>
          ) : (
            <>
              {!summaryLoading && summaryError ? <Text type="danger">{summaryError}</Text> : null}
              {!summaryLoading && !summaryError && (summaryText || summaryKeyPoints.length > 0) ? (
                <div className="summary-content">
                  {(() => {
                    const pointsBlock =
                      summaryKeyPoints.length > 0
                        ? summaryKeyPoints.map((point) => `- ${point}`).join("\n")
                        : "";
                    const combined = [summaryText, pointsBlock].filter(Boolean).join("\n\n").trim();
                    if (isAllSummaryFormatsMode) {
                      const combinedWithTreeBlocks = preserveTreeBlocksInMarkdown(combined);
                      return (
                        <div className="summary-markdown summary-combined-markdown">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {combinedWithTreeBlocks}
                          </ReactMarkdown>
                        </div>
                      );
                    }
                    const markdownMode = looksLikeMarkdown(combined);
                    if (!markdownMode) {
                      return (
                        <>
                          {summaryText ? <p className="summary-paragraph">{summaryText}</p> : null}
                          {summaryKeyPoints.length > 0 ? (
                            <ul className="summary-points">
                              {summaryKeyPoints.map((point, index) => (
                                <li key={`${index}-${point.slice(0, 24)}`}>{point}</li>
                              ))}
                            </ul>
                          ) : null}
                        </>
                      );
                    }
                    return (
                      <div className="summary-markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{combined}</ReactMarkdown>
                      </div>
                    );
                  })()}
                </div>
              ) : null}
            </>
          )}
        </div>
      </Modal>

      <div
        ref={scrollRef}
        className="columns-scroll"
      >
        <div className="columns-layout">
          <section className="columns-grid">
            {visibleColumns.map((column, index) => {
              const brokenThumbKey = `${activeBoardId}:${column.id}`;
              const channelThumbToShow =
                isSavedBoardActive
                  ? ""
                  : brokenChannelThumbnailKeys.includes(brokenThumbKey)
                  ? column.videos[0]?.thumbnailUrl ?? ""
                  : column.channelThumbnailUrl || column.videos[0]?.thumbnailUrl || "";
              const hasHandleInput = column.handleInput.trim().length > 0;
              const filteredVideos = filteredVideosByColumnId.get(column.id) ?? [];
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
                  data-board-id={activeBoardId}
                  data-column-id={column.id}
                  data-handle={(column.currentHandle || column.handleInput || "").trim()}
                  data-hidden={hiddenColumnIdSet.has(column.id) ? "true" : "false"}
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
                          data-testid="column-fetch"
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
                        data-testid="column-play"
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
                          data-testid="column-mark-all"
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
                        data-testid="column-delete"
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
                        const isWatched = isVideoMarkedWatched(watchedVideos, video.videoId);
                        const isMetaRefreshInFlight = videoStatsBackfillInFlight.includes(
                          video.videoId
                        );
                        const metaFeedback = videoMetaFeedbackById[video.videoId];
                        return (
                          <List.Item
                            key={video.videoId}
                            className="video-tile-item"
                            data-url={video.videoUrl}
                            data-video-id={video.videoId}
                            data-board-id={activeBoardId}
                            data-column-id={column.id}
                            data-handle={(column.currentHandle || column.handleInput || "").trim()}
                            data-state={isWatched ? "watched" : "new"}
                          >
                            <LazyRender minHeight={320} className="full-width">
                              <Space direction="vertical" size="small" className="full-width">
                              <div className="video-meta-row">
                                <button
                                  type="button"
                                  className="video-meta-btn"
                                  onClick={() => void backfillVideoStats(video.videoId)}
                                  aria-label={`Refresh metadata for ${video.title}`}
                                  disabled={isMetaRefreshInFlight}
                                  data-testid="video-meta-refresh"
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
                                      className="column-move-btn"
                                      aria-label={`Open transcript for ${video.title}`}
                                      onClick={() => void openTranscript(video)}
                                    >
                                      <span className="btn-icon btn-icon-transcript" aria-hidden />
                                    </Button>
                                    <Button
                                      htmlType="button"
                                      className={`column-move-btn link-copy-btn ${
                                        copiedLinkVideoId === video.videoId ? "is-copied" : ""
                                      }`}
                                      aria-label={`Copy link for ${video.title}`}
                                      onClick={() => void copyVideoLink(video)}
                                      data-testid="video-copy-link"
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
                                      className="column-move-btn"
                                      aria-label={`Open transcript for ${video.title}`}
                                      onClick={() =>
                                        void openTranscript(
                                          video,
                                          column.currentHandle || column.handleInput
                                        )
                                      }
                                    >
                                      <span className="btn-icon btn-icon-transcript" aria-hidden />
                                    </Button>
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
                                      data-testid="video-save"
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
                                      data-testid="video-mark-toggle"
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
                              {getVideoThumbnailSrc(video) ? (
                                <button
                                  type="button"
                                  className="video-thumb-btn"
                                  onClick={() => openVideo(video)}
                                >
                                  <img
                                    src={getVideoThumbnailSrc(video)}
                                    alt={video.title}
                                    className="video-thumb"
                                    onError={() => handleVideoThumbnailError(video)}
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
                            </LazyRender>
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
        <Button
          htmlType="button"
          onClick={() => setIsDeleteSummariesModalOpen(true)}
          aria-label="Delete cached summaries"
          className="backup-btn backup-btn-text red-outline-btn"
        >
          DS
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
        title="Delete Summaries"
        open={isDeleteSummariesModalOpen}
        onCancel={() => setIsDeleteSummariesModalOpen(false)}
        onOk={clearAllCachedSummaries}
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
