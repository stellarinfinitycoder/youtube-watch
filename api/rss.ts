import { listPublishedItems } from "./_lib/publisher-store.js";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getBaseUrl(req: any): string {
  const explicit = String(process.env.PUBLIC_SITE_URL ?? "").trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }
  const host = String(req.headers?.host ?? "").trim();
  const proto = String(req.headers?.["x-forwarded-proto"] ?? "https").trim() || "https";
  if (!host) {
    return "https://example.com";
  }
  return `${proto}://${host}`;
}

function toRssDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toUTCString();
  }
  return date.toUTCString();
}

function getRssThumbnailUrl(item: { videoId?: string; thumbnailUrl?: string }): string {
  const videoId = String(item.videoId ?? "").trim();
  if (videoId) {
    return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;
  }
  return String(item.thumbnailUrl ?? "").trim();
}

function getCanonicalYoutubeUrl(item: { videoId?: string; videoUrl?: string }): string {
  const videoId = String(item.videoId ?? "").trim();
  if (videoId) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  }
  const raw = String(item.videoUrl ?? "").trim();
  if (/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(raw)) {
    return raw;
  }
  return "";
}

function sanitizeSummaryForRss(summary: string): string {
  const normalized = summary.replace(/\r\n/g, "\n");
  const withoutMarkdownLinks = normalized.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi,
    "$1"
  );
  const withoutAngleLinks = withoutMarkdownLinks.replace(/<https?:\/\/[^>]+>/gi, "");
  const withoutStandaloneUrlLines = withoutAngleLinks
    .split("\n")
    .filter((line) => !/^https?:\/\/\S+$/i.test(line.trim()))
    .join("\n");

  return withoutStandaloneUrlLines
    .replace(/https?:\/\/[^\s)]+/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).send("Method not allowed");
    return;
  }

  try {
    const items = await listPublishedItems(200);
    const dedupedItems = items
      .filter((item) => getCanonicalYoutubeUrl(item).length > 0)
      .filter((item, index, all) => {
        const canonicalUrl = getCanonicalYoutubeUrl(item);
        const fallbackKey = `${item.title.trim().toLowerCase()}|${item.summary.trim().toLowerCase()}`;
        const key = canonicalUrl || fallbackKey;
        return (
          all.findIndex((candidate) => {
            const candidateCanonicalUrl = getCanonicalYoutubeUrl(candidate);
            const candidateFallbackKey = `${candidate.title
              .trim()
              .toLowerCase()}|${candidate.summary.trim().toLowerCase()}`;
            const candidateKey = candidateCanonicalUrl || candidateFallbackKey;
            return candidateKey === key;
          }) === index
        );
      });
    const baseUrl = getBaseUrl(req);
    const feedTitle = "YouTube Watch News";
    const feedLink = `${baseUrl}/news`;
    const feedDescription = "Published video summaries.";

    const rssItems = dedupedItems
      .map((item) => {
        const itemLink = getCanonicalYoutubeUrl(item);
        const thumbnailUrl = getRssThumbnailUrl(item);
        const summaryForRss = sanitizeSummaryForRss(item.summary);
        const encodedDescription = `<p>${escapeXml(summaryForRss)}</p>`;
        const encodedHtml =
          thumbnailUrl.length > 0
            ? [
                `<p><a href="${escapeXml(itemLink)}" target="_blank" rel="noreferrer"><img src="${escapeXml(
                  thumbnailUrl
                )}" alt="${escapeXml(item.title)}" width="100%" style="display:block;width:100%;height:auto;" /></a></p>`,
                encodedDescription
              ].join("")
            : encodedDescription;
        return [
          "<item>",
          `<title>${escapeXml(item.title)}</title>`,
          `<link>${escapeXml(itemLink)}</link>`,
          `<guid isPermaLink="false">${escapeXml(item.id)}</guid>`,
          `<pubDate>${escapeXml(toRssDate(item.updatedAt || item.publishedAt))}</pubDate>`,
          `<description><![CDATA[${encodedHtml}]]></description>`,
          thumbnailUrl.length > 0
            ? `<enclosure url="${escapeXml(thumbnailUrl)}" type="image/jpeg" />`
            : "",
          thumbnailUrl.length > 0
            ? `<media:thumbnail url="${escapeXml(thumbnailUrl)}" />`
            : "",
          thumbnailUrl.length > 0
            ? `<media:content url="${escapeXml(thumbnailUrl)}" medium="image" type="image/jpeg" />`
            : "",
          "</item>"
        ].join("");
      })
      .join("");

    const rssXml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/">',
      "<channel>",
      `<title>${escapeXml(feedTitle)}</title>`,
      `<link>${escapeXml(feedLink)}</link>`,
      `<description>${escapeXml(feedDescription)}</description>`,
      `<lastBuildDate>${escapeXml(new Date().toUTCString())}</lastBuildDate>`,
      rssItems,
      "</channel>",
      "</rss>"
    ].join("");

    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    res.status(200).send(rssXml);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build RSS feed.";
    res.status(500).json({ error: message });
  }
}
