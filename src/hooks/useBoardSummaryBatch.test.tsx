import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchSummaryByVideoInput,
  fetchTranscriptByVideoInput
} from "../api/youtube";
import type { BoardSummaryBatchItem } from "../components/BoardSummaryBatchModal";
import { resetCacheDbForTests } from "../storage/indexedDbCache";
import { writeCachedSummary } from "../storage/summariesStorage";
import { writeCachedTranscript } from "../storage/transcriptsStorage";
import {
  DEFAULT_SUMMARY_PROMPT,
  getDefaultSummaryFormat,
  hashText,
  readCachedSummaryForTranscript,
  writeCachedSummaryForTranscript,
  type SummaryFormat
} from "./useTranscriptSummary";
import { useBoardSummaryBatch } from "./useBoardSummaryBatch";

vi.mock("../api/youtube", () => ({
  fetchSummaryByVideoInput: vi.fn(),
  fetchTranscriptByVideoInput: vi.fn()
}));

const fetchSummaryMock = vi.mocked(fetchSummaryByVideoInput);
const fetchTranscriptMock = vi.mocked(fetchTranscriptByVideoInput);
const defaultPromptCacheKey = `${DEFAULT_SUMMARY_PROMPT}\n__MODEL__:`;

const summaryFormat: SummaryFormat = {
  id: "summary-default",
  name: "SUMMARY",
  prompt: DEFAULT_SUMMARY_PROMPT,
  model: "",
  isDefault: true,
  createdAt: 1,
  updatedAt: 1
};

const alternateFormat: SummaryFormat = {
  id: "summary-alt",
  name: "ALT",
  prompt: "Alternate prompt",
  model: "openai/gpt-4o-mini",
  isDefault: false,
  createdAt: 2,
  updatedAt: 2
};

const video: BoardSummaryBatchItem["video"] = {
  videoId: "video-1",
  title: "Example Video",
  publishedAt: "2026-04-10T10:00:00Z",
  thumbnailUrl: "https://img.test/video-1.jpg",
  channelTitle: "Example Channel",
  videoUrl: "https://www.youtube.com/watch?v=video-1",
  viewCount: 100
};

const secondVideo: BoardSummaryBatchItem["video"] = {
  ...video,
  videoId: "video-2",
  title: "Second Video",
  videoUrl: "https://www.youtube.com/watch?v=video-2"
};

const column: BoardSummaryBatchItem["column"] = {
  id: "column-1",
  handleInput: "@example",
  currentHandle: "@example",
  loading: false,
  error: null,
  videos: [],
  channelId: "channel-1",
  uploadsPlaylistId: "playlist-1",
  channelThumbnailUrl: "",
  lastGoodChannelThumbnailUrl: "",
  lastFetchAt: null,
  savedSortMode: "added_desc"
};

type TestBoard = {
  id: string;
  boardSummaryFormatId: string;
};

function renderBoardSummaryBatchHook(options?: {
  board?: TestBoard;
  formats?: SummaryFormat[];
  targets?: Array<{ video: BoardSummaryBatchItem["video"]; column: BoardSummaryBatchItem["column"] }>;
  refreshSummaryVideoCacheEntries?: () => void | Promise<void>;
}) {
  let board = options?.board ?? { id: "board-1", boardSummaryFormatId: summaryFormat.id };
  const setBoard = vi.fn((boardId: string, updater: (value: TestBoard) => TestBoard) => {
    if (boardId === board.id) {
      board = updater(board);
    }
  });
  const refreshSummaryVideoCacheEntries = options?.refreshSummaryVideoCacheEntries ?? vi.fn();
  const result = renderHook(() =>
    useBoardSummaryBatch({
      activeBoard: board,
      summaryFormats: options?.formats ?? [summaryFormat, alternateFormat],
      shownVideosInBoardOrder: options?.targets ?? [{ video, column }],
      setBoard,
      refreshSummaryVideoCacheEntries,
      defaultSummaryPrompt: DEFAULT_SUMMARY_PROMPT,
      resolveBoardSummaryFormat: (formats, formatId) =>
        formats.find((format) => format.id === formatId) ?? getDefaultSummaryFormat(formats)
    })
  );

  return {
    ...result,
    setBoard,
    refreshSummaryVideoCacheEntries,
    getBoard: () => board
  };
}

describe("useBoardSummaryBatch", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    window.localStorage.clear();
    await resetCacheDbForTests();
  });

  it("uses a direct cached summary without transcript or summary API calls", async () => {
    const defaultPromptHash = hashText(defaultPromptCacheKey);
    await writeCachedSummary("video-1", defaultPromptHash, {
      summary: "Direct cached summary",
      keyPoints: ["Cached point"],
      model: "openai/gpt-4o-mini",
      transcriptHash: "stale-transcript-hash",
      promptHash: defaultPromptHash,
      cachedAt: 10
    });

    const { result } = renderBoardSummaryBatchHook();

    act(() => {
      result.current.startBoardSummaryBatch();
    });

    await waitFor(() => {
      expect(result.current.boardSummaryBatchItems[0]).toMatchObject({
        status: "done",
        summary: "Direct cached summary",
        keyPoints: ["Cached point"]
      });
    });
    expect(fetchTranscriptMock).not.toHaveBeenCalled();
    expect(fetchSummaryMock).not.toHaveBeenCalled();
    expect(result.current.boardSummaryBatchProgress).toEqual({ completed: 1, total: 1 });
  });

  it("uses cached transcript before generating and caches the summary", async () => {
    await writeCachedTranscript("video-1", "Cached transcript body");
    fetchSummaryMock.mockResolvedValue({
      videoId: "video-1",
      model: "openai/gpt-5.4-nano",
      summary: "Generated summary body",
      keyPoints: []
    });
    const refreshSummaryVideoCacheEntries = vi.fn();

    const { result } = renderBoardSummaryBatchHook({ refreshSummaryVideoCacheEntries });

    act(() => {
      result.current.startBoardSummaryBatch();
    });

    await waitFor(() => {
      expect(result.current.boardSummaryBatchItems[0]).toMatchObject({
        status: "done",
        summary: "Generated summary body"
      });
    });
    expect(fetchTranscriptMock).not.toHaveBeenCalled();
    expect(fetchSummaryMock).toHaveBeenCalledWith({
      videoId: "video-1",
      videoUrl: "https://www.youtube.com/watch?v=video-1",
      transcriptText: "Cached transcript body",
      mode: "short",
      prompt: DEFAULT_SUMMARY_PROMPT,
      model: undefined
    });
    await expect(
      readCachedSummaryForTranscript("video-1", "Cached transcript body", defaultPromptCacheKey)
    ).resolves.toMatchObject({
      summary: "Generated summary body",
      model: "openai/gpt-5.4-nano"
    });
    expect(refreshSummaryVideoCacheEntries).toHaveBeenCalledTimes(1);
  });

  it("fetches transcript once before generating when transcript cache is absent", async () => {
    fetchTranscriptMock.mockResolvedValue({
      videoId: "video-1",
      text: "Fetched transcript body"
    });
    fetchSummaryMock.mockResolvedValue({
      videoId: "video-1",
      model: "openai/gpt-5.4-nano",
      summary: "Fresh summary body",
      keyPoints: []
    });

    const { result } = renderBoardSummaryBatchHook();

    act(() => {
      result.current.startBoardSummaryBatch();
    });

    await waitFor(() => {
      expect(result.current.boardSummaryBatchItems[0]).toMatchObject({
        status: "done",
        summary: "Fresh summary body"
      });
    });
    expect(fetchTranscriptMock).toHaveBeenCalledTimes(1);
    expect(fetchTranscriptMock).toHaveBeenCalledWith({
      videoId: "video-1",
      videoUrl: "https://www.youtube.com/watch?v=video-1"
    });
    expect(fetchSummaryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        transcriptText: "Fetched transcript body"
      })
    );
  });

  it("changes board summary format before relaunching with the selected format", async () => {
    await writeCachedTranscript("video-1", "Cached transcript body");
    fetchSummaryMock.mockResolvedValue({
      videoId: "video-1",
      model: "openai/gpt-4o-mini",
      summary: "Alternate generated summary",
      keyPoints: []
    });

    const { result, setBoard, getBoard } = renderBoardSummaryBatchHook();

    act(() => {
      result.current.changeBoardSummaryFormat(alternateFormat.id);
    });

    await waitFor(() => {
      expect(result.current.boardSummaryBatchItems[0]).toMatchObject({
        status: "done",
        summary: "Alternate generated summary"
      });
    });
    expect(setBoard).toHaveBeenCalledTimes(1);
    expect(getBoard().boardSummaryFormatId).toBe(alternateFormat.id);
    expect(fetchSummaryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Alternate prompt",
        model: "openai/gpt-4o-mini"
      })
    );
  });

  it("marks one item as error without stopping the rest of the batch", async () => {
    fetchTranscriptMock.mockImplementation(async ({ videoId }) => {
      if (videoId === "video-1") {
        return { videoId, text: "" };
      }
      return { videoId: videoId ?? "video-2", text: "Second transcript body" };
    });
    fetchSummaryMock.mockResolvedValue({
      videoId: "video-2",
      model: "openai/gpt-5.4-nano",
      summary: "Second generated summary",
      keyPoints: []
    });

    const { result } = renderBoardSummaryBatchHook({
      targets: [
        { video, column },
        { video: secondVideo, column }
      ]
    });

    act(() => {
      result.current.startBoardSummaryBatch();
    });

    await waitFor(() => {
      expect(result.current.boardSummaryBatchProgress).toEqual({ completed: 2, total: 2 });
    });
    expect(result.current.boardSummaryBatchItems).toEqual([
      expect.objectContaining({
        videoId: "video-1",
        status: "error",
        error: "Transcript unavailable."
      }),
      expect.objectContaining({
        videoId: "video-2",
        status: "done",
        summary: "Second generated summary"
      })
    ]);
  });

  it("uses a transcript-matched cached summary after reading cached transcript", async () => {
    await writeCachedTranscript("video-1", "Cached transcript body");
    await writeCachedSummaryForTranscript("video-1", "Cached transcript body", defaultPromptCacheKey, {
      summary: "Transcript-matched cached summary",
      keyPoints: [],
      model: "openai/gpt-4o-mini"
    });

    const { result } = renderBoardSummaryBatchHook();

    act(() => {
      result.current.startBoardSummaryBatch();
    });

    await waitFor(() => {
      expect(result.current.boardSummaryBatchItems[0]).toMatchObject({
        status: "done",
        summary: "Transcript-matched cached summary"
      });
    });
    expect(fetchTranscriptMock).not.toHaveBeenCalled();
    expect(fetchSummaryMock).not.toHaveBeenCalled();
  });
});
