export type VideoItem = {
  videoId: string;
  title: string;
  publishedAt: string;
  durationSeconds?: number | null;
  embeddable?: boolean;
  thumbnailUrl: string;
  channelTitle: string;
  videoUrl: string;
  viewCount: number | null;
};

export type SimilarVideoSeed = {
  query: string;
  source: "video" | "channel" | "manual";
  sourceTitle: string;
};

export type SimilarVideoDiscoveryRequest = {
  seeds: SimilarVideoSeed[];
  existingChannelIds: string[];
  maxSeeds?: number;
  resultsPerSeed?: number;
};

export type SimilarVideoDiscoveryItem = VideoItem & {
  channelId: string;
  channelThumbnailUrl: string;
  uploadsPlaylistId: string;
  channelHandle: string;
  channelUrl: string;
  matchReason: string;
  matchedSeed: string;
  score: number;
  alreadyOnBoard: boolean;
};

export type SimilarVideoDiscoveryResult = {
  videos: SimilarVideoDiscoveryItem[];
  searchedSeeds: SimilarVideoSeed[];
  estimatedQuotaUnits: number;
};

export type FetchState = {
  loading: boolean;
  error: string | null;
  videos: VideoItem[];
  currentHandle: string;
};
