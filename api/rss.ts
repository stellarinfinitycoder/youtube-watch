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

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).send("Method not allowed");
    return;
  }

  try {
    const items = await listPublishedItems(200);
    const baseUrl = getBaseUrl(req);
    const feedTitle = "YouTube Watch News";
    const feedLink = `${baseUrl}/news`;
    const feedDescription = "Published video summaries.";

    const rssItems = items
      .map((item) => {
        const itemLink = item.videoUrl?.trim() || `${baseUrl}/news/${encodeURIComponent(item.id)}`;
        const thumbnailUrl = item.thumbnailUrl?.trim() || "";
        const encodedDescription = `<p>${escapeXml(item.summary)}</p>`;
        const encodedHtml =
          thumbnailUrl.length > 0
            ? `<p><a href="${escapeXml(itemLink)}" target="_blank" rel="noreferrer"><img src="${escapeXml(
                thumbnailUrl
              )}" alt="${escapeXml(item.title)}" /></a></p>${encodedDescription}`
            : encodedDescription;
        return [
          "<item>",
          `<title>${escapeXml(item.title)}</title>`,
          `<link>${escapeXml(itemLink)}</link>`,
          `<guid isPermaLink="false">${escapeXml(item.id)}</guid>`,
          `<pubDate>${escapeXml(toRssDate(item.updatedAt || item.publishedAt))}</pubDate>`,
          `<description>${escapeXml(item.summary)}</description>`,
          thumbnailUrl.length > 0
            ? `<enclosure url="${escapeXml(thumbnailUrl)}" type="image/jpeg" />`
            : "",
          thumbnailUrl.length > 0
            ? `<media:thumbnail url="${escapeXml(thumbnailUrl)}" />`
            : "",
          thumbnailUrl.length > 0
            ? `<media:content url="${escapeXml(thumbnailUrl)}" medium="image" type="image/jpeg" />`
            : "",
          `<content:encoded><![CDATA[${encodedHtml}]]></content:encoded>`,
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
