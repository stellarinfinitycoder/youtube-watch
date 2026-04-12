import type { VideoItem } from "../types/youtube";

export function matchesVideoIdKey(storedVideoId: string, targetVideoId: string): boolean {
  return storedVideoId.toLowerCase() === targetVideoId.toLowerCase();
}

export function isVideoMarkedWatched(
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

export function setWatchedForVideoIds(
  watchedVideos: Record<string, boolean>,
  videoIds: string[],
  watched: boolean
): Record<string, boolean> {
  const next = { ...watchedVideos };
  videoIds.forEach((videoId) => {
    if (watched) {
      next[videoId] = true;
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

export function collectMissingDurationNewVideoIds(
  watchedVideos: Record<string, boolean>,
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
