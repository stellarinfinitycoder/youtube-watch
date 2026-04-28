import type { VideoItem } from "../types/youtube";
import { isVideoMarkedWatched, type WatchedVideosMap } from "./watched";

type SummaryFormatLike = {
  id: string;
  name: string;
  prompt: string;
  model: string;
};

type StoredSummaryCacheEntryLike = {
  promptHash: string;
  entry: {
    summary: string;
    keyPoints: string[];
    model: string;
    cachedAt: number;
  };
};

export type SummaryVideoLatest = {
  videoId: string;
  latestCachedAt: number;
};

export type SummariesBoardSourceColumn = {
  id: string;
  handleInput: string;
  currentHandle: string;
  channelThumbnailUrl: string;
  lastGoodChannelThumbnailUrl: string;
  videos: VideoItem[];
  loading: boolean;
  error: string | null;
  savedSortMode: string;
};

export type SummariesBoardSourceBoard<TColumn extends SummariesBoardSourceColumn> = {
  id: string;
  watchedVideos: WatchedVideosMap;
  columns: TColumn[];
};

export type SummariesBoardVideo = {
  video: VideoItem;
  sourceColumn: SummariesBoardSourceColumn;
  latestSummaryCachedAt: number;
  isWatched: boolean;
};

export type StoredSummaryDisplayEntry = {
  id: string;
  label: string;
  summary: string;
  keyPoints: string[];
  model: string;
  cachedAt: number;
  promptHash: string;
  summaryFormatId: string | null;
};

function hashSummaryText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

function buildSummaryPromptCacheKey(prompt: string, model: string): string {
  return `${prompt.trim()}\n__MODEL__:${model.trim() || ""}`;
}

function getSummaryFormatPromptHash(format: SummaryFormatLike): string {
  return hashSummaryText(buildSummaryPromptCacheKey(format.prompt, format.model ?? ""));
}

function formatStoredSummaryModelLabel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) {
    return "DEFAULT";
  }
  const parts = trimmed.split("/");
  return (parts[parts.length - 1] ?? trimmed).toUpperCase();
}

function formatStoredSummaryDate(cachedAt: number): string {
  if (!Number.isFinite(cachedAt) || cachedAt <= 0) {
    return "UNKNOWN DATE";
  }
  return new Date(cachedAt).toISOString().slice(0, 10);
}

export function buildSummariesBoardVideos<TColumn extends SummariesBoardSourceColumn>(
  boards: Array<SummariesBoardSourceBoard<TColumn>>,
  summaryVideos: SummaryVideoLatest[]
): SummariesBoardVideo[] {
  const summaryByVideoId = new Map(
    summaryVideos
      .filter((item) => item.videoId.trim().length > 0)
      .map((item) => [item.videoId.toLowerCase(), item.latestCachedAt])
  );
  const videosById = new Map<string, SummariesBoardVideo>();

  boards.forEach((board) => {
    board.columns.forEach((column) => {
      column.videos.forEach((video) => {
        const normalizedVideoId = video.videoId.trim().toLowerCase();
        const latestSummaryCachedAt = summaryByVideoId.get(normalizedVideoId);
        if (typeof latestSummaryCachedAt !== "number") {
          return;
        }
        const existing = videosById.get(normalizedVideoId);
        const isWatched = isVideoMarkedWatched(board.watchedVideos, video.videoId);
        if (!existing) {
          videosById.set(normalizedVideoId, {
            video,
            sourceColumn: column,
            latestSummaryCachedAt,
            isWatched
          });
          return;
        }
        videosById.set(normalizedVideoId, {
          ...existing,
          isWatched: existing.isWatched || isWatched
        });
      });
    });
  });

  return [...videosById.values()].sort(
    (a, b) => b.latestSummaryCachedAt - a.latestSummaryCachedAt
  );
}

export function buildStoredSummaryDisplayEntries(
  entries: StoredSummaryCacheEntryLike[],
  formats: SummaryFormatLike[]
): StoredSummaryDisplayEntry[] {
  const formatByPromptHash = new Map(
    formats.map((format) => [getSummaryFormatPromptHash(format), format])
  );
  const formatIndexById = new Map(formats.map((format, index) => [format.id, index]));

  return entries
    .map((item): StoredSummaryDisplayEntry => {
      const formatMatch = formatByPromptHash.get(item.promptHash) ?? null;
      const formatName = formatMatch?.name.trim() || "STORED SUMMARY";
      const modelLabel = formatStoredSummaryModelLabel(item.entry.model);
      const dateLabel = formatStoredSummaryDate(item.entry.cachedAt);
      return {
        id: item.promptHash,
        label: `${formatName.toUpperCase()} - ${modelLabel} - ${dateLabel}`,
        summary: item.entry.summary,
        keyPoints: item.entry.keyPoints,
        model: item.entry.model,
        cachedAt: item.entry.cachedAt,
        promptHash: item.promptHash,
        summaryFormatId: formatMatch?.id ?? null
      };
    })
    .sort((a, b) => {
      const aFormatIndex =
        a.summaryFormatId === null
          ? Number.MAX_SAFE_INTEGER
          : (formatIndexById.get(a.summaryFormatId) ?? Number.MAX_SAFE_INTEGER);
      const bFormatIndex =
        b.summaryFormatId === null
          ? Number.MAX_SAFE_INTEGER
          : (formatIndexById.get(b.summaryFormatId) ?? Number.MAX_SAFE_INTEGER);
      if (aFormatIndex !== bFormatIndex) {
        return aFormatIndex - bFormatIndex;
      }
      return a.cachedAt - b.cachedAt;
    });
}
