export type PublishedItem = {
  id: string;
  videoId: string;
  videoUrl: string;
  title: string;
  summary: string;
  thumbnailUrl: string;
  channelTitle: string;
  publishedAt: string;
  durationSeconds?: number | null;
  viewCount?: number | null;
  publishedBy: string;
  createdAt: string;
  updatedAt: string;
};
