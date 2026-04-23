import { useEffect, useMemo, useRef, useState } from "react";
import { fetchSummaryByVideoInput, fetchTranscriptByVideoInput } from "../api/youtube";
import {
  SUMMARY_FORMATS_STORAGE_KEY,
  SUMMARY_MODEL_PRESETS_STORAGE_KEY,
  SUMMARY_PROMPT_STORAGE_KEY,
  readCachedSummary as readCachedSummaryEntry,
  readStoredJson,
  readStoredString,
  writeCachedSummary as writeCachedSummaryEntry,
  writeStoredJson,
  type SummaryCacheEntry
} from "../storage/summariesStorage";
import { readCachedTranscript, writeCachedTranscript } from "../storage/transcriptsStorage";
import type { VideoItem } from "../types/youtube";
import { normalizeHandle } from "../utils/handle";

const DEFAULT_SUMMARY_FORMAT_ID = "summary-default";
export const NEW_SUMMARY_FORMAT_OPTION = "__new_summary_format__";
export const NEW_SUMMARY_MODEL_OPTION = "__new_summary_model__";
export const SUMMARY_MODE_OPTION_PREFIX = "summary:";

export const DEFAULT_SUMMARY_PROMPT = [
  "Focus on practical takeaways.",
  "Keep summary concise.",
  "Highlight important risks and decisions."
].join(" ");

const DEFAULT_SUMMARY_FORMAT_NAME = "SUMMARY";
const CACHE_HYDRATION_FEEDBACK_MS = 120;

const DEFAULT_SUMMARY_MODEL_PRESETS: Array<{ value: string; label: string }> = [
  { value: "", label: "DEFAULT (ENV)" },
  { value: "openai/gpt-4o-mini", label: "OPENAI GPT-4O-MINI" },
  { value: "google/gemini-2.5-flash-lite", label: "GEMINI 2.5 FLASH-LITE" },
  { value: "google/gemini-2.5-flash", label: "GEMINI 2.5 FLASH" },
  { value: "qwen/qwen3.6-plus:free", label: "QWEN 3.6 PLUS FREE" },
  { value: "nvidia/nemotron-3-super-120b-a12b:free", label: "NEMOTRON FREE" },
  { value: "minimax/minimax-m2.7", label: "MINIMAX M2.7" }
];

export type SummaryFormat = {
  id: string;
  name: string;
  prompt: string;
  model: string;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
};

export type SummaryModelPreset = {
  value: string;
  label: string;
};

export type InlineMetaFeedback = {
  kind: "success" | "error" | "info";
  text: string;
};

function createDefaultSummaryFormat(promptOverride?: string): SummaryFormat {
  const now = Date.now();
  const nextPrompt = (promptOverride ?? DEFAULT_SUMMARY_PROMPT).trim() || DEFAULT_SUMMARY_PROMPT;
  return {
    id: DEFAULT_SUMMARY_FORMAT_ID,
    name: DEFAULT_SUMMARY_FORMAT_NAME,
    prompt: nextPrompt,
    model: "",
    isDefault: true,
    createdAt: now,
    updatedAt: now
  };
}

function normalizeStoredSummaryFormats(input: unknown): SummaryFormat[] {
  if (!Array.isArray(input)) {
    return [createDefaultSummaryFormat()];
  }
  const sanitized = input
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const candidate = item as Partial<SummaryFormat>;
      const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
      const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
      const prompt = typeof candidate.prompt === "string" ? candidate.prompt.trim() : "";
      const model = typeof candidate.model === "string" ? candidate.model.trim() : "";
      if (!id || !name || !prompt) {
        return null;
      }
      return {
        id,
        name,
        prompt,
        model,
        isDefault: candidate.isDefault === true,
        createdAt:
          typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt)
            ? candidate.createdAt
            : Date.now(),
        updatedAt:
          typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt)
            ? candidate.updatedAt
            : Date.now()
      };
    })
    .filter((item): item is SummaryFormat => item !== null);

  if (sanitized.length === 0) {
    return [createDefaultSummaryFormat()];
  }

  const defaultCount = sanitized.filter((item) => item.isDefault).length;
  if (defaultCount !== 1) {
    sanitized.forEach((item, index) => {
      item.isDefault = index === 0;
    });
  }
  return sanitized;
}

export function getDefaultSummaryFormat(formats: SummaryFormat[]): SummaryFormat {
  return formats.find((item) => item.isDefault) ?? formats[0] ?? createDefaultSummaryFormat();
}

function getSummaryFormatById(
  formats: SummaryFormat[],
  formatId: string | null | undefined,
  fallback?: SummaryFormat
): SummaryFormat {
  if (typeof formatId === "string" && formatId.trim().length > 0) {
    const existing = formats.find((item) => item.id === formatId);
    if (existing) {
      return existing;
    }
  }
  if (fallback) {
    return fallback;
  }
  return getDefaultSummaryFormat(formats);
}

function normalizeSummaryModelPresets(input: unknown): SummaryModelPreset[] {
  const defaultEnvPreset = DEFAULT_SUMMARY_MODEL_PRESETS[0];
  const defaults = defaultEnvPreset ? [defaultEnvPreset] : [];
  if (!Array.isArray(input)) {
    return [...DEFAULT_SUMMARY_MODEL_PRESETS];
  }

  const merged = [...defaults];
  const existingValues = new Set(merged.map((item) => item.value.trim().toLowerCase()));

  input.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const candidate = item as Partial<SummaryModelPreset>;
    const value = typeof candidate.value === "string" ? candidate.value.trim() : "";
    if (!value) {
      return;
    }
    const key = value.toLowerCase();
    if (existingValues.has(key)) {
      return;
    }
    const label =
      typeof candidate.label === "string" && candidate.label.trim().length > 0
        ? candidate.label.trim()
        : value.toUpperCase();
    merged.push({ value, label });
    existingValues.add(key);
  });

  return merged;
}

function readStoredSummaryModelPresets(): SummaryModelPreset[] {
  return readStoredJson(
    SUMMARY_MODEL_PRESETS_STORAGE_KEY,
    [...DEFAULT_SUMMARY_MODEL_PRESETS],
    normalizeSummaryModelPresets
  );
}

export function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

export function looksLikeMarkdown(value: string): boolean {
  const text = value.trim();
  if (!text) {
    return false;
  }
  return (
    /^#{1,6}\s/m.test(text) ||
    /(^|\n)\s*[-*+]\s+/.test(text) ||
    /(^|\n)\s*\d+\.\s+/.test(text) ||
    /\[.+?\]\(.+?\)/.test(text) ||
    /\*\*[^*]+\*\*/.test(text) ||
    /`[^`]+`/.test(text) ||
    /^>\s/m.test(text)
  );
}

export function preserveTreeBlocksInMarkdown(value: string): string {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  const isTreeLine = (line: string): boolean => /[│├└─]/.test(line) || /^\s*\|/.test(line);
  const chunks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    if (!isTreeLine(lines[index])) {
      chunks.push(lines[index]);
      index += 1;
      continue;
    }

    const treeLines: string[] = [];
    while (index < lines.length && isTreeLine(lines[index])) {
      treeLines.push(lines[index]);
      index += 1;
    }
    chunks.push("```text");
    chunks.push(...treeLines);
    chunks.push("```");
  }

  return chunks.join("\n");
}

function readStoredSummaryPrompt(): string {
  return readStoredString(SUMMARY_PROMPT_STORAGE_KEY, DEFAULT_SUMMARY_PROMPT);
}

function readStoredSummaryFormats(): SummaryFormat[] {
  const legacyPrompt = readStoredSummaryPrompt();
  return readStoredJson(
    SUMMARY_FORMATS_STORAGE_KEY,
    [createDefaultSummaryFormat(legacyPrompt)],
    normalizeStoredSummaryFormats
  );
}

export function readCachedSummaryForTranscript(
  videoId: string,
  transcriptText: string,
  promptText: string
): Promise<SummaryCacheEntry | null> {
  if (typeof window === "undefined" || videoId.trim().length === 0) {
    return Promise.resolve(null);
  }
  const promptHash = hashText(promptText.trim());
  const transcriptHash = hashText(transcriptText.trim());
  return readCachedSummaryEntry(videoId, promptHash).then((parsed) => {
    if (!parsed) {
      return null;
    }
    if (parsed.transcriptHash !== transcriptHash || parsed.promptHash !== promptHash) {
      return null;
    }
    return parsed;
  });
}

export function writeCachedSummaryForTranscript(
  videoId: string,
  transcriptText: string,
  promptText: string,
  payload: { summary: string; keyPoints: string[]; model: string }
): Promise<void> {
  if (typeof window === "undefined" || videoId.trim().length === 0) {
    return Promise.resolve();
  }
  const promptHash = hashText(promptText.trim());
  const cacheEntry: SummaryCacheEntry = {
    summary: payload.summary,
    keyPoints: payload.keyPoints,
    model: payload.model,
    transcriptHash: hashText(transcriptText.trim()),
    promptHash,
    cachedAt: Date.now()
  };
  return writeCachedSummaryEntry(videoId, promptHash, cacheEntry);
}

function normalizePublishStatusText(value: string): string {
  const next = value.trim();
  if (!next) {
    return next;
  }
  if (next.endsWith("...")) {
    return next;
  }
  return next.replace(/[.]+$/, "");
}

export function useTranscriptSummary() {
  const transcriptRequestIdRef = useRef(0);
  const transcriptCopyFeedbackTimeoutRef = useRef<number | null>(null);
  const summaryFormatNameDraftRef = useRef("");
  const summaryPromptDraftRef = useRef("");
  const summaryFormatModelDraftRef = useRef("");

  const [transcriptVideo, setTranscriptVideo] = useState<VideoItem | null>(null);
  const [summaryHydrating, setSummaryHydrating] = useState(false);
  const [transcriptHydrating, setTranscriptHydrating] = useState(false);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptText, setTranscriptText] = useState("");
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [transcriptSourceHandle, setTranscriptSourceHandle] = useState("");
  const [transcriptViewMode, setTranscriptViewMode] = useState<"transcript" | "summary">(
    "transcript"
  );
  const [isTranscriptCopied, setIsTranscriptCopied] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const [summaryKeyPoints, setSummaryKeyPoints] = useState<string[]>([]);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryModel, setSummaryModel] = useState("");
  const [isPublishingSummary, setIsPublishingSummary] = useState(false);
  const [publishSummaryFeedback, setPublishSummaryFeedback] = useState<InlineMetaFeedback | null>(
    null
  );
  const [summaryFormats, setSummaryFormats] = useState<SummaryFormat[]>(readStoredSummaryFormats);
  const [summaryModelPresets, setSummaryModelPresets] = useState<SummaryModelPreset[]>(
    readStoredSummaryModelPresets
  );
  const [activeSummaryFormatId, setActiveSummaryFormatId] = useState<string>(() =>
    getDefaultSummaryFormat(readStoredSummaryFormats()).id
  );
  const [isSummaryPromptEditMode, setIsSummaryPromptEditMode] = useState(false);
  const [editingSummaryFormatId, setEditingSummaryFormatId] = useState<string | null>(null);
  const [summaryFormatNameDraft, setSummaryFormatNameDraftState] = useState("");
  const [summaryPromptDraft, setSummaryPromptDraftState] = useState("");
  const [summaryFormatModelDraft, setSummaryFormatModelDraftState] = useState("");
  const [isNewSummaryModelDraftMode, setIsNewSummaryModelDraftMode] = useState(false);
  const [summaryFormatDefaultDraft, setSummaryFormatDefaultDraft] = useState(false);

  const setSummaryFormatNameDraft = (value: string): void => {
    summaryFormatNameDraftRef.current = value;
    setSummaryFormatNameDraftState(value);
  };

  const setSummaryPromptDraft = (value: string): void => {
    summaryPromptDraftRef.current = value;
    setSummaryPromptDraftState(value);
  };

  const setSummaryFormatModelDraft = (value: string): void => {
    summaryFormatModelDraftRef.current = value;
    setSummaryFormatModelDraftState(value);
  };

  const hydrateSummaryFormatDrafts = (format: SummaryFormat): void => {
    setEditingSummaryFormatId(format.id);
    setSummaryFormatNameDraft(format.name);
    setSummaryPromptDraft(format.prompt);
    setSummaryFormatModelDraft(format.model ?? "");
    summaryFormatNameDraftRef.current = format.name;
    summaryPromptDraftRef.current = format.prompt;
    summaryFormatModelDraftRef.current = format.model ?? "";
    setIsNewSummaryModelDraftMode(false);
    setSummaryFormatDefaultDraft(format.isDefault);
  };

  const activeSummaryFormat = useMemo(
    () =>
      summaryFormats.find((item) => item.id === activeSummaryFormatId) ??
      getDefaultSummaryFormat(summaryFormats),
    [activeSummaryFormatId, summaryFormats]
  );
  const activeSummaryPrompt = activeSummaryFormat.prompt;
  const activeSummaryModel = (activeSummaryFormat.model ?? "").trim();

  const hasPublishableSummary =
    summaryText.trim().length > 0 || summaryKeyPoints.some((point) => point.trim().length > 0);
  const isSummaryBusy = transcriptViewMode === "summary" && summaryLoading;

  useEffect(() => {
    const exists = summaryFormats.some((item) => item.id === activeSummaryFormatId);
    if (!exists) {
      setActiveSummaryFormatId(getDefaultSummaryFormat(summaryFormats).id);
    }
  }, [activeSummaryFormatId, summaryFormats]);

  useEffect(() => {
    writeStoredJson(SUMMARY_FORMATS_STORAGE_KEY, summaryFormats);
  }, [summaryFormats]);

  useEffect(() => {
    writeStoredJson(SUMMARY_MODEL_PRESETS_STORAGE_KEY, summaryModelPresets);
  }, [summaryModelPresets]);

  const clearPublishFeedback = (): void => {
    setPublishSummaryFeedback(null);
  };

  const yieldForHydration = async (minimumMs = 0): Promise<void> =>
    new Promise((resolve) => {
      window.setTimeout(resolve, minimumMs);
    });

  const hydrateSummaryCacheEntry = (cached: SummaryCacheEntry): void => {
    setSummaryText(cached.summary);
    setSummaryKeyPoints(cached.keyPoints);
    setSummaryError(null);
    setSummaryModel(cached.model);
  };

  const readDirectCachedSummary = async (
    videoId: string,
    promptText: string,
    modelText: string
  ): Promise<SummaryCacheEntry | null> => {
    const promptCacheKey = `${promptText}\n__MODEL__:${modelText || ""}`;
    const promptHash = hashText(promptCacheKey);
    return readCachedSummaryEntry(videoId, promptHash);
  };

  const hydrateCachedSummary = async (
    videoId: string,
    transcriptBody: string,
    promptText: string,
    modelText: string
  ): Promise<boolean> => {
    const cached = await readCachedSummaryForTranscript(
      videoId,
      transcriptBody,
      `${promptText}\n__MODEL__:${modelText || ""}`
    );
    if (!cached) {
      return false;
    }
    hydrateSummaryCacheEntry(cached);
    return true;
  };

  const ensureTranscriptLoaded = async (
    video: VideoItem,
    requestId = transcriptRequestIdRef.current
  ): Promise<string | null> => {
    if (requestId !== transcriptRequestIdRef.current) {
      return null;
    }

    const inMemoryTranscript =
      transcriptVideo?.videoId === video.videoId ? transcriptText.trim() : "";
    if (inMemoryTranscript) {
      return inMemoryTranscript;
    }

    const cached = await readCachedTranscript(video.videoId);
    if (cached) {
      setTranscriptHydrating(true);
      await yieldForHydration(CACHE_HYDRATION_FEEDBACK_MS);
      if (requestId !== transcriptRequestIdRef.current) {
        return null;
      }
      setTranscriptText(cached);
      setTranscriptError(null);
      setTranscriptHydrating(false);
      return cached;
    }

    setTranscriptLoading(true);
    try {
      const payload = await fetchTranscriptByVideoInput({
        videoId: video.videoId,
        videoUrl: video.videoUrl
      });
      if (requestId !== transcriptRequestIdRef.current) {
        return null;
      }
      const text = payload.text.trim();
      if (!text) {
        setTranscriptError("No transcript.");
        return null;
      }
      setTranscriptText(text);
      setTranscriptError(null);
      await writeCachedTranscript(video.videoId, text);
      return text;
    } catch (error) {
      if (requestId !== transcriptRequestIdRef.current) {
        return null;
      }
      const message = error instanceof Error ? error.message : "No transcript.";
      setTranscriptError(message);
      return null;
    } finally {
      if (requestId === transcriptRequestIdRef.current) {
        setTranscriptHydrating(false);
        setTranscriptLoading(false);
      }
    }
  };

  const openTranscript = async (video: VideoItem, sourceHandleRaw?: string): Promise<void> => {
    let normalizedSourceHandle = "";
    const candidate = (sourceHandleRaw ?? "").trim();
    if (candidate) {
      try {
        normalizedSourceHandle = normalizeHandle(candidate);
      } catch {
        normalizedSourceHandle = candidate.startsWith("@") ? candidate : `@${candidate}`;
      }
    }
    setTranscriptSourceHandle(normalizedSourceHandle);
    const currentDefaultSummaryFormat = getDefaultSummaryFormat(summaryFormats);
    setActiveSummaryFormatId(currentDefaultSummaryFormat.id);
    setEditingSummaryFormatId(currentDefaultSummaryFormat.id);
    setTranscriptVideo(video);
    setTranscriptViewMode("summary");
    setIsSummaryPromptEditMode(false);
    setSummaryFormatNameDraft(currentDefaultSummaryFormat.name);
    setSummaryPromptDraft(currentDefaultSummaryFormat.prompt);
    setSummaryFormatModelDraft(currentDefaultSummaryFormat.model ?? "");
    summaryFormatNameDraftRef.current = currentDefaultSummaryFormat.name;
    summaryPromptDraftRef.current = currentDefaultSummaryFormat.prompt;
    summaryFormatModelDraftRef.current = currentDefaultSummaryFormat.model ?? "";
    setIsNewSummaryModelDraftMode(false);
    setSummaryFormatDefaultDraft(currentDefaultSummaryFormat.isDefault);
    setSummaryHydrating(false);
    setTranscriptHydrating(false);
    setTranscriptLoading(false);
    setTranscriptError(null);
    setTranscriptText("");
    setIsTranscriptCopied(false);
    setSummaryLoading(false);
    setSummaryText("");
    setSummaryKeyPoints([]);
    setSummaryError(null);
    setSummaryModel("");
    setIsPublishingSummary(false);
    setPublishSummaryFeedback(null);
    transcriptRequestIdRef.current += 1;
    const requestId = transcriptRequestIdRef.current;
    try {
      const directCachedSummary = await readDirectCachedSummary(
        video.videoId,
        currentDefaultSummaryFormat.prompt,
        (currentDefaultSummaryFormat.model ?? "").trim()
      );
      if (directCachedSummary) {
        setSummaryHydrating(true);
        await yieldForHydration(CACHE_HYDRATION_FEEDBACK_MS);
        if (requestId !== transcriptRequestIdRef.current) {
          return;
        }
        hydrateSummaryCacheEntry(directCachedSummary);
        setSummaryHydrating(false);
        return;
      }
      const text = await ensureTranscriptLoaded(video, requestId);
      if (!text) {
        return;
      }
      await hydrateCachedSummary(
        video.videoId,
        text,
        currentDefaultSummaryFormat.prompt,
        (currentDefaultSummaryFormat.model ?? "").trim()
      );
    } catch (error) {
      if (requestId !== transcriptRequestIdRef.current) {
        return;
      }
      const message = error instanceof Error ? error.message : "No transcript.";
      setTranscriptError(message);
    } finally {
      if (requestId === transcriptRequestIdRef.current) {
        setSummaryHydrating(false);
        setTranscriptHydrating(false);
        setTranscriptLoading(false);
      }
    }
  };

  const loadSummary = async (options?: {
    force?: boolean;
    promptOverride?: string;
    modelOverride?: string;
  }): Promise<void> => {
    if (!transcriptVideo || transcriptLoading || transcriptHydrating) {
      return;
    }
    if (summaryLoading) {
      return;
    }

    const promptToUse =
      typeof options?.promptOverride === "string" && options.promptOverride.trim().length > 0
        ? options.promptOverride.trim()
        : activeSummaryPrompt;
    const hasExplicitModelOverride =
      options !== undefined && Object.prototype.hasOwnProperty.call(options, "modelOverride");
    const modelToUse = hasExplicitModelOverride
      ? String(options?.modelOverride ?? "").trim()
      : activeSummaryModel;

    if (!options?.force) {
      const directCachedSummary = await readDirectCachedSummary(
        transcriptVideo.videoId,
        promptToUse,
        modelToUse
      );
      if (directCachedSummary) {
        hydrateSummaryCacheEntry(directCachedSummary);
        return;
      }
      setSummaryText("");
      setSummaryKeyPoints([]);
      setSummaryError(null);
      setSummaryModel("");
      return;
    }

    const ensuredTranscriptText =
      transcriptText.trim().length > 0
        ? transcriptText.trim()
        : await ensureTranscriptLoaded(transcriptVideo);
    if (!ensuredTranscriptText) {
      return;
    }

    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const payload = await fetchSummaryByVideoInput({
        videoId: transcriptVideo.videoId,
        videoUrl: transcriptVideo.videoUrl,
        transcriptText: ensuredTranscriptText,
        mode: "short",
        prompt: promptToUse,
        model: modelToUse || undefined
      });
      const nextSummary = payload.summary.trim();
      const nextKeyPoints = payload.keyPoints
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      if (!nextSummary && nextKeyPoints.length === 0) {
        setSummaryError("No summary.");
        return;
      }
      setSummaryText(nextSummary);
      setSummaryKeyPoints(nextKeyPoints);
      setSummaryModel(payload.model);
      await writeCachedSummaryForTranscript(
        transcriptVideo.videoId,
        ensuredTranscriptText,
        `${promptToUse}\n__MODEL__:${modelToUse || ""}`,
        {
          summary: nextSummary,
          keyPoints: nextKeyPoints,
          model: payload.model
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Summary failed.";
      setSummaryError(message);
    } finally {
      setSummaryLoading(false);
    }
  };

  const openSummaryFormatEditor = (formatId: string | null): void => {
    const format = formatId !== null ? getSummaryFormatById(summaryFormats, formatId) : null;
    if (format) {
      hydrateSummaryFormatDrafts(format);
    } else {
      setEditingSummaryFormatId(null);
      setSummaryFormatNameDraft("");
      setSummaryPromptDraft("");
      setSummaryFormatModelDraft("");
      summaryFormatNameDraftRef.current = "";
      summaryPromptDraftRef.current = "";
      summaryFormatModelDraftRef.current = "";
      setIsNewSummaryModelDraftMode(false);
      setSummaryFormatDefaultDraft(false);
    }
    setIsSummaryPromptEditMode(true);
  };

  const switchToSummaryFormat = async (formatId: string): Promise<void> => {
    const format = summaryFormats.find((item) => item.id === formatId);
    if (!format) {
      return;
    }
    setActiveSummaryFormatId(format.id);
    hydrateSummaryFormatDrafts(format);
    setIsSummaryPromptEditMode(false);
    setTranscriptViewMode("summary");
    setSummaryText("");
    setSummaryKeyPoints([]);
    setSummaryError(null);
    setSummaryModel("");
    await loadSummary({
      force: false,
      promptOverride: format.prompt,
      modelOverride: format.model
    });
  };

  const moveSummaryFormat = (formatId: string, direction: "up" | "down"): void => {
    const currentIndex = summaryFormats.findIndex((item) => item.id === formatId);
    if (currentIndex < 0) {
      return;
    }
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= summaryFormats.length) {
      return;
    }
    const nextFormats = [...summaryFormats];
    const [moved] = nextFormats.splice(currentIndex, 1);
    nextFormats.splice(targetIndex, 0, moved);
    setSummaryFormats(normalizeStoredSummaryFormats(nextFormats));
  };

  const handleTranscriptViewModeChange = async (mode: "transcript" | "summary" | string): Promise<void> => {
    clearPublishFeedback();
    if (mode === NEW_SUMMARY_FORMAT_OPTION) {
      setTranscriptViewMode("summary");
      openSummaryFormatEditor(null);
      return;
    }
    if (mode === "transcript") {
      setIsSummaryPromptEditMode(false);
      if (transcriptViewMode === "transcript") {
        return;
      }
      setTranscriptViewMode("transcript");
      if (transcriptVideo && !transcriptText.trim()) {
        await ensureTranscriptLoaded(transcriptVideo);
      }
      return;
    }
    if (mode.startsWith(SUMMARY_MODE_OPTION_PREFIX)) {
      await switchToSummaryFormat(mode.slice(SUMMARY_MODE_OPTION_PREFIX.length));
      return;
    }
    setIsSummaryPromptEditMode(false);
    setTranscriptViewMode("summary");
  };

  const regenerateSummary = async (): Promise<void> => {
    clearPublishFeedback();
    setIsSummaryPromptEditMode(false);
    setTranscriptViewMode("summary");
    await loadSummary({ force: true });
  };

  const addSummaryModelPresetIfMissing = (modelValue: string): void => {
    const trimmed = modelValue.trim();
    if (!trimmed) {
      return;
    }
    setSummaryModelPresets((previous) => {
      const exists = previous.some(
        (item) => item.value.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (exists) {
        return previous;
      }
      return [...previous, { value: trimmed, label: trimmed.toUpperCase() }];
    });
  };

  const removeSummaryModelPreset = (modelValue: string): void => {
    const trimmed = modelValue.trim();
    if (!trimmed) {
      return;
    }
    const modelKey = trimmed.toLowerCase();
    const now = Date.now();
    setSummaryModelPresets((previous) =>
      normalizeSummaryModelPresets(
        previous.filter((item) => item.value.trim().toLowerCase() !== modelKey)
      )
    );
    const nextFormats = summaryFormats.map((format) => {
      if ((format.model ?? "").trim().toLowerCase() !== modelKey) {
        return format;
      }
      return {
        ...format,
        model: "",
        updatedAt: now
      };
    });
    setSummaryFormats(normalizeStoredSummaryFormats(nextFormats));
    if (summaryFormatModelDraft.trim().toLowerCase() === modelKey) {
      setSummaryFormatModelDraft("");
      summaryFormatModelDraftRef.current = "";
    }
  };

  const saveSummaryPromptAndClose = async (): Promise<void> => {
    clearPublishFeedback();
    const nextName = (
      typeof summaryFormatNameDraftRef.current === "string"
        ? summaryFormatNameDraftRef.current
        : summaryFormatNameDraft
    )
      .trim()
      .slice(0, 20);
    const nextPrompt = (
      typeof summaryPromptDraftRef.current === "string"
        ? summaryPromptDraftRef.current
        : summaryPromptDraft
    ).trim() || DEFAULT_SUMMARY_PROMPT;
    const nextModel = (
      typeof summaryFormatModelDraftRef.current === "string"
        ? summaryFormatModelDraftRef.current
        : summaryFormatModelDraft
    ).trim();
    addSummaryModelPresetIfMissing(nextModel);
    const nextDefault = summaryFormatDefaultDraft;
    if (!nextName) {
      return;
    }

    if (
      summaryFormats.some(
        (format) =>
          format.id !== editingSummaryFormatId &&
          format.name.trim().toLowerCase() === nextName.toLowerCase()
      )
    ) {
      return;
    }

    if (editingSummaryFormatId === null) {
      const now = Date.now();
      const newFormat: SummaryFormat = {
        id: `summary-format-${now}`,
        name: nextName,
        prompt: nextPrompt,
        model: nextModel,
        isDefault: nextDefault,
        createdAt: now,
        updatedAt: now
      };
      const nextFormats = [...summaryFormats, newFormat].map((format) => ({
        ...format,
        isDefault: nextDefault ? format.id === newFormat.id : format.isDefault
      }));
      const normalizedFormats = normalizeStoredSummaryFormats(nextFormats);
      const savedFormat = getSummaryFormatById(normalizedFormats, newFormat.id, newFormat);
      setSummaryFormats(normalizedFormats);
      setActiveSummaryFormatId(savedFormat.id);
      hydrateSummaryFormatDrafts(savedFormat);
      setIsSummaryPromptEditMode(false);
      setTranscriptViewMode("summary");
      setSummaryText("");
      setSummaryKeyPoints([]);
      setSummaryError(null);
      setSummaryModel("");
      await loadSummary({
        force: true,
        promptOverride: nextPrompt,
        modelOverride: nextModel
      });
      return;
    }

    const baseFormat =
      summaryFormats.find((format) => format.id === editingSummaryFormatId) ?? activeSummaryFormat;
    const hasNoChanges =
      baseFormat.name === nextName &&
      baseFormat.prompt === nextPrompt &&
      (baseFormat.model ?? "") === nextModel &&
      baseFormat.isDefault === nextDefault;
    if (hasNoChanges) {
      setSummaryFormatNameDraft(baseFormat.name);
      setSummaryPromptDraft(baseFormat.prompt);
      setSummaryFormatModelDraft(baseFormat.model ?? "");
      summaryFormatNameDraftRef.current = baseFormat.name;
      summaryPromptDraftRef.current = baseFormat.prompt;
      summaryFormatModelDraftRef.current = baseFormat.model ?? "";
      setIsNewSummaryModelDraftMode(false);
      setSummaryFormatDefaultDraft(baseFormat.isDefault);
      setEditingSummaryFormatId(baseFormat.id);
      setIsSummaryPromptEditMode(false);
      return;
    }

    const now = Date.now();
    const nextFormats = summaryFormats.map((format) => {
      if (format.id === baseFormat.id) {
        return {
          ...format,
          name: nextName,
          prompt: nextPrompt,
          model: nextModel,
          isDefault: nextDefault,
          updatedAt: now
        };
      }
      return {
        ...format,
        isDefault: nextDefault ? false : format.isDefault
      };
    });
    const normalizedFormats = normalizeStoredSummaryFormats(nextFormats);
    const savedFormat = getSummaryFormatById(normalizedFormats, baseFormat.id, {
      ...baseFormat,
      name: nextName,
      prompt: nextPrompt,
      model: nextModel,
      isDefault: nextDefault,
      updatedAt: now
    });
    setSummaryFormats(normalizedFormats);
    setActiveSummaryFormatId(savedFormat.id);
    hydrateSummaryFormatDrafts(savedFormat);
    setIsSummaryPromptEditMode(false);
    setTranscriptViewMode("summary");
    setSummaryText("");
    setSummaryKeyPoints([]);
    setSummaryError(null);
    setSummaryModel("");
    await loadSummary({
      force: true,
      promptOverride: nextPrompt,
      modelOverride: nextModel
    });
  };

  const deleteSummaryFormatAndClose = (): void => {
    if (!editingSummaryFormatId || summaryFormats.length <= 1) {
      return;
    }
    const nextFormats = summaryFormats.filter((format) => format.id !== editingSummaryFormatId);
    if (nextFormats.length === 0) {
      return;
    }
    const hadDefault =
      summaryFormats.find((format) => format.id === editingSummaryFormatId)?.isDefault === true;
    if (hadDefault || !nextFormats.some((format) => format.isDefault)) {
      nextFormats.forEach((format, index) => {
        format.isDefault = index === 0;
      });
    }
    const normalizedFormats = normalizeStoredSummaryFormats(nextFormats);
    setSummaryFormats(normalizedFormats);
    const fallbackDefaultFormat = getDefaultSummaryFormat(normalizedFormats);
    setActiveSummaryFormatId(fallbackDefaultFormat.id);
    hydrateSummaryFormatDrafts(fallbackDefaultFormat);
    setIsSummaryPromptEditMode(false);
    setTranscriptViewMode("summary");
    setSummaryText("");
    setSummaryKeyPoints([]);
    setSummaryError(null);
    setSummaryModel("");
  };

  const buildSummaryTextForPublish = (): string => {
    const summary = summaryText.trim();
    const points = summaryKeyPoints
      .map((point) => point.trim())
      .filter((point) => point.length > 0);
    const pointsBlock =
      points.length > 0 ? `\n\n${points.map((point) => `- ${point}`).join("\n")}` : "";
    return `${summary}${pointsBlock}`.trim();
  };

  const publishCurrentVideoSummary = async (): Promise<void> => {
    if (!transcriptVideo) {
      return;
    }
    const summaryForPublish = buildSummaryTextForPublish();
    if (!summaryForPublish || isPublishingSummary) {
      return;
    }

    setPublishSummaryFeedback(null);
    setIsPublishingSummary(true);
    try {
      const { publishVideoSummary } = await import("../api/publisherPublish");
      await publishVideoSummary({
        videoId: transcriptVideo.videoId,
        videoUrl: transcriptVideo.videoUrl,
        title: transcriptVideo.title,
        summary: summaryForPublish,
        thumbnailUrl: transcriptVideo.thumbnailUrl,
        channelTitle: transcriptSourceHandle || transcriptVideo.channelTitle,
        publishedAt: transcriptVideo.publishedAt,
        durationSeconds: transcriptVideo.durationSeconds ?? null,
        viewCount: transcriptVideo.viewCount ?? null
      });
      setPublishSummaryFeedback({
        kind: "success",
        text: "PUBLISHED"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Publish failed.";
      setPublishSummaryFeedback({
        kind: "error",
        text: normalizePublishStatusText(message)
      });
    } finally {
      setIsPublishingSummary(false);
    }
  };

  const getVisibleTranscriptPanelText = (): string => {
    if (transcriptViewMode === "summary") {
      const summary = summaryText.trim();
      const points = summaryKeyPoints
        .map((point) => point.trim())
        .filter((point) => point.length > 0);
      const pointsBlock =
        points.length > 0 ? `\n\n${points.map((point) => `- ${point}`).join("\n")}` : "";
      return `${summary}${pointsBlock}`.trim();
    }
    return transcriptText.trim();
  };

  const copyTranscriptText = async (): Promise<void> => {
    clearPublishFeedback();
    const text = getVisibleTranscriptPanelText();
    if (!text) {
      return;
    }
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("Clipboard API unavailable.");
      }
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "true");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setIsTranscriptCopied(true);
    if (transcriptCopyFeedbackTimeoutRef.current) {
      window.clearTimeout(transcriptCopyFeedbackTimeoutRef.current);
    }
    transcriptCopyFeedbackTimeoutRef.current = window.setTimeout(() => {
      setIsTranscriptCopied(false);
      transcriptCopyFeedbackTimeoutRef.current = null;
    }, 1000);
  };

  const closeTranscriptModal = (): void => {
    const nextActiveSummaryFormat = getSummaryFormatById(summaryFormats, activeSummaryFormatId, activeSummaryFormat);
    transcriptRequestIdRef.current += 1;
    setTranscriptVideo(null);
    setSummaryHydrating(false);
    setTranscriptHydrating(false);
    setTranscriptLoading(false);
    setTranscriptText("");
    setTranscriptError(null);
    setTranscriptViewMode("transcript");
    setIsTranscriptCopied(false);
    setSummaryLoading(false);
    setSummaryText("");
    setSummaryKeyPoints([]);
    setSummaryError(null);
    setSummaryModel("");
    setIsPublishingSummary(false);
    setPublishSummaryFeedback(null);
    setIsSummaryPromptEditMode(false);
    hydrateSummaryFormatDrafts(nextActiveSummaryFormat);
  };

  const cancelSummaryFormatEditing = (): void => {
    const formatToRestore = getSummaryFormatById(
      summaryFormats,
      editingSummaryFormatId ?? activeSummaryFormatId,
      activeSummaryFormat
    );
    hydrateSummaryFormatDrafts(formatToRestore);
    setIsSummaryPromptEditMode(false);
  };

  return {
    transcriptVideo,
    summaryHydrating,
    transcriptHydrating,
    transcriptLoading,
    transcriptText,
    transcriptError,
    transcriptViewMode,
    isTranscriptCopied,
    summaryLoading,
    summaryText,
    summaryKeyPoints,
    summaryError,
    summaryModel,
    isPublishingSummary,
    publishSummaryFeedback,
    summaryFormats,
    summaryModelPresets,
    activeSummaryFormat,
    activeSummaryFormatId,
    isSummaryPromptEditMode,
    editingSummaryFormatId,
    summaryFormatNameDraft,
    summaryPromptDraft,
    summaryFormatModelDraft,
    isNewSummaryModelDraftMode,
    summaryFormatDefaultDraft,
    hasPublishableSummary,
    isSummaryBusy,
    setSummaryFormatNameDraft,
    setSummaryPromptDraft,
    setSummaryFormatModelDraft,
    setSummaryFormats,
    setIsNewSummaryModelDraftMode,
    setSummaryFormatDefaultDraft,
    setActiveSummaryFormatId,
    setEditingSummaryFormatId,
    setIsSummaryPromptEditMode,
    clearPublishFeedback,
    openTranscript,
    closeTranscriptModal,
    handleTranscriptViewModeChange,
    copyTranscriptText,
    regenerateSummary,
    publishCurrentVideoSummary,
    openSummaryFormatEditor,
    moveSummaryFormat,
    removeSummaryModelPreset,
    cancelSummaryFormatEditing,
    saveSummaryPromptAndClose,
    deleteSummaryFormatAndClose
  };
}
