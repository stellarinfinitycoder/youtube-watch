export type VideoItem = {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  channelTitle: string;
  videoUrl: string;
  viewCount: number | null;
};

export type FetchState = {
  loading: boolean;
  error: string | null;
  videos: VideoItem[];
  currentHandle: string;
};
