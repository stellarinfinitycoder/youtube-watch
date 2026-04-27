import type { VideoItem } from "../types/youtube";

export type BoardAssetPreloadColumn = {
  id: string;
  videos: VideoItem[];
};

type CollectBoardAssetPreloadUrlsArgs<TColumn extends BoardAssetPreloadColumn> = {
  visibleColumns: TColumn[];
  hiddenColumns?: TColumn[];
  filteredVideosByColumnId: Map<string, VideoItem[]>;
  getColumnAvatarSrc: (column: TColumn) => string;
  getVideoThumbnailSrc: (video: VideoItem) => string;
  maxVideoThumbnails?: number;
};

export const DEFAULT_BOARD_PRELOAD_VIDEO_THUMBNAIL_LIMIT = 18;

function addUniqueUrl(target: string[], seen: Set<string>, rawUrl: string): void {
  const url = rawUrl.trim();
  if (!url || seen.has(url)) {
    return;
  }
  seen.add(url);
  target.push(url);
}

export function collectBoardAssetPreloadUrls<TColumn extends BoardAssetPreloadColumn>({
  visibleColumns,
  hiddenColumns = [],
  filteredVideosByColumnId,
  getColumnAvatarSrc,
  getVideoThumbnailSrc,
  maxVideoThumbnails = DEFAULT_BOARD_PRELOAD_VIDEO_THUMBNAIL_LIMIT
}: CollectBoardAssetPreloadUrlsArgs<TColumn>): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  visibleColumns.forEach((column) => {
    addUniqueUrl(urls, seen, getColumnAvatarSrc(column));
  });
  hiddenColumns.forEach((column) => {
    addUniqueUrl(urls, seen, getColumnAvatarSrc(column));
  });

  let remainingVideoThumbnails = Math.max(0, Math.floor(maxVideoThumbnails));
  for (const column of visibleColumns) {
    if (remainingVideoThumbnails <= 0) {
      break;
    }

    const videos = filteredVideosByColumnId.get(column.id) ?? [];
    for (const video of videos) {
      if (remainingVideoThumbnails <= 0) {
        break;
      }
      const beforeCount = urls.length;
      addUniqueUrl(urls, seen, getVideoThumbnailSrc(video));
      if (urls.length > beforeCount) {
        remainingVideoThumbnails -= 1;
      }
    }
  }

  return urls;
}

export function collectColumnAvatarPreloadUrls<TColumn>(
  columns: TColumn[],
  getColumnAvatarSrc: (column: TColumn) => string
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  columns.forEach((column) => {
    addUniqueUrl(urls, seen, getColumnAvatarSrc(column));
  });

  return urls;
}

export function selectChannelThumbnailUrl(
  column: {
    channelThumbnailUrl: string;
    lastGoodChannelThumbnailUrl: string;
  },
  isBroken: boolean
): string {
  const lastGoodChannelThumbnailUrl = column.lastGoodChannelThumbnailUrl.trim();
  if (lastGoodChannelThumbnailUrl) {
    return lastGoodChannelThumbnailUrl;
  }

  if (isBroken) {
    return "";
  }

  return column.channelThumbnailUrl.trim();
}
