import type { VideoItem } from "../types/youtube";

export type ColumnStateLike = {
  id: string;
  handleInput: string;
  currentHandle: string;
  channelThumbnailUrl: string;
  lastGoodChannelThumbnailUrl: string;
  videos: VideoItem[];
  loading: boolean;
  error: string | null;
  savedSortMode: string;
  channelId?: string;
  uploadsPlaylistId?: string;
  lastFetchAt?: string | null;
  savedAddedAtByVideoId?: Record<string, number>;
  savedManualOrder?: string[];
};

export type InlineMetaFeedback = {
  kind: "info" | "success" | "error" | "warning";
  text: string;
};
