import { useMemo } from "react";
import type { VideoItem } from "../types/youtube";
import {
  getVideoPublishedTime,
  matchesDurationFilter,
  matchesVideoWindowFilter,
  normalizeColumnScopeFilter,
  normalizeVideoDurationFilter,
  normalizeVideoWindowFilterForKind,
  type BoardKind,
  type VideoDurationFilter,
  type VideoWindowFilter
} from "../domain/filters";
import { isVideoMarkedWatched, type WatchedVideosMap } from "../domain/watched";

type VideoFilter = "all" | "new" | "watched";

export type BoardFilterColumn = {
  id: string;
  videos: VideoItem[];
  currentHandle: string;
  handleInput: string;
};

export type BoardFilterBoard<TColumn extends BoardFilterColumn> = {
  kind: BoardKind;
  columns: TColumn[];
  watchedVideos: WatchedVideosMap;
  videoFilter: VideoFilter;
  videoDurationFilter: VideoDurationFilter;
  videoWindowDays: VideoWindowFilter;
  columnScopeFilter: string[];
};

type BoardFilterDerivedData<TColumn extends BoardFilterColumn> = {
  columnScopeFilter: string[];
  filteredVideosByColumnId: Map<string, VideoItem[]>;
  shownVideoCountByColumnId: Map<string, number>;
  visibleColumns: TColumn[];
  hiddenColumns: TColumn[];
  shownVideosTotal: number;
  visibleColumnIdSet: Set<string>;
  hiddenColumnIdSet: Set<string>;
  columnScopeOptions: Array<{ value: string; label: string }>;
};

type BoardFilterArgs<TColumn extends BoardFilterColumn> = {
  board: BoardFilterBoard<TColumn> | null;
  allValue: string;
  notEmptyValue: string;
  getSourceVideos: (board: BoardFilterBoard<TColumn>, column: TColumn) => VideoItem[];
};

function buildColumnScopeOptions<TColumn extends BoardFilterColumn>(
  board: BoardFilterBoard<TColumn>,
  allValue: string,
  notEmptyValue: string
): Array<{ value: string; label: string }> {
  const isSavedBoard = board.kind === "saved";
  return [
    {
      value: allValue,
      label: isSavedBoard ? "ALL LISTS" : "ALL CHANNELS"
    },
    {
      value: notEmptyValue,
      label: "ACTIVE CHANNELS"
    },
    ...board.columns.map((column, index) => {
      const raw = column.currentHandle.trim() || column.handleInput.trim();
      const normalized = raw
        ? raw.startsWith("@")
          ? raw
          : isSavedBoard
            ? raw
            : `@${raw}`
        : isSavedBoard
          ? `LIST ${index + 1}`
          : `CHANNEL ${index + 1}`;
      return {
        value: column.id,
        label: normalized.toUpperCase()
      };
    })
  ];
}

export function getShownVideosForBoardColumn<TColumn extends BoardFilterColumn>(
  board: BoardFilterBoard<TColumn>,
  column: TColumn,
  getSourceVideos: (board: BoardFilterBoard<TColumn>, column: TColumn) => VideoItem[],
  now: number = Date.now()
): VideoItem[] {
  const watchedVideos = board.watchedVideos ?? {};
  const videoWindowDays = normalizeVideoWindowFilterForKind(board.kind, board.videoWindowDays);
  const videoDurationFilter = normalizeVideoDurationFilter(board.videoDurationFilter);
  return getSourceVideos(board, column).filter((video) => {
    if (!matchesVideoWindowFilter(getVideoPublishedTime(video), videoWindowDays, now)) {
      return false;
    }
    if (!matchesDurationFilter(video.durationSeconds, videoDurationFilter)) {
      return false;
    }
    const isWatched = isVideoMarkedWatched(watchedVideos, video.videoId);
    if (board.videoFilter === "all") {
      return true;
    }
    if (board.videoFilter === "watched") {
      return isWatched;
    }
    return !isWatched;
  });
}

export function getBoardFilterDerivedData<TColumn extends BoardFilterColumn>({
  board,
  allValue,
  notEmptyValue,
  getSourceVideos
}: BoardFilterArgs<TColumn>): BoardFilterDerivedData<TColumn> {
  const emptyMap = new Map<string, VideoItem[]>();
  const emptyCountMap = new Map<string, number>();
  const emptySet = new Set<string>();
  if (!board) {
    return {
      columnScopeFilter: [allValue],
      filteredVideosByColumnId: emptyMap,
      shownVideoCountByColumnId: emptyCountMap,
      visibleColumns: [],
      hiddenColumns: [],
      shownVideosTotal: 0,
      visibleColumnIdSet: emptySet,
      hiddenColumnIdSet: emptySet,
      columnScopeOptions: []
    };
  }

  const now = Date.now();
  const filteredVideosByColumnId = new Map<string, VideoItem[]>();
  const shownVideoCountByColumnId = new Map<string, number>();

  board.columns.forEach((column) => {
    const filteredVideos = getShownVideosForBoardColumn(board, column, getSourceVideos, now);
    filteredVideosByColumnId.set(column.id, filteredVideos);
    shownVideoCountByColumnId.set(column.id, filteredVideos.length);
  });

  const columnScopeFilter = normalizeColumnScopeFilter(
    board.columnScopeFilter,
    board.columns,
    allValue,
    notEmptyValue
  );

  const visibleColumns = columnScopeFilter.includes(allValue)
    ? board.columns
    : columnScopeFilter.includes(notEmptyValue)
      ? board.columns.filter((column) => (shownVideoCountByColumnId.get(column.id) ?? 0) > 0)
      : board.columns.filter((column) => columnScopeFilter.includes(column.id));

  const shownVideosTotal = visibleColumns.reduce(
    (total, column) => total + (shownVideoCountByColumnId.get(column.id) ?? 0),
    0
  );

  const visibleColumnIdSet = new Set(visibleColumns.map((column) => column.id));
  const hiddenColumns =
    board.kind === "saved"
      ? []
      : board.columns.filter((column) => !visibleColumnIdSet.has(column.id));
  const hiddenColumnIdSet = new Set(hiddenColumns.map((column) => column.id));

  return {
    columnScopeFilter,
    filteredVideosByColumnId,
    shownVideoCountByColumnId,
    visibleColumns,
    hiddenColumns,
    shownVideosTotal,
    visibleColumnIdSet,
    hiddenColumnIdSet,
    columnScopeOptions: buildColumnScopeOptions(board, allValue, notEmptyValue)
  };
}

export function useBoardFilters<TColumn extends BoardFilterColumn>(
  args: BoardFilterArgs<TColumn>
): BoardFilterDerivedData<TColumn> {
  const { board, allValue, notEmptyValue, getSourceVideos } = args;
  return useMemo(
    () =>
      getBoardFilterDerivedData({
        board,
        allValue,
        notEmptyValue,
        getSourceVideos
      }),
    [board, allValue, notEmptyValue, getSourceVideos]
  );
}
