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
  Typography
} from "antd";
import type { FetchState } from "./types/youtube";
import {
  fetchViewCountsByVideoIds,
  getLatestVideosAndChannelByHandle
} from "./api/youtube";
import { normalizeHandle } from "./utils/handle";
import type { VideoItem } from "./types/youtube";
import topBarLogo from "../youtube_plus_red.svg";

const { Title, Text } = Typography;
const DEFAULT_LIMIT = 50;
const DEFAULT_COLUMN_COUNT = 3;
const CHANGE_STAMP = "150326055603";
const BUILD_INFO_LABEL = CHANGE_STAMP;
const BOARDS_STORAGE_KEY = "youtube-watch:boards:v1";
const ACTIVE_BOARD_ID_STORAGE_KEY = "youtube-watch:active-board-id:v1";
const LEGACY_HANDLE_STORAGE_KEY = "youtube-watch:handles:v1";
const LEGACY_COLUMNS_STORAGE_KEY = "youtube-watch:columns:v2";
const LEGACY_WATCHED_STORAGE_KEY = "youtube-watch:watched:v1";
const LEGACY_PLAYBACK_RATE_STORAGE_KEY = "youtube-watch:playback-rate:v1";
const YOUTUBE_IFRAME_API_SRC = "https://www.youtube.com/iframe_api";

type VideoFilter = "all" | "new" | "watched";
type VideoWindowDays = 1 | 3 | 7 | 30 | 60 | 90 | 120 | 180;
type PlaylistScope = "all" | "channel";
const VIDEO_WINDOW_OPTIONS: VideoWindowDays[] = [1, 3, 7, 30, 60, 90, 120, 180];
const DEFAULT_VIDEO_WINDOW_DAYS: VideoWindowDays = 180;
const STORAGE_VIDEO_WINDOW_DAYS: VideoWindowDays = 180;
const BOARD_DROPDOWN_MAX_VISIBLE = 25;
const BOARD_DROPDOWN_ITEM_HEIGHT = 36;
const BOARD_DROPDOWN_PADDING = 8;

type YouTubePlayer = {
  destroy: () => void;
  setPlaybackRate: (suggestedRate: number) => void;
  getAvailablePlaybackRates: () => number[];
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
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
};

type PersistedColumnState = {
  id: string;
  handleInput: string;
  currentHandle: string;
  channelThumbnailUrl: string;
  videos: VideoItem[];
  lastFetchAt: string | null;
};

type BoardState = {
  id: string;
  name: string;
  columns: ColumnState[];
  watchedVideos: Record<string, boolean>;
  videoFilter: VideoFilter;
  videoWindowDays: VideoWindowDays;
  defaultPlaybackRate: number;
};

type PersistedBoardState = {
  id: string;
  name: string;
  columns: PersistedColumnState[];
  watchedVideos: Record<string, boolean>;
  videoFilter: VideoFilter;
  videoWindowDays: VideoWindowDays;
  defaultPlaybackRate: number;
};

type BackupPayload = {
  version: 2;
  exportedAt: string;
  boards: PersistedBoardState[];
  activeBoardId: string;
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

  const videos: VideoItem[] = candidate.videos
    .map((video) => {
      if (!video || typeof video !== "object") {
        return null;
      }

      const item = video as Record<string, unknown>;
      if (
        typeof item.videoId !== "string" ||
        typeof item.title !== "string" ||
        typeof item.publishedAt !== "string" ||
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

  return {
    id: candidate.id ?? createColumnId(),
    handleInput: candidate.handleInput,
    currentHandle: candidate.currentHandle,
    channelThumbnailUrl: candidate.channelThumbnailUrl,
    videos,
    lastFetchAt: candidate.lastFetchAt
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
      columns,
      watchedVideos: sanitizeWatchedVideos(candidate.watchedVideos),
      videoFilter:
        candidate.videoFilter === "all" ||
        candidate.videoFilter === "new" ||
        candidate.videoFilter === "watched"
          ? candidate.videoFilter
          : "new",
      videoWindowDays:
        typeof candidate.videoWindowDays === "number" &&
        VIDEO_WINDOW_OPTIONS.includes(candidate.videoWindowDays as VideoWindowDays)
          ? (candidate.videoWindowDays as VideoWindowDays)
          : DEFAULT_VIDEO_WINDOW_DAYS,
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
    columns: Array.from({ length: initialColumnCount }, () => createColumnState()),
    watchedVideos: {},
    videoFilter: "new",
    videoWindowDays: DEFAULT_VIDEO_WINDOW_DAYS,
    defaultPlaybackRate: 1.5,
    ...overrides
  };
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
    lastFetchAt: column.lastFetchAt
  }));
}

function sanitizePersistedBoard(raw: unknown): PersistedBoardState | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as {
    id?: unknown;
    name?: unknown;
    columns?: unknown;
    watchedVideos?: unknown;
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

  return {
    id: candidate.id,
    name: candidate.name,
    columns,
    watchedVideos: sanitizeWatchedVideos(candidate.watchedVideos),
    videoFilter:
      candidate.videoFilter === "all" ||
      candidate.videoFilter === "new" ||
      candidate.videoFilter === "watched"
        ? candidate.videoFilter
        : "new",
    videoWindowDays:
      typeof candidate.videoWindowDays === "number" &&
      VIDEO_WINDOW_OPTIONS.includes(candidate.videoWindowDays as VideoWindowDays)
        ? (candidate.videoWindowDays as VideoWindowDays)
        : DEFAULT_VIDEO_WINDOW_DAYS,
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
    columns: board.columns.map((column) =>
      createColumnState({
        id: column.id,
        handleInput: column.handleInput,
        currentHandle: column.currentHandle,
        channelThumbnailUrl: column.channelThumbnailUrl,
        videos: column.videos,
        lastFetchAt: column.lastFetchAt
      })
    ),
    watchedVideos: board.watchedVideos,
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

    return parsed
      .map((item) => sanitizePersistedBoard(item))
      .filter((item): item is PersistedBoardState => item !== null)
      .map((board) => fromPersistedBoard(board));
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
    : Math.max(DEFAULT_COLUMN_COUNT, legacyHandles.length);

  const board = createBoardState("BOARD 1", {
    columns: Array.from({ length: resolvedCount }, (_, index) =>
      createColumnState({
        id: legacyColumns[index]?.id ?? createColumnId(),
        handleInput: legacyColumns[index]?.handleInput ?? legacyHandles[index] ?? "",
        currentHandle: legacyColumns[index]?.currentHandle ?? "",
        channelThumbnailUrl: legacyColumns[index]?.channelThumbnailUrl ?? "",
        videos: legacyColumns[index]?.videos ?? [],
        lastFetchAt: legacyColumns[index]?.lastFetchAt ?? null
      })
    ),
    watchedVideos: legacyWatchedVideos,
    videoFilter: "new",
    videoWindowDays: DEFAULT_VIDEO_WINDOW_DAYS,
    defaultPlaybackRate: legacyPlaybackRate
  });

  return { boards: [board], activeBoardId: board.id };
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

function formatPublishedDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--.--.-- | --:--";
  }

  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");

  return `${dd}.${mm}.${yy} | ${hh}:${min}`;
}

function formatVideoMeta(video: VideoItem): string {
  const dateTimeLabel = video.publishedAt
    ? formatPublishedDateTime(video.publishedAt)
    : "--.--.-- | --:--";
  return `${dateTimeLabel} | ${formatViewCount(video.viewCount)}`;
}

function getVideoPublishedTime(video: VideoItem): number {
  const parsed = Date.parse(video.publishedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getWindowCutoffTime(days: VideoWindowDays, now = Date.now()): number {
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

function App() {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const playerHostRef = useRef<HTMLDivElement | null>(null);
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
  const [renameBoardInput, setRenameBoardInput] = useState("");
  const [isDeleteBoardModalOpen, setIsDeleteBoardModalOpen] = useState(false);
  const [bulkInput, setBulkInput] = useState("");
  const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null);
  const [playlistQueue, setPlaylistQueue] = useState<VideoItem[]>([]);
  const [playlistIndex, setPlaylistIndex] = useState<number>(-1);
  const [playlistScope, setPlaylistScope] = useState<PlaylistScope>("all");
  const [playlistChannelLabel, setPlaylistChannelLabel] = useState<string>("");
  const [playbackRate, setPlaybackRate] = useState<number>(1.5);
  const [availablePlaybackRates, setAvailablePlaybackRates] = useState<number[]>([
    0.5,
    1,
    1.5,
    2
  ]);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [useIframeFallback, setUseIframeFallback] = useState(false);
  const [brokenChannelThumbnailKeys, setBrokenChannelThumbnailKeys] = useState<string[]>(
    []
  );
  const [pendingBulkFetch, setPendingBulkFetch] = useState<
    Array<{ boardId: string; id: string; handle: string }>
  >([]);
  const [viewBackfillInFlight, setViewBackfillInFlight] = useState<string[]>([]);
  const activeBoard =
    boards.find((board) => board.id === activeBoardId) ?? boards[0] ?? null;
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
  const moveDestinationBoards = boards.filter((board) => board.id !== activeBoardId);
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
    Math.min(boards.length + 1, BOARD_DROPDOWN_MAX_VISIBLE) * BOARD_DROPDOWN_ITEM_HEIGHT +
      BOARD_DROPDOWN_PADDING
  );
  const isPlaylistActive =
    playlistIndex >= 0 &&
    playlistQueue.length > 0 &&
    playlistIndex < playlistQueue.length;
  const videoFilter = activeBoard?.videoFilter ?? "new";
  const videoWindowDays = activeBoard?.videoWindowDays ?? DEFAULT_VIDEO_WINDOW_DAYS;
  const preferredPlaybackRate = activeBoard?.defaultPlaybackRate ?? 1.5;

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
        columns: toPersistedColumns(board.columns),
        watchedVideos: board.watchedVideos,
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
    if (!activeBoard) {
      return;
    }

    columns.forEach((column) => {
      const missingViewsIds = column.videos
        .filter((video) => video.viewCount === null)
        .map((video) => video.videoId);
      const backfillKey = `${activeBoard.id}:${column.id}`;

      if (missingViewsIds.length === 0) {
        return;
      }

      if (viewBackfillInFlight.includes(backfillKey)) {
        return;
      }

      setViewBackfillInFlight((prev) => [...prev, backfillKey]);
      fetchViewCountsByVideoIds(missingViewsIds)
        .then((viewCounts) => {
          setColumn(activeBoard.id, column.id, (prev) => ({
            ...prev,
            videos: prev.videos.map((video) => ({
              ...video,
              viewCount:
                video.viewCount ?? viewCounts[video.videoId] ?? video.viewCount
            }))
          }));
        })
        .catch(() => {
          // Ignore backfill errors; user can still refresh manually.
        })
        .finally(() => {
          setViewBackfillInFlight((prev) =>
            prev.filter((item) => item !== backfillKey)
          );
        });
    });
  }, [activeBoard, columns, viewBackfillInFlight]);

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
    setAvailablePlaybackRates([0.5, 1, 1.5, 2]);
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
              const normalizedRates = rates.length > 0 ? rates : [1];
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

    const onKeyDown = (event: KeyboardEvent): void => {
      if (shouldIgnoreShortcutTarget(event.target)) {
        return;
      }
      if (!playerRef.current) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key !== "arrowleft" && key !== "arrowright" && key !== "j" && key !== "l") {
        return;
      }

      event.preventDefault();
      const delta = key === "arrowleft" || key === "j" ? -10 : 10;
      try {
        const currentTime = playerRef.current.getCurrentTime();
        const nextTime = Math.max(0, currentTime + delta);
        playerRef.current.seekTo(nextTime, true);
      } catch {
        // Ignore unsupported seeks.
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

  const runFetch = async (
    boardId: string,
    columnId: string,
    handle: string
  ): Promise<void> => {
    setColumn(boardId, columnId, (prev) => ({ ...prev, loading: true, error: null }));

    try {
      const normalized = normalizeHandle(handle);
      const { videos, channelThumbnailUrl } = await getLatestVideosAndChannelByHandle(
        normalized,
        DEFAULT_LIMIT
      );
      const boardState = boards.find((board) => board.id === boardId);
      const boardWatchedVideos = boardState?.watchedVideos ?? {};
      const cutoffTime = getWindowCutoffTime(STORAGE_VIDEO_WINDOW_DAYS);
      const nextChannelThumbnailUrl =
        channelThumbnailUrl || videos[0]?.thumbnailUrl || "";
      setColumn(boardId, columnId, (prev) => ({
        ...prev,
        loading: false,
        error: null,
        videos: (() => {
          const mergedById = new Map<string, VideoItem>();

          videos.forEach((video) => {
            if (getVideoPublishedTime(video) >= cutoffTime) {
              mergedById.set(video.videoId, video);
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
    removeColumnById(deletingColumnId);
    setDeletingColumnId(null);
  };

  const handleBulkAddConfirm = (): void => {
    if (!activeBoard) {
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

  const playAllVideos = (): void => {
    if (!activeBoard) {
      return;
    }

    const cutoffTime = getWindowCutoffTime(videoWindowDays);
    const mergedById = new Map<string, VideoItem>();
    columns.forEach((column) => {
      column.videos.forEach((video) => {
        if (getVideoPublishedTime(video) >= cutoffTime) {
          mergedById.set(video.videoId, video);
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
      })
      .sort((a, b) => getVideoPublishedTime(b) - getVideoPublishedTime(a));

    if (queue.length === 0) {
      return;
    }

    setPlaylistQueue(queue);
    setPlaylistIndex(0);
    setPlaylistScope("all");
    setPlaylistChannelLabel("");
    setActiveVideo(queue[0]);
  };

  const playChannelVideos = (column: ColumnState): void => {
    const cutoffTime = getWindowCutoffTime(videoWindowDays);
    const queue = [...column.videos]
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
      })
      .sort((a, b) => getVideoPublishedTime(b) - getVideoPublishedTime(a));

    if (queue.length === 0) {
      return;
    }

    const channelRaw = column.currentHandle.trim() || column.handleInput.trim();
    const channelLabel = channelRaw
      ? (channelRaw.startsWith("@") ? channelRaw : `@${channelRaw}`).toUpperCase()
      : "@CHANNEL";

    setPlaylistQueue(queue);
    setPlaylistIndex(0);
    setPlaylistScope("channel");
    setPlaylistChannelLabel(channelLabel);
    setActiveVideo(queue[0]);
  };

  const createBoard = (): string => {
    const board = createBoardState(getNextBoardName(boards), undefined, 1);
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

    let nextActiveBoardId = "";
    setBoards((previous) => {
      const filtered = previous.filter((board) => board.id !== removingBoardId);
      if (filtered.length > 0) {
        const activeIndex = previous.findIndex((board) => board.id === removingBoardId);
        const fallbackIndex = Math.min(activeIndex, filtered.length - 1);
        nextActiveBoardId = filtered[Math.max(0, fallbackIndex)].id;
        return filtered;
      }

      const replacement = createBoardState("BOARD 1", { columns: [] });
      nextActiveBoardId = replacement.id;
      return [replacement];
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
        columns: toPersistedColumns(board.columns),
        watchedVideos: board.watchedVideos,
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

        const importedBoards = backup.boards.map((board) => fromPersistedBoard(board));
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

  return (
    <main className="app-shell">
      <div className="columns-nav">
        <img
          src={topBarLogo}
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
          {boards.map((board, boardIndex) => (
            <Select.Option
              key={board.id}
              value={board.id}
              title={board.name.toUpperCase()}
            >
              <div className="board-option-row">
                <span className="board-option-name">{board.name.toUpperCase()}</span>
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
                    disabled={boardIndex === boards.length - 1}
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
              </div>
            </Select.Option>
          ))}
          <Select.Option
            value={NEW_BOARD_OPTION_VALUE}
            title="NEW"
          >
            NEW
          </Select.Option>
        </Select>
        <Button
          type="primary"
          htmlType="button"
          onClick={fetchAllColumns}
          aria-label="Fetch all channels"
          className="nav-btn"
        >
          Fetch
        </Button>
        <Button
          htmlType="button"
          onClick={playAllVideos}
          aria-label="Play all videos"
          className="nav-btn"
        >
          Play
        </Button>
        <Button
          htmlType="button"
          onClick={() => setIsBulkModalOpen(true)}
          aria-label="Bulk add channels"
          className="nav-btn add-channels-btn"
        >
          Add
        </Button>
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
        <Select<VideoWindowDays>
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
          options={VIDEO_WINDOW_OPTIONS.map((days) => ({
            value: days,
            label: `${days}D`
          }))}
        />
        <Select<number>
          value={preferredPlaybackRate}
          onChange={handlePreferredPlaybackRateChange}
          aria-label="Default playback speed"
          className="video-filter-select playback-speed-select"
          options={[
            { value: 0.5, label: "0.5X" },
            { value: 1, label: "1X" },
            { value: 1.5, label: "1.5X" },
            { value: 2, label: "2X" }
          ]}
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
        title="Add Channels"
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
          placeholder={"@channelOne\n@channelTwo\n@channelThree"}
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
        destroyOnHidden
        className="video-player-modal"
      >
        {activeVideo ? (
          <Space direction="vertical" size="middle" className="full-width">
            <div className="video-modal-wrap">
              {useIframeFallback && !isPlayerReady ? (
                <iframe
                  src={`https://www.youtube.com/embed/${activeVideo.videoId}?autoplay=1&rel=0`}
                  title={activeVideo.title}
                  className="video-modal-frame"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              ) : null}
              <div
                ref={setPlayerHost}
                className={`video-modal-frame ${
                  useIframeFallback && !isPlayerReady ? "video-modal-frame-hidden" : ""
                }`}
              />
            </div>
            <div className="speed-controls">
              <div className="speed-controls-left">
                <Button
                  htmlType="button"
                  className="video-watch-btn modal-watch-btn"
                  aria-label={`Mark ${activeVideo.title} as watched`}
                  onClick={markWatchedAndAdvanceOrClose}
                >
                  W
                </Button>
                {isPlaylistActive ? (
                  <Text className="playlist-progress-text">
                    {playlistIndex + 1} of {playlistQueue.length} |{" "}
                    {playlistScope === "channel"
                      ? playlistChannelLabel || "@CHANNEL"
                      : "ALL CHANNELS"}{" "}
                    | NEWEST FIRST
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
                brokenChannelThumbnailKeys.includes(brokenThumbKey)
                  ? column.videos[0]?.thumbnailUrl ?? ""
                  : column.channelThumbnailUrl || column.videos[0]?.thumbnailUrl || "";
              const hasHandleInput = column.handleInput.trim().length > 0;

              const filteredVideos = column.videos.filter((video) => {
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
                        M
                      </Button>
                      <Button
                        htmlType="button"
                        onClick={() => playChannelVideos(column)}
                        disabled={column.loading || !hasChannelPlaylistVideos}
                        aria-label={`Play channel ${index + 1} playlist`}
                        className="column-move-btn"
                      >
                        P
                      </Button>
                      <Button
                        htmlType="button"
                        onClick={() => setDeletingColumnId(column.id)}
                        disabled={column.loading}
                        aria-label={`Remove column ${index + 1}`}
                        className="remove-column-btn"
                      >
                        x
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
                          <span />
                        </div>
                      )}
                      <Input
                        placeholder="@channel"
                        value={column.handleInput}
                        className="channel-handle-input"
                        aria-label={`Channel ${index + 1} handle`}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setColumn(activeBoardId, column.id, (prev) => ({
                            ...prev,
                            handleInput: nextValue
                          }));
                        }}
                        onPressEnter={(event) => {
                          if (!hasHandleInput || column.loading) {
                            event.preventDefault();
                          }
                        }}
                      />
                      <Button
                        htmlType="button"
                        onClick={() =>
                          runFetch(activeBoardId, column.id, column.handleInput)
                        }
                        disabled={!hasHandleInput || column.loading}
                        loading={column.loading}
                        aria-label={`Fetch column ${index + 1}`}
                        className="inline-fetch-btn"
                      >
                        F
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
                        return (
                          <List.Item key={video.videoId} className="video-tile-item">
                            <Space direction="vertical" size="small" className="full-width">
                              <div className="video-meta-row">
                                <Text className="video-meta">{formatVideoMeta(video)}</Text>
                                <Button
                                  htmlType="button"
                                  className="video-watch-btn"
                                  aria-label={`Mark ${video.title} as ${
                                    isWatched ? "new" : "watched"
                                  }`}
                                  onClick={() => toggleWatched(video.videoId)}
                                >
                                  {isWatched ? "U" : "W"}
                                </Button>
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
          </section>
          <aside className="add-column-rail">
            <Button
              htmlType="button"
              onClick={addColumn}
              aria-label="Add column"
              className="add-column-btn"
            >
              +
            </Button>
          </aside>
        </div>
      </div>
      <div className="backup-actions">
        <Button
          htmlType="button"
          onClick={handleExportBackup}
          aria-label="Backup data"
          className="backup-btn"
        >
          Backup
        </Button>
        <Button
          htmlType="button"
          onClick={() => importInputRef.current?.click()}
          aria-label="Restore data"
          className="backup-btn"
        >
          Restore
        </Button>
        <Text className="backup-limits-text">
          MAX FETCH LIMIT: 50 VIDEOS | MAX VIDEO AGE: 180 DAYS | {BUILD_INFO_LABEL}
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
        title="Delete Channel"
        open={deletingColumnId !== null}
        onCancel={() => setDeletingColumnId(null)}
        onOk={confirmDeleteColumn}
        okText="Delete"
        okButtonProps={{ danger: true, className: "delete-confirm-ok" }}
        width={360}
      >
        <Text>
          Delete channel
          {deletingChannelNameDisplay ? ` ${deletingChannelNameDisplay}` : ""}?
        </Text>
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
    </main>
  );
}

export default App;
