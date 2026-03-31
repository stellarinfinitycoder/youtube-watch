import { fetchYouTubeTranscript } from "./_lib/transcript.js";

const DEFAULT_MODEL = process.env.OPENROUTER_DEFAULT_MODEL || "openai/gpt-4o-mini";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_TRANSCRIPT_CHARS = 15000;

type SummaryMode = "short" | "detailed" | "bullets";

function parseBody(req: any): Record<string, unknown> {
  if (req.body && typeof req.body === "object") {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === "string") {
    try {
      const parsed = JSON.parse(req.body) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore malformed JSON
    }
  }
  return {};
}

function parseVideoInput(req: any): string {
  const body = parseBody(req);
  const queryVideoId = String(req.query?.videoId ?? "").trim();
  const queryUrl = String(req.query?.url ?? "").trim();
  if (queryVideoId) {
    return queryVideoId;
  }
  if (queryUrl) {
    return queryUrl;
  }
  if (typeof body.videoId === "string" && body.videoId.trim()) {
    return body.videoId.trim();
  }
  if (typeof body.url === "string" && body.url.trim()) {
    return body.url.trim();
  }
  return "";
}

function parseMode(body: Record<string, unknown>): SummaryMode {
  const value = typeof body.mode === "string" ? body.mode.trim().toLowerCase() : "";
  if (value === "detailed" || value === "bullets") {
    return value;
  }
  return "short";
}

function getPrompt(mode: SummaryMode): string {
  if (mode === "detailed") {
    return [
      "You summarize YouTube transcripts.",
      "Return strict JSON with keys: summary (string), keyPoints (string[]).",
      "summary: 8-12 concise sentences.",
      "keyPoints: 8-12 short bullets.",
      "Use only transcript content. No fabricated facts."
    ].join(" ");
  }
  if (mode === "bullets") {
    return [
      "You summarize YouTube transcripts.",
      "Return strict JSON with keys: summary (string), keyPoints (string[]).",
      "summary: 3-4 concise sentences.",
      "keyPoints: 8-12 short bullets.",
      "Use only transcript content. No fabricated facts."
    ].join(" ");
  }
  return [
    "You summarize YouTube transcripts.",
    "Return strict JSON with keys: summary (string), keyPoints (string[]).",
    "summary: max 5 concise sentences.",
    "keyPoints: 5-7 short bullets.",
    "Use only transcript content. No fabricated facts."
  ].join(" ");
}

function normalizeContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object") {
          const obj = part as Record<string, unknown>;
          if (typeof obj.text === "string") {
            return obj.text;
          }
        }
        return "";
      })
      .join("\n")
      .trim();
  }
  return "";
}

function safeJsonParse(raw: string): Record<string, unknown> | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const stripped = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(stripped) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore parse failure
  }
  return null;
}

function normalizeSummaryPayload(raw: string): { summary: string; keyPoints: string[] } {
  const parsed = safeJsonParse(raw);
  if (parsed) {
    const summary =
      typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const keyPoints = Array.isArray(parsed.keyPoints)
      ? parsed.keyPoints
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : [];
    if (summary.length > 0 || keyPoints.length > 0) {
      return {
        summary: summary || keyPoints.join("\n"),
        keyPoints
      };
    }
  }

  const fallback = raw.trim();
  if (!fallback) {
    throw new Error("Empty summary from model.");
  }
  return {
    summary: fallback,
    keyPoints: []
  };
}

async function fetchOpenRouterSummary(params: {
  apiKey: string;
  model: string;
  transcriptText: string;
  mode: SummaryMode;
  referer?: string;
  title?: string;
}): Promise<{ summary: string; keyPoints: string[] }> {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
      ...(params.referer ? { "HTTP-Referer": params.referer } : {}),
      ...(params.title ? { "X-Title": params.title } : {})
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: getPrompt(params.mode)
        },
        {
          role: "user",
          content: `Transcript:\n${params.transcriptText.slice(0, MAX_TRANSCRIPT_CHARS)}`
        }
      ]
    })
  });

  const payload = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) {
    const reason =
      payload?.error?.message ||
      payload?.error ||
      `OpenRouter request failed (${response.status})`;
    throw new Error(String(reason));
  }

  const content = normalizeContent(payload?.choices?.[0]?.message?.content);
  return normalizeSummaryPayload(content);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = parseBody(req);
  const input = parseVideoInput(req);
  if (!input) {
    res.status(400).json({ error: "Missing videoId or url." });
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Missing OPENROUTER_API_KEY." });
    return;
  }

  const mode = parseMode(body);
  const requestedModel =
    typeof body.model === "string" && body.model.trim().length > 0
      ? body.model.trim()
      : DEFAULT_MODEL;

  try {
    let transcriptText =
      typeof body.transcriptText === "string" ? body.transcriptText.trim() : "";
    let resolvedVideoId =
      typeof body.videoId === "string" && body.videoId.trim().length > 0
        ? body.videoId.trim()
        : "";

    if (!transcriptText) {
      const transcript = await fetchYouTubeTranscript(input);
      transcriptText = transcript.text.trim();
      resolvedVideoId = transcript.videoId;
    }

    if (!transcriptText) {
      res.status(404).json({ error: "No transcript available." });
      return;
    }

    const summarized = await fetchOpenRouterSummary({
      apiKey,
      model: requestedModel,
      transcriptText,
      mode,
      referer: process.env.OPENROUTER_HTTP_REFERER,
      title: process.env.OPENROUTER_APP_TITLE || "Youtube Watch"
    });

    res.status(200).json({
      videoId: resolvedVideoId || input,
      model: requestedModel,
      summary: summarized.summary,
      keyPoints: summarized.keyPoints
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to summarize transcript.";
    if (/transcript|caption|subtitles|disabled|unavailable|not available/i.test(message)) {
      res.status(404).json({ error: "No transcript available." });
      return;
    }
    if (/openrouter|model|rate|quota|token|api key|auth/i.test(message.toLowerCase())) {
      res.status(502).json({ error: `Summary request failed: ${message}` });
      return;
    }
    res.status(500).json({ error: message });
  }
}
