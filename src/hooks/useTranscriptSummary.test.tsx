import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALL_STORED_SUMMARIES_OPTION_ID,
  DEFAULT_SUMMARY_PROMPT,
  STORED_SUMMARY_OPTION_PREFIX,
  useTranscriptSummary,
  writeCachedSummaryForTranscript
} from "./useTranscriptSummary";
import { resetCacheDbForTests } from "../storage/indexedDbCache";
import { writeCachedTranscript } from "../storage/transcriptsStorage";
import type { VideoItem } from "../types/youtube";
import {
  fetchSummaryByVideoInput,
  fetchTranscriptByVideoInput
} from "../api/youtube";

vi.mock("../api/youtube", () => ({
  fetchSummaryByVideoInput: vi.fn(),
  fetchTranscriptByVideoInput: vi.fn()
}));

const fetchSummaryMock = vi.mocked(fetchSummaryByVideoInput);
const fetchTranscriptMock = vi.mocked(fetchTranscriptByVideoInput);

const video: VideoItem = {
  videoId: "video-1",
  title: "Cached Video",
  publishedAt: "2026-04-10T10:00:00Z",
  thumbnailUrl: "https://img.test/video-1.jpg",
  channelTitle: "Example Channel",
  videoUrl: "https://www.youtube.com/watch?v=video-1",
  viewCount: 100
};

const defaultPromptCacheKey = `${DEFAULT_SUMMARY_PROMPT}\n__MODEL__:`;

describe("useTranscriptSummary", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    vi.clearAllMocks();
    await resetCacheDbForTests();
  });

  it("opens from direct cached summary under loading state without transcript fetch", async () => {
    await writeCachedTranscript(video.videoId, "Cached transcript body");
    await writeCachedSummaryForTranscript(video.videoId, "Cached transcript body", defaultPromptCacheKey, {
      summary: "Cached summary body",
      keyPoints: [],
      model: "openai/gpt-4o-mini"
    });

    const { result } = renderHook(() => useTranscriptSummary());

    act(() => {
      void result.current.openTranscript(video);
    });

    await waitFor(() => {
      expect(result.current.summaryHydrating).toBe(true);
    });
    expect(result.current.transcriptLoading).toBe(false);
    expect(fetchTranscriptMock).not.toHaveBeenCalled();

    await act(async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 130));
    });

    expect(result.current.summaryHydrating).toBe(false);
    expect(result.current.transcriptHydrating).toBe(false);
    expect(result.current.transcriptText).toBe("");
    expect(result.current.summaryText).toBe("Cached summary body");
    expect(result.current.summaryKeyPoints).toEqual([]);
    expect(fetchSummaryMock).not.toHaveBeenCalled();
  });

  it("opens from direct cached summary without transcript fetch, then lazily fetches transcript on transcript view", async () => {
    await writeCachedSummaryForTranscript(video.videoId, "Fetched transcript body", defaultPromptCacheKey, {
      summary: "Fetched summary body",
      keyPoints: [],
      model: "openai/gpt-4o-mini"
    });
    let resolveTranscript: ((value: { videoId: string; text: string }) => void) | null = null;
    fetchTranscriptMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTranscript = resolve;
        })
    );

    const { result } = renderHook(() => useTranscriptSummary());

    act(() => {
      void result.current.openTranscript(video);
    });

    await waitFor(() => {
      expect(result.current.summaryHydrating).toBe(true);
    });
    expect(result.current.transcriptHydrating).toBe(false);
    expect(result.current.transcriptLoading).toBe(false);
    expect(fetchTranscriptMock).not.toHaveBeenCalled();

    await act(async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 130));
    });

    expect(result.current.summaryText).toBe("Fetched summary body");
    expect(result.current.transcriptText).toBe("");

    act(() => {
      void result.current.handleTranscriptViewModeChange("transcript");
    });

    await waitFor(() => {
      expect(result.current.transcriptLoading).toBe(true);
    });
    expect(fetchTranscriptMock).toHaveBeenCalledWith({
      videoId: video.videoId,
      videoUrl: video.videoUrl
    });

    await act(async () => {
      resolveTranscript?.({
        videoId: video.videoId,
        text: "Fetched transcript body"
      });
    });

    expect(result.current.transcriptLoading).toBe(false);
    expect(result.current.transcriptViewMode).toBe("transcript");
    expect(result.current.transcriptText).toBe("Fetched transcript body");
    expect(result.current.summaryText).toBe("Fetched summary body");
    expect(fetchSummaryMock).not.toHaveBeenCalled();
  });

  it("regenerates from direct cached summary by fetching transcript first, then summary", async () => {
    await writeCachedSummaryForTranscript(video.videoId, "Fetched transcript body", defaultPromptCacheKey, {
      summary: "Fetched summary body",
      keyPoints: [],
      model: "openai/gpt-4o-mini"
    });
    let resolveTranscript: ((value: { videoId: string; text: string }) => void) | null = null;
    let resolveSummary:
      | ((value: { summary: string; keyPoints: string[]; model: string }) => void)
      | null = null;
    fetchTranscriptMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTranscript = resolve;
        })
    );
    fetchSummaryMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSummary = resolve;
        })
    );

    const { result } = renderHook(() => useTranscriptSummary());

    act(() => {
      void result.current.openTranscript(video);
    });

    await act(async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 130));
    });

    expect(result.current.summaryText).toBe("Fetched summary body");
    expect(result.current.transcriptText).toBe("");

    act(() => {
      void result.current.regenerateSummary();
    });

    await waitFor(() => {
      expect(fetchTranscriptMock).toHaveBeenCalledWith({
        videoId: video.videoId,
        videoUrl: video.videoUrl
      });
      expect(result.current.transcriptLoading).toBe(true);
    });

    await act(async () => {
      resolveTranscript?.({
        videoId: video.videoId,
        text: "Fetched transcript body"
      });
    });

    await waitFor(() => {
      expect(fetchSummaryMock).toHaveBeenCalledWith({
        videoId: video.videoId,
        videoUrl: video.videoUrl,
        transcriptText: "Fetched transcript body",
        mode: "short",
        prompt: DEFAULT_SUMMARY_PROMPT,
        model: undefined
      });
      expect(result.current.summaryLoading).toBe(true);
    });

    await act(async () => {
      resolveSummary?.({
        summary: "Regenerated summary body\n\n- Model formatted point",
        keyPoints: [],
        model: "openai/gpt-4o-mini"
      });
    });

    expect(result.current.summaryLoading).toBe(false);
    expect(result.current.summaryText).toBe("Regenerated summary body\n\n- Model formatted point");
    expect(result.current.summaryKeyPoints).toEqual([]);
    expect(result.current.transcriptText).toBe("Fetched transcript body");
  });

  it("calls cache update callback after a generated summary is cached", async () => {
    const onSummaryCacheUpdated = vi.fn();
    await writeCachedTranscript(video.videoId, "Cached transcript body");
    fetchSummaryMock.mockResolvedValue({
      videoId: video.videoId,
      summary: "Fresh generated summary",
      keyPoints: [],
      model: "openai/gpt-5.4-nano"
    });

    const { result } = renderHook(() => useTranscriptSummary({ onSummaryCacheUpdated }));

    act(() => {
      void result.current.openTranscript(video);
    });

    await waitFor(() => {
      expect(result.current.transcriptText).toBe("Cached transcript body");
    });

    await act(async () => {
      await result.current.regenerateSummary();
    });

    expect(result.current.summaryText).toBe("Fresh generated summary");
    await waitFor(() => {
      expect(onSummaryCacheUpdated).toHaveBeenCalledTimes(1);
    });
    expect(onSummaryCacheUpdated).toHaveBeenCalledWith(video.videoId);
  });

  it("does not call cache update callback when generated summary is empty", async () => {
    const onSummaryCacheUpdated = vi.fn();
    await writeCachedTranscript(video.videoId, "Cached transcript body");
    fetchSummaryMock.mockResolvedValue({
      videoId: video.videoId,
      summary: "   ",
      keyPoints: [],
      model: "openai/gpt-5.4-nano"
    });

    const { result } = renderHook(() => useTranscriptSummary({ onSummaryCacheUpdated }));

    act(() => {
      void result.current.openTranscript(video);
    });

    await waitFor(() => {
      expect(result.current.transcriptText).toBe("Cached transcript body");
    });

    await act(async () => {
      await result.current.regenerateSummary();
    });

    expect(result.current.summaryError).toBe("No summary.");
    expect(onSummaryCacheUpdated).not.toHaveBeenCalled();
  });

  it("hydrates cached transcript without summary generation when no cached summary matches", async () => {
    await writeCachedTranscript(video.videoId, "Cached transcript body");

    const { result } = renderHook(() => useTranscriptSummary());

    act(() => {
      void result.current.openTranscript(video);
    });

    await waitFor(() => {
      expect(result.current.transcriptHydrating).toBe(true);
    });
    expect(result.current.transcriptLoading).toBe(false);

    await act(async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 130));
    });

    expect(fetchTranscriptMock).not.toHaveBeenCalled();
    expect(result.current.transcriptLoading).toBe(false);

    await waitFor(() => {
      expect(result.current.transcriptText).toBe("Cached transcript body");
    });

    expect(fetchSummaryMock).not.toHaveBeenCalled();
    expect(result.current.summaryLoading).toBe(false);
    expect(result.current.summaryText).toBe("");
    expect(result.current.summaryKeyPoints).toEqual([]);
  });

  it("shows transcript fetch state when neither summary nor transcript is cached", async () => {
    let resolveTranscript: ((value: { videoId: string; text: string }) => void) | null = null;
    fetchTranscriptMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTranscript = resolve;
        })
    );

    const { result } = renderHook(() => useTranscriptSummary());

    act(() => {
      void result.current.openTranscript(video);
    });

    expect(result.current.summaryHydrating).toBe(false);
    expect(result.current.transcriptHydrating).toBe(false);
    await waitFor(() => {
      expect(result.current.transcriptLoading).toBe(true);
    });
    expect(fetchTranscriptMock).toHaveBeenCalledWith({
      videoId: video.videoId,
      videoUrl: video.videoUrl
    });

    await act(async () => {
      resolveTranscript?.({
        videoId: video.videoId,
        text: "Fresh transcript body"
      });
    });

    expect(result.current.transcriptLoading).toBe(false);
    expect(result.current.transcriptText).toBe("Fresh transcript body");
    expect(fetchSummaryMock).not.toHaveBeenCalled();
    expect(result.current.summaryText).toBe("");
    expect(result.current.summaryKeyPoints).toEqual([]);
  });

  it("switches summary formats without generating when the target format is uncached", async () => {
    const { result } = renderHook(() => useTranscriptSummary());

    act(() => {
      result.current.setSummaryFormats([
        {
          id: "summary-default",
          name: "SUMMARY",
          prompt: DEFAULT_SUMMARY_PROMPT,
          model: "",
          isDefault: true,
          createdAt: 1,
          updatedAt: 1
        },
        {
          id: "summary-alt",
          name: "ALT",
          prompt: "Alternate prompt",
          model: "",
          isDefault: false,
          createdAt: 2,
          updatedAt: 2
        }
      ]);
    });

    await writeCachedTranscript(video.videoId, "Cached transcript body");
    await writeCachedSummaryForTranscript(video.videoId, "Cached transcript body", defaultPromptCacheKey, {
      summary: "Cached summary body",
      keyPoints: [],
      model: "openai/gpt-4o-mini"
    });

    act(() => {
      void result.current.openTranscript(video);
    });

    await act(async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 130));
    });

    expect(result.current.summaryText).toBe("Cached summary body");

    await act(async () => {
      await result.current.handleTranscriptViewModeChange("summary:summary-alt");
    });

    await waitFor(() => {
      expect(result.current.transcriptViewMode).toBe("summary");
      expect(result.current.activeSummaryFormat.id).toBe("summary-alt");
      expect(result.current.summaryText).toBe("");
      expect(result.current.summaryKeyPoints).toEqual([]);
    });
    expect(fetchSummaryMock).not.toHaveBeenCalled();
  });

  it("loads stored summary options and selects one without generating", async () => {
    const { result } = renderHook(() => useTranscriptSummary());

    act(() => {
      result.current.setSummaryFormats([
        {
          id: "summary-default",
          name: "SUMMARY",
          prompt: DEFAULT_SUMMARY_PROMPT,
          model: "",
          isDefault: true,
          createdAt: 1,
          updatedAt: 1
        },
        {
          id: "summary-alt",
          name: "ALT",
          prompt: "Alternate prompt",
          model: "google/gemini-2.5-flash",
          isDefault: false,
          createdAt: 2,
          updatedAt: 2
        }
      ]);
    });

    await writeCachedTranscript(video.videoId, "Cached transcript body");
    await writeCachedSummaryForTranscript(video.videoId, "Cached transcript body", defaultPromptCacheKey, {
      summary: "Cached default summary",
      keyPoints: [],
      model: "openai/gpt-4o-mini"
    });
    await writeCachedSummaryForTranscript(
      video.videoId,
      "Cached transcript body",
      "Alternate prompt\n__MODEL__:google/gemini-2.5-flash",
      {
        summary: "Cached alt summary",
        keyPoints: ["Alt point"],
        model: "google/gemini-2.5-flash"
      }
    );

    act(() => {
      void result.current.openTranscript(video);
    });

    const todayLabel = new Date().toISOString().slice(0, 10);
    await waitFor(() => {
      expect(result.current.storedSummaryOptions.map((option) => option.label)).toEqual([
        `SUMMARY - GPT-4O-MINI - ${todayLabel}`,
        `ALT - GEMINI-2.5-FLASH - ${todayLabel}`
      ]);
    });

    const altOption = result.current.storedSummaryOptions.find(
      (option) => option.summaryFormatId === "summary-alt"
    );
    expect(altOption).toBeDefined();

    await act(async () => {
      await result.current.handleTranscriptViewModeChange(
        `${STORED_SUMMARY_OPTION_PREFIX}${altOption?.id ?? ""}`
      );
    });

    expect(result.current.activeStoredSummaryOptionId).toBe(altOption?.id);
    expect(result.current.activeSummaryFormat.id).toBe("summary-alt");
    expect(result.current.summaryText).toBe("Cached alt summary");
    expect(result.current.summaryKeyPoints).toEqual(["Alt point"]);
    expect(fetchSummaryMock).not.toHaveBeenCalled();
  });

  it("shows all stored summary outputs together", async () => {
    const { result } = renderHook(() => useTranscriptSummary());

    act(() => {
      result.current.setSummaryFormats([
        {
          id: "summary-default",
          name: "SUMMARY",
          prompt: DEFAULT_SUMMARY_PROMPT,
          model: "",
          isDefault: true,
          createdAt: 1,
          updatedAt: 1
        },
        {
          id: "summary-alt",
          name: "ALT",
          prompt: "Alternate prompt",
          model: "",
          isDefault: false,
          createdAt: 2,
          updatedAt: 2
        }
      ]);
    });

    await writeCachedTranscript(video.videoId, "Cached transcript body");
    await writeCachedSummaryForTranscript(video.videoId, "Cached transcript body", defaultPromptCacheKey, {
      summary: "Default stored output",
      keyPoints: [],
      model: "openai/gpt-4o-mini"
    });
    await writeCachedSummaryForTranscript(
      video.videoId,
      "Cached transcript body",
      "Alternate prompt\n__MODEL__:",
      {
        summary: "Alternate stored output",
        keyPoints: [],
        model: "google/gemini-2.5-flash"
      }
    );

    act(() => {
      void result.current.openTranscript(video);
    });

    await waitFor(() => {
      expect(result.current.storedSummaryOptions).toHaveLength(2);
    });

    await act(async () => {
      await result.current.handleTranscriptViewModeChange(
        `${STORED_SUMMARY_OPTION_PREFIX}${ALL_STORED_SUMMARIES_OPTION_ID}`
      );
    });

    expect(result.current.activeStoredSummaryOptionId).toBe(ALL_STORED_SUMMARIES_OPTION_ID);
    expect(result.current.summaryText).toContain("## SUMMARY - GPT-4O-MINI");
    expect(result.current.summaryText).toContain("Default stored output");
    expect(result.current.summaryText).toContain("## ALT - GEMINI-2.5-FLASH");
    expect(result.current.summaryText).toContain("Alternate stored output");
    expect(result.current.summaryText).toContain("---");
    expect(result.current.summaryModel).toBe("");
    expect(fetchSummaryMock).not.toHaveBeenCalled();
  });

  it("keeps a cleared default summary format model blank after save and reopen", async () => {
    const { result } = renderHook(() => useTranscriptSummary());

    act(() => {
      result.current.setSummaryFormats([
        {
          id: "summary-default",
          name: "SUMMARY",
          prompt: DEFAULT_SUMMARY_PROMPT,
          model: "openai/gpt-4o-mini",
          isDefault: true,
          createdAt: 1,
          updatedAt: 1
        }
      ]);
    });

    await waitFor(() => {
      expect(result.current.summaryFormats[0]?.model).toBe("openai/gpt-4o-mini");
    });

    act(() => {
      result.current.setActiveSummaryFormatId("summary-default");
      result.current.openSummaryFormatEditor("summary-default");
    });

    expect(result.current.summaryFormatModelDraft).toBe("openai/gpt-4o-mini");

    act(() => {
      result.current.setSummaryFormatModelDraft("");
    });

    await act(async () => {
      await result.current.saveSummaryPromptAndClose();
    });

    expect(result.current.summaryFormats[0]?.model).toBe("");

    act(() => {
      result.current.closeTranscriptModal();
      result.current.openSummaryFormatEditor("summary-default");
    });

    expect(result.current.summaryFormatModelDraft).toBe("");
  });

  it("keeps a cleared custom summary format model blank after save and reopen", async () => {
    const { result } = renderHook(() => useTranscriptSummary());

    act(() => {
      result.current.setSummaryFormats([
        {
          id: "summary-default",
          name: "SUMMARY",
          prompt: DEFAULT_SUMMARY_PROMPT,
          model: "",
          isDefault: true,
          createdAt: 1,
          updatedAt: 1
        },
        {
          id: "summary-custom",
          name: "CUSTOM",
          prompt: "Custom prompt",
          model: "google/gemini-2.5-flash",
          isDefault: false,
          createdAt: 2,
          updatedAt: 2
        }
      ]);
    });

    await waitFor(() => {
      expect(result.current.summaryFormats.find((format) => format.id === "summary-custom")?.model).toBe(
        "google/gemini-2.5-flash"
      );
    });

    act(() => {
      result.current.setActiveSummaryFormatId("summary-custom");
      result.current.openSummaryFormatEditor("summary-custom");
    });

    expect(result.current.summaryFormatModelDraft).toBe("google/gemini-2.5-flash");

    act(() => {
      result.current.setSummaryFormatModelDraft("");
    });

    await act(async () => {
      await result.current.saveSummaryPromptAndClose();
    });

    expect(result.current.summaryFormats.find((format) => format.id === "summary-custom")?.model).toBe("");

    act(() => {
      result.current.closeTranscriptModal();
      result.current.setActiveSummaryFormatId("summary-custom");
      result.current.openSummaryFormatEditor("summary-custom");
    });

    expect(result.current.summaryFormatModelDraft).toBe("");
  });

  it("removes a built-in preset globally, resets affected formats, and keeps it deleted after reload", async () => {
    const { result, unmount } = renderHook(() => useTranscriptSummary());

    act(() => {
      result.current.setSummaryFormats([
        {
          id: "summary-default",
          name: "SUMMARY",
          prompt: DEFAULT_SUMMARY_PROMPT,
          model: "openai/gpt-4o-mini",
          isDefault: true,
          createdAt: 1,
          updatedAt: 1
        },
        {
          id: "summary-custom",
          name: "CUSTOM",
          prompt: "Custom prompt",
          model: "openai/gpt-4o-mini",
          isDefault: false,
          createdAt: 2,
          updatedAt: 2
        }
      ]);
      result.current.setActiveSummaryFormatId("summary-default");
      result.current.openSummaryFormatEditor("summary-default");
    });

    await waitFor(() => {
      expect(
        result.current.summaryModelPresets.some((preset) => preset.value === "openai/gpt-4o-mini")
      ).toBe(true);
    });

    act(() => {
      result.current.removeSummaryModelPreset("openai/gpt-4o-mini");
    });

    await waitFor(() => {
      expect(
        result.current.summaryModelPresets.some((preset) => preset.value === "openai/gpt-4o-mini")
      ).toBe(false);
      expect(result.current.summaryFormats.every((format) => format.model === "")).toBe(true);
      expect(result.current.summaryFormatModelDraft).toBe("");
    });

    unmount();

    const reloaded = renderHook(() => useTranscriptSummary());

    expect(
      reloaded.result.current.summaryModelPresets.some((preset) => preset.value === "openai/gpt-4o-mini")
    ).toBe(false);
    expect(reloaded.result.current.summaryModelPresets.some((preset) => preset.value === "")).toBe(true);
  });

  it("removes a custom preset globally and keeps unrelated formats unchanged after reload", async () => {
    const { result, unmount } = renderHook(() => useTranscriptSummary());

    act(() => {
      result.current.setSummaryFormats([
        {
          id: "summary-default",
          name: "SUMMARY",
          prompt: DEFAULT_SUMMARY_PROMPT,
          model: "",
          isDefault: true,
          createdAt: 1,
          updatedAt: 1
        },
        {
          id: "summary-custom",
          name: "CUSTOM",
          prompt: "Custom prompt",
          model: "custom/model-one",
          isDefault: false,
          createdAt: 2,
          updatedAt: 2
        },
        {
          id: "summary-other",
          name: "OTHER",
          prompt: "Other prompt",
          model: "google/gemini-2.5-flash",
          isDefault: false,
          createdAt: 3,
          updatedAt: 3
        }
      ]);
    });

    await waitFor(() => {
      expect(result.current.summaryFormats.find((format) => format.id === "summary-custom")?.model).toBe(
        "custom/model-one"
      );
    });

    act(() => {
      result.current.setActiveSummaryFormatId("summary-custom");
      result.current.openSummaryFormatEditor("summary-custom");
    });

    await act(async () => {
      await result.current.saveSummaryPromptAndClose();
    });

    await waitFor(() => {
      expect(
        result.current.summaryModelPresets.some((preset) => preset.value === "custom/model-one")
      ).toBe(true);
    });

    act(() => {
      result.current.removeSummaryModelPreset("custom/model-one");
    });

    await waitFor(() => {
      expect(
        result.current.summaryModelPresets.some((preset) => preset.value === "custom/model-one")
      ).toBe(false);
      expect(result.current.summaryFormats.find((format) => format.id === "summary-custom")?.model).toBe("");
      expect(result.current.summaryFormats.find((format) => format.id === "summary-other")?.model).toBe(
        "google/gemini-2.5-flash"
      );
      expect(result.current.summaryFormatModelDraft).toBe("");
    });

    unmount();

    const reloaded = renderHook(() => useTranscriptSummary());

    expect(
      reloaded.result.current.summaryModelPresets.some((preset) => preset.value === "custom/model-one")
    ).toBe(false);
    expect(reloaded.result.current.summaryFormats.find((format) => format.id === "summary-custom")?.model).toBe(
      ""
    );
  });
});
