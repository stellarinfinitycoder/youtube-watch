import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SUMMARY_PROMPT,
  useTranscriptSummary,
  writeCachedSummaryForTranscript
} from "./useTranscriptSummary";
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
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("opens from direct cached summary under loading state without transcript fetch", async () => {
    writeCachedTranscript(video.videoId, "Cached transcript body");
    writeCachedSummaryForTranscript(video.videoId, "Cached transcript body", defaultPromptCacheKey, {
      summary: "Cached summary body",
      keyPoints: ["Cached point"],
      model: "openai/gpt-4o-mini"
    });

    const { result } = renderHook(() => useTranscriptSummary());

    act(() => {
      void result.current.openTranscript(video);
    });

    expect(result.current.summaryHydrating).toBe(true);
    expect(result.current.transcriptLoading).toBe(false);
    expect(fetchTranscriptMock).not.toHaveBeenCalled();

    await act(async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 130));
    });

    expect(result.current.summaryHydrating).toBe(false);
    expect(result.current.transcriptHydrating).toBe(false);
    expect(result.current.transcriptText).toBe("");
    expect(result.current.summaryText).toBe("Cached summary body");
    expect(result.current.summaryKeyPoints).toEqual(["Cached point"]);
    expect(fetchSummaryMock).not.toHaveBeenCalled();
  });

  it("opens from direct cached summary without transcript fetch, then lazily fetches transcript on transcript view", async () => {
    writeCachedSummaryForTranscript(video.videoId, "Fetched transcript body", defaultPromptCacheKey, {
      summary: "Fetched summary body",
      keyPoints: ["Fetched point"],
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

    expect(result.current.summaryHydrating).toBe(true);
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

    expect(result.current.transcriptLoading).toBe(true);
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
    writeCachedSummaryForTranscript(video.videoId, "Fetched transcript body", defaultPromptCacheKey, {
      summary: "Fetched summary body",
      keyPoints: ["Fetched point"],
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
        summary: "Regenerated summary body",
        keyPoints: ["Regenerated point"],
        model: "openai/gpt-4o-mini"
      });
    });

    expect(result.current.summaryLoading).toBe(false);
    expect(result.current.summaryText).toBe("Regenerated summary body");
    expect(result.current.summaryKeyPoints).toEqual(["Regenerated point"]);
    expect(result.current.transcriptText).toBe("Fetched transcript body");
  });

  it("hydrates cached transcript without transcript fetch and only summarizes when no cached summary matches", async () => {
    writeCachedTranscript(video.videoId, "Cached transcript body");
    let resolveSummary:
      | ((value: { summary: string; keyPoints: string[]; model: string }) => void)
      | null = null;
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

    expect(result.current.transcriptHydrating).toBe(true);
    expect(result.current.transcriptLoading).toBe(false);

    await act(async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 130));
    });

    expect(fetchTranscriptMock).not.toHaveBeenCalled();
    expect(result.current.transcriptLoading).toBe(false);

    await waitFor(() => {
      expect(result.current.transcriptText).toBe("Cached transcript body");
    });

    await waitFor(() => {
      expect(fetchSummaryMock).toHaveBeenCalledWith({
        videoId: video.videoId,
        videoUrl: video.videoUrl,
        transcriptText: "Cached transcript body",
        mode: "short",
        prompt: DEFAULT_SUMMARY_PROMPT,
        model: undefined
      });
      expect(result.current.summaryLoading).toBe(true);
    });

    await act(async () => {
      resolveSummary?.({
        summary: "Generated summary body",
        keyPoints: ["Generated point"],
        model: "openai/gpt-4o-mini"
      });
    });

    expect(result.current.summaryLoading).toBe(false);
    expect(result.current.summaryText).toBe("Generated summary body");
    expect(result.current.summaryKeyPoints).toEqual(["Generated point"]);
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
    expect(result.current.transcriptLoading).toBe(true);
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
  });
});
