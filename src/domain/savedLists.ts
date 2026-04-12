import type { VideoItem } from "../types/youtube";

export type SavedSortMode =
  | "time_asc"
  | "time_desc"
  | "added_asc"
  | "added_desc"
  | "manual";

export type SavedListColumnState = {
  id: string;
  handleInput: string;
  videos: VideoItem[];
  savedSortMode: SavedSortMode;
  savedAddedAtByVideoId: Record<string, number>;
  savedManualOrder: string[];
};

export type SavedBoardState<TColumn extends SavedListColumnState> = {
  columns: TColumn[];
  viewCountRefreshedAtByVideoId: Record<string, number>;
};

export function getNextSavedListName<TColumn extends Pick<SavedListColumnState, "handleInput">>(
  columns: TColumn[]
): string {
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

export function normalizeSavedColumnOrderData(
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

export function sortSavedVideosByMode<TColumn extends SavedListColumnState>(
  column: TColumn,
  getPublishedTime: (video: VideoItem) => number
): VideoItem[] {
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
      const delta = getPublishedTime(a) - getPublishedTime(b);
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

export function addVideoToSavedColumn<TColumn extends SavedListColumnState>(
  column: TColumn,
  video: VideoItem,
  now: number
): TColumn {
  const exists = column.videos.some((item) => item.videoId === video.videoId);
  if (exists) {
    return column;
  }
  const nextManualOrder = [
    video.videoId,
    ...column.savedManualOrder.filter((videoId) => videoId !== video.videoId)
  ];
  return {
    ...column,
    videos: [video, ...column.videos],
    savedAddedAtByVideoId: {
      ...column.savedAddedAtByVideoId,
      [video.videoId]: now
    },
    savedManualOrder: nextManualOrder
  };
}

export function removeVideoFromSavedColumn<TColumn extends SavedListColumnState>(
  column: TColumn,
  videoId: string
): TColumn {
  return {
    ...column,
    videos: column.videos.filter((video) => video.videoId !== videoId),
    savedAddedAtByVideoId: Object.fromEntries(
      Object.entries(column.savedAddedAtByVideoId).filter((entry) => entry[0] !== videoId)
    ),
    savedManualOrder: column.savedManualOrder.filter((id) => id !== videoId)
  };
}

export function moveSavedVideoInManualOrder<TColumn extends SavedListColumnState>(
  column: TColumn,
  videoId: string,
  direction: "up" | "down"
): TColumn {
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
}

export function clearSavedColumnVideos<TColumn extends SavedListColumnState>(
  column: TColumn
): TColumn {
  return {
    ...column,
    videos: [],
    savedAddedAtByVideoId: {},
    savedManualOrder: []
  };
}

export function moveSavedVideoBetweenColumns<
  TColumn extends SavedListColumnState,
  TBoard extends SavedBoardState<TColumn>
>(
  board: TBoard,
  sourceColumnId: string,
  targetColumnId: string,
  videoId: string,
  now: number
): TBoard {
  const sourceColumn = board.columns.find((column) => column.id === sourceColumnId);
  const videoToMove = sourceColumn?.videos.find((video) => video.videoId === videoId);
  if (!videoToMove) {
    return board;
  }

  return {
    ...board,
    columns: board.columns.map((column) => {
      if (column.id === sourceColumnId) {
        return removeVideoFromSavedColumn(column, videoId);
      }
      if (column.id === targetColumnId) {
        return addVideoToSavedColumn(column, videoToMove, now);
      }
      return column;
    })
  };
}
