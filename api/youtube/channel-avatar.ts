const ALLOWED_HOST_SUFFIXES = [
  ".googleusercontent.com",
  ".ggpht.com",
  ".ytimg.com"
];

function isAllowedAvatarUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix)
  );
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const sourceUrl = String(req.query.url ?? "").trim();
  if (!sourceUrl || !isAllowedAvatarUrl(sourceUrl)) {
    res.status(400).json({ error: "Invalid channel avatar URL." });
    return;
  }

  try {
    const upstream = await fetch(sourceUrl, {
      headers: {
        "User-Agent": "Youtube-Watch-Avatar-Proxy/1.0"
      }
    });

    if (!upstream.ok) {
      res.status(502).json({ error: "Failed to fetch upstream avatar." });
      return;
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const cacheControl =
      upstream.headers.get("cache-control") ||
      "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";
    const body = Buffer.from(await upstream.arrayBuffer());

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", cacheControl);
    res.setHeader("Content-Length", String(body.length));
    res.status(200).send(body);
  } catch {
    res.status(502).json({ error: "Failed to fetch upstream avatar." });
  }
}
