import type { SimilarVideoDiscoveryItem, SimilarVideoSeed, VideoItem } from "../types/youtube";

export type DiscoveryColumnSeedInput = {
  id: string;
  handleInput: string;
  currentHandle: string;
  channelId?: string;
  videos: VideoItem[];
};

export type DiscoveryChannelCandidate = {
  channelId: string;
  video: SimilarVideoDiscoveryItem;
  score: number;
  resultCount: number;
};

const MAX_QUERY_WORDS = 8;
const DEFAULT_MAX_SEEDS = 5;
const COMMON_WORDS = new Set([
  "a",
  "about",
  "after",
  "all",
  "and",
  "are",
  "but",
  "for",
  "from",
  "how",
  "into",
  "new",
  "not",
  "now",
  "of",
  "on",
  "the",
  "this",
  "to",
  "with",
  "you",
  "your"
]);

function normalizeText(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[@#][A-Za-z0-9._-]+/g, " ")
    .replace(/[^A-Za-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .map((word) => word.toLowerCase().replace(/^['-]+|['-]+$/g, ""))
    .filter((word) => word.length > 2 && !COMMON_WORDS.has(word));
}

function buildQueryFromTitle(title: string, channelTitle: string): string {
  const words = tokenize(title);
  const channelWords = tokenize(channelTitle);
  const combined = [...words, ...channelWords.filter((word) => !words.includes(word))];
  return combined.slice(0, MAX_QUERY_WORDS).join(" ");
}

function countRecentVideosByChannel(columns: DiscoveryColumnSeedInput[]): Map<string, number> {
  const counts = new Map<string, number>();
  columns.forEach((column) => {
    column.videos.slice(0, 4).forEach((video) => {
      const channelTitle = video.channelTitle.trim();
      if (!channelTitle) {
        return;
      }
      counts.set(channelTitle, (counts.get(channelTitle) ?? 0) + 1);
    });
  });
  return counts;
}

export function buildSimilarVideoSeeds(
  columns: DiscoveryColumnSeedInput[],
  maxSeeds = DEFAULT_MAX_SEEDS
): SimilarVideoSeed[] {
  const seeds: SimilarVideoSeed[] = [];
  const seenQueries = new Set<string>();
  const recentVideos = columns
    .flatMap((column) => column.videos.slice(0, 4))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  recentVideos.forEach((video) => {
    if (seeds.length >= maxSeeds) {
      return;
    }
    const query = buildQueryFromTitle(video.title, video.channelTitle);
    if (query.length < 6 || seenQueries.has(query)) {
      return;
    }
    seenQueries.add(query);
    seeds.push({
      query,
      source: "video",
      sourceTitle: video.title
    });
  });

  if (seeds.length >= maxSeeds) {
    return seeds;
  }

  const channelCounts = [...countRecentVideosByChannel(columns).entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
  channelCounts.forEach(([channelTitle]) => {
    if (seeds.length >= maxSeeds) {
      return;
    }
    const query = tokenize(channelTitle).slice(0, MAX_QUERY_WORDS).join(" ");
    if (query.length < 3 || seenQueries.has(query)) {
      return;
    }
    seenQueries.add(query);
    seeds.push({
      query,
      source: "channel",
      sourceTitle: channelTitle
    });
  });

  return seeds;
}

export function collectExistingChannelIds(columns: DiscoveryColumnSeedInput[]): string[] {
  return Array.from(
    new Set(
      columns
        .map((column) => column.channelId?.trim())
        .filter((channelId): channelId is string => Boolean(channelId))
    )
  );
}

export function buildDiscoveryChannelCandidates(
  videos: SimilarVideoDiscoveryItem[],
  followedChannelIds: string[],
  limit = 10,
  ignoredChannelIds: string[] = []
): DiscoveryChannelCandidate[] {
  const followed = new Set(followedChannelIds.map((id) => id.trim()).filter(Boolean));
  const ignored = new Set(ignoredChannelIds.map((id) => id.trim()).filter(Boolean));
  const byChannelId = new Map<string, DiscoveryChannelCandidate>();

  videos.forEach((video) => {
    const channelId = video.channelId.trim();
    if (!channelId || followed.has(channelId) || ignored.has(channelId)) {
      return;
    }
    const existing = byChannelId.get(channelId);
    if (!existing) {
      byChannelId.set(channelId, {
        channelId,
        video,
        score: video.score,
        resultCount: 1
      });
      return;
    }
    existing.resultCount += 1;
    existing.score = Math.max(existing.score, video.score);
    if (video.score > existing.video.score) {
      existing.video = video;
    }
  });

  return Array.from(byChannelId.values())
    .map((candidate) => ({
      ...candidate,
      score: candidate.score + Math.max(0, candidate.resultCount - 1) * 20
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (b.resultCount !== a.resultCount) {
        return b.resultCount - a.resultCount;
      }
      return a.video.channelTitle.localeCompare(b.video.channelTitle);
    })
    .slice(0, Math.max(0, Math.floor(limit)));
}
