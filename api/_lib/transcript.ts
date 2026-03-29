type TranscriptSegment = {
  text: string;
  duration: number;
  offset: number;
  lang?: string;
};

type CaptionTrack = {
  baseUrl?: string;
  languageCode?: string;
};

const YOUTUBE_PLAYER_ENDPOINT = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const ANDROID_CLIENT_VERSION = "20.10.38";
const ANDROID_UA = `com.google.android.youtube/${ANDROID_CLIENT_VERSION} (Linux; U; Android 14)`;
const WEB_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)";

export function extractYouTubeVideoId(input: string): string | null {
  const value = input.trim();
  if (!value) {
    return null;
  }
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) {
    return value;
  }
  const match = value.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\\s]{11})/i
  );
  return match?.[1] ?? null;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function parseTranscriptXml(xml: string, languageCode: string): TranscriptSegment[] {
  const srv3Segments: TranscriptSegment[] = [];
  const srv3Regex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let srv3Match: RegExpExecArray | null = srv3Regex.exec(xml);
  while (srv3Match) {
    const offset = Number.parseInt(srv3Match[1], 10);
    const duration = Number.parseInt(srv3Match[2], 10);
    const raw = srv3Match[3];
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let textParts = "";
    let sMatch: RegExpExecArray | null = sRegex.exec(raw);
    while (sMatch) {
      textParts += sMatch[1];
      sMatch = sRegex.exec(raw);
    }
    const text = decodeXmlEntities((textParts || raw.replace(/<[^>]+>/g, "")).trim());
    if (text) {
      srv3Segments.push({
        text,
        duration,
        offset,
        lang: languageCode
      });
    }
    srv3Match = srv3Regex.exec(xml);
  }
  if (srv3Segments.length > 0) {
    return srv3Segments;
  }

  const classicSegments: TranscriptSegment[] = [];
  const classicRegex = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
  let classicMatch: RegExpExecArray | null = classicRegex.exec(xml);
  while (classicMatch) {
    const text = decodeXmlEntities((classicMatch[3] ?? "").trim());
    if (text) {
      classicSegments.push({
        text,
        duration: Number.parseFloat(classicMatch[2] ?? "0"),
        offset: Number.parseFloat(classicMatch[1] ?? "0"),
        lang: languageCode
      });
    }
    classicMatch = classicRegex.exec(xml);
  }
  return classicSegments;
}

function parseInlineJsonFromHtml(html: string, varName: string): unknown | null {
  const marker = `var ${varName} = `;
  const start = html.indexOf(marker);
  if (start === -1) {
    return null;
  }
  let braceDepth = 0;
  let begin = start + marker.length;
  for (let index = begin; index < html.length; index += 1) {
    const char = html[index];
    if (char === "{") {
      braceDepth += 1;
    } else if (char === "}") {
      braceDepth -= 1;
      if (braceDepth === 0) {
        const jsonText = html.slice(begin, index + 1);
        try {
          return JSON.parse(jsonText);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function chooseTrack(tracks: CaptionTrack[], lang?: string): CaptionTrack | null {
  if (tracks.length === 0) {
    return null;
  }
  if (lang) {
    const exact = tracks.find((track) => track.languageCode === lang);
    if (exact) {
      return exact;
    }
    const prefix = tracks.find((track) => (track.languageCode ?? "").startsWith(lang));
    if (prefix) {
      return prefix;
    }
  }
  return tracks[0];
}

async function fetchTracksViaInnerTube(videoId: string): Promise<CaptionTrack[]> {
  const response = await fetch(YOUTUBE_PLAYER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": ANDROID_UA
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: "ANDROID",
          clientVersion: ANDROID_CLIENT_VERSION
        }
      },
      videoId
    })
  });
  if (!response.ok) {
    return [];
  }
  const payload = (await response.json().catch(() => ({}))) as any;
  const tracks = payload?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  return Array.isArray(tracks) ? tracks : [];
}

async function fetchTracksViaWatchPage(videoId: string, lang?: string): Promise<CaptionTrack[]> {
  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      ...(lang ? { "Accept-Language": lang } : {}),
      "User-Agent": WEB_UA
    }
  });
  if (!response.ok) {
    return [];
  }
  const html = await response.text();
  const payload = parseInlineJsonFromHtml(html, "ytInitialPlayerResponse") as any;
  const tracks = payload?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  return Array.isArray(tracks) ? tracks : [];
}

export async function fetchYouTubeTranscript(
  videoIdOrUrl: string,
  lang?: string
): Promise<{ videoId: string; text: string }> {
  const videoId = extractYouTubeVideoId(videoIdOrUrl);
  if (!videoId) {
    throw new Error("Invalid YouTube video ID or URL.");
  }

  let tracks = await fetchTracksViaInnerTube(videoId);
  if (tracks.length === 0) {
    tracks = await fetchTracksViaWatchPage(videoId, lang);
  }
  if (tracks.length === 0) {
    throw new Error("No transcript available.");
  }

  const track = chooseTrack(tracks, lang);
  const baseUrl = track?.baseUrl ?? "";
  if (!baseUrl) {
    throw new Error("No transcript available.");
  }

  let parsedTrackUrl: URL;
  try {
    parsedTrackUrl = new URL(baseUrl);
  } catch {
    throw new Error("No transcript available.");
  }
  if (!parsedTrackUrl.hostname.endsWith(".youtube.com")) {
    throw new Error("No transcript available.");
  }

  const xmlResponse = await fetch(parsedTrackUrl.toString(), {
    headers: {
      ...(lang ? { "Accept-Language": lang } : {}),
      "User-Agent": WEB_UA
    }
  });
  if (!xmlResponse.ok) {
    throw new Error("No transcript available.");
  }
  const xml = await xmlResponse.text();
  const segments = parseTranscriptXml(xml, track?.languageCode ?? lang ?? "");
  const text = segments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join("\n");

  if (!text) {
    throw new Error("No transcript available.");
  }

  return {
    videoId,
    text
  };
}
