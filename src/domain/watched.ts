import type { VideoItem } from "../types/youtube";

export type WatchedVideosMap = Record<string, number>;

export function matchesVideoIdKey(storedVideoId: string, targetVideoId: string): boolean {
  return storedVideoId.toLowerCase() === targetVideoId.toLowerCase();
}

export function isVideoMarkedWatched(
  watchedVideos: WatchedVideosMap,
  videoId: string
): boolean {
  if (typeof watchedVideos[videoId] === "number" && Number.isFinite(watchedVideos[videoId])) {
    return true;
  }
  return Object.entries(watchedVideos).some(
    ([storedVideoId, watchedAt]) =>
      typeof watchedAt === "number" &&
      Number.isFinite(watchedAt) &&
      matchesVideoIdKey(storedVideoId, videoId)
  );
}

export function setWatchedForVideoIds(
  watchedVideos: WatchedVideosMap,
  videoIds: string[],
  watched: boolean
): WatchedVideosMap {
  const next = { ...watchedVideos };
  videoIds.forEach((videoId) => {
    if (watched) {
      Object.keys(next).forEach((storedVideoId) => {
        if (matchesVideoIdKey(storedVideoId, videoId)) {
          delete next[storedVideoId];
        }
      });
      next[videoId] = Date.now();
      return;
    }
    Object.keys(next).forEach((storedVideoId) => {
      if (matchesVideoIdKey(storedVideoId, videoId)) {
        delete next[storedVideoId];
      }
    });
  });
  return next;
}

export function pruneWatchedVideos(
  watchedVideos: WatchedVideosMap,
  presentVideoIds: Set<string>
): WatchedVideosMap {
  return Object.fromEntries(
    Object.entries(watchedVideos).filter(
      ([videoId, watchedAt]) =>
        presentVideoIds.has(videoId) &&
        typeof watchedAt === "number" &&
        Number.isFinite(watchedAt)
    )
  );
}

export function collectMissingDurationNewVideoIds(
  watchedVideos: WatchedVideosMap,
  videos: VideoItem[]
): string[] {
  const unique = new Set<string>();
  videos.forEach((video) => {
    const isWatched = isVideoMarkedWatched(watchedVideos, video.videoId);
    const hasDuration = typeof video.durationSeconds === "number";
    if (isWatched || hasDuration) {
      return;
    }
    unique.add(video.videoId);
  });
  return [...unique];
}
