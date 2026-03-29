type TranscriptSegment = {
  text: string;
  duration: number;
  offset: number;
  lang?: string;
};

type TranscriptFailureCode =
  | "invalid_input"
  | "innertube_fetch_failed"
  | "innertube_no_tracks"
  | "watchpage_fetch_failed"
  | "watchpage_no_tracks"
  | "no_tracks"
  | "invalid_track_url"
  | "xml_fetch_blocked"
  | "xml_fetch_failed"
  | "xml_parse_empty";

export type TranscriptDebugInfo = {
  input: string;
  videoId: string | null;
  stage: string;
  reason: TranscriptFailureCode | "ok";
  innertubeTrackCount: number;
  watchPageTrackCount: number;
  selectedTrackLanguage: string | null;
  selectedTrackHost: string | null;
  notes: string[];
};

class TranscriptStageError extends Error {
  readonly reason: TranscriptFailureCode;
  readonly debug: TranscriptDebugInfo;

  constructor(reason: TranscriptFailureCode, message: string, debug: TranscriptDebugInfo) {
    super(message);
    this.reason = reason;
    this.debug = debug;
  }
}

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
  const value = input.trim().replace(/[)\],.;!?]+$/, "");
  if (!value) {
    return null;
  }
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) {
    return value;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
      if (/^[A-Za-z0-9_-]{11}$/.test(id)) {
        return id;
      }
    }
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const vParam = parsed.searchParams.get("v") ?? "";
      if (/^[A-Za-z0-9_-]{11}$/.test(vParam)) {
        return vParam;
      }
      const parts = parsed.pathname.split("/").filter(Boolean);
      const marker = parts[0]?.toLowerCase() ?? "";
      if (["shorts", "live", "embed", "v", "e"].includes(marker)) {
        const id = parts[1] ?? "";
        if (/^[A-Za-z0-9_-]{11}$/.test(id)) {
          return id;
        }
      }
    }
  } catch {
    // Fallback regex parse below.
  }

  const match = value.match(
    /(?:youtube\.com\/(?:shorts|live|embed|v|e)\/|youtube\.com\/.*[?&]v=|youtu\.be\/)([^"&?/\\s]{11})/i
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
  try {
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
  } catch {
    return [];
  }
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
  lang?: string,
  options?: { debug?: boolean }
): Promise<{ videoId: string; text: string; debug?: TranscriptDebugInfo }> {
  const debug: TranscriptDebugInfo = {
    input: videoIdOrUrl,
    videoId: null,
    stage: "parse_input",
    reason: "ok",
    innertubeTrackCount: 0,
    watchPageTrackCount: 0,
    selectedTrackLanguage: null,
    selectedTrackHost: null,
    notes: []
  };
  const videoId = extractYouTubeVideoId(videoIdOrUrl);
  if (!videoId) {
    debug.reason = "invalid_input";
    debug.notes.push("extractYouTubeVideoId returned null");
    throw new TranscriptStageError("invalid_input", "Invalid YouTube video ID or URL.", debug);
  }
  debug.videoId = videoId;

  debug.stage = "fetch_innertube_tracks";
  let tracks = await fetchTracksViaInnerTube(videoId);
  debug.innertubeTrackCount = tracks.length;
  if (tracks.length === 0) {
    debug.notes.push("InnerTube returned 0 caption tracks");
  }

  if (tracks.length === 0) {
    debug.stage = "fetch_watchpage_tracks";
    tracks = await fetchTracksViaWatchPage(videoId, lang);
    debug.watchPageTrackCount = tracks.length;
    if (tracks.length === 0) {
      debug.notes.push("Watch page parser returned 0 caption tracks");
    }
  }
  if (tracks.length === 0) {
    debug.stage = "tracks_empty";
    debug.reason = "no_tracks";
    throw new TranscriptStageError("no_tracks", "No transcript available.", debug);
  }

  debug.stage = "select_track";
  const track = chooseTrack(tracks, lang);
  const baseUrl = track?.baseUrl ?? "";
  debug.selectedTrackLanguage = track?.languageCode ?? null;
  if (!baseUrl) {
    debug.reason = "invalid_track_url";
    debug.notes.push("Selected track has empty baseUrl");
    throw new TranscriptStageError("invalid_track_url", "No transcript available.", debug);
  }

  debug.stage = "validate_track_url";
  let parsedTrackUrl: URL;
  try {
    parsedTrackUrl = new URL(baseUrl);
  } catch {
    debug.reason = "invalid_track_url";
    debug.notes.push("Track baseUrl is not a valid URL");
    throw new TranscriptStageError("invalid_track_url", "No transcript available.", debug);
  }
  debug.selectedTrackHost = parsedTrackUrl.hostname;
  if (!parsedTrackUrl.hostname.endsWith(".youtube.com")) {
    debug.reason = "invalid_track_url";
    debug.notes.push(`Track host rejected: ${parsedTrackUrl.hostname}`);
    throw new TranscriptStageError("invalid_track_url", "No transcript available.", debug);
  }

  debug.stage = "fetch_transcript_xml";
  const xmlResponse = await fetch(parsedTrackUrl.toString(), {
    headers: {
      ...(lang ? { "Accept-Language": lang } : {}),
      "User-Agent": WEB_UA
    }
  });
  if (!xmlResponse.ok) {
    debug.reason = "xml_fetch_blocked";
    debug.notes.push(`XML fetch failed with status ${xmlResponse.status}`);
    throw new TranscriptStageError("xml_fetch_blocked", "No transcript available.", debug);
  }
  const xml = await xmlResponse.text();
  debug.stage = "parse_transcript_xml";
  const segments = parseTranscriptXml(xml, track?.languageCode ?? lang ?? "");
  const text = segments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join("\n");

  if (!text) {
    debug.reason = "xml_parse_empty";
    debug.notes.push("XML parsed to 0 text segments");
    throw new TranscriptStageError("xml_parse_empty", "No transcript available.", debug);
  }
  debug.stage = "done";
  debug.reason = "ok";

  return {
    videoId,
    text,
    ...(options?.debug ? { debug } : {})
  };
}

export function getTranscriptErrorReason(error: unknown): TranscriptFailureCode | null {
  if (error instanceof TranscriptStageError) {
    return error.reason;
  }
  return null;
}

export function getTranscriptErrorDebug(error: unknown): TranscriptDebugInfo | null {
  if (error instanceof TranscriptStageError) {
    return error.debug;
  }
  return null;
}
