import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  fetchSummaryByVideoInput,
  fetchTranscriptByVideoInput
} from "../api/youtube";
import {
  readCachedSummary
} from "../storage/summariesStorage";
import {
  readCachedTranscript,
  writeCachedTranscript
} from "../storage/transcriptsStorage";
import type { BoardSummaryBatchItem } from "../components/BoardSummaryBatchModal";
import {
  hashText,
  readCachedSummaryForTranscript,
  writeCachedSummaryForTranscript,
  type SummaryFormat
} from "./useTranscriptSummary";

export type BoardSummaryBatchProgress = {
  completed: number;
  total: number;
};

type BoardSummaryBatchBoard = {
  id: string;
  boardSummaryFormatId: string;
};

type BoardSummaryBatchTarget = {
  video: BoardSummaryBatchItem["video"];
  column: BoardSummaryBatchItem["column"];
};

type PendingBoardSummaryBatch = {
  targets: BoardSummaryBatchTarget[];
  promptText: string;
  modelText: string;
  promptCacheKey: string;
  promptHash: string;
};

type UseBoardSummaryBatchOptions<TBoard extends BoardSummaryBatchBoard> = {
  activeBoard: TBoard | null;
  summaryFormats: SummaryFormat[];
  shownVideosInBoardOrder: BoardSummaryBatchTarget[];
  setBoard: (boardId: string, updater: (board: TBoard) => TBoard) => void;
  refreshSummaryVideoCacheEntries: () => void | Promise<void>;
  defaultSummaryPrompt: string;
  resolveBoardSummaryFormat: (formats: SummaryFormat[], formatId: string) => SummaryFormat;
};

function buildSummaryPromptCacheKey(prompt: string, model: string): string {
  return `${prompt.trim()}\n__MODEL__:${model.trim() || ""}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function useBoardSummaryBatch<TBoard extends BoardSummaryBatchBoard>({
  activeBoard,
  summaryFormats,
  shownVideosInBoardOrder,
  setBoard,
  refreshSummaryVideoCacheEntries,
  defaultSummaryPrompt,
  resolveBoardSummaryFormat
}: UseBoardSummaryBatchOptions<TBoard>) {
  const boardSummaryBatchRunIdRef = useRef(0);
  const boardSummaryCopyFeedbackTimeoutRef = useRef<number | null>(null);

  const [isBoardSummaryBatchRunning, setIsBoardSummaryBatchRunning] = useState(false);
  const [boardSummaryBatchProgress, setBoardSummaryBatchProgress] =
    useState<BoardSummaryBatchProgress>({
      completed: 0,
      total: 0
    });
  const [boardSummaryBatchItems, setBoardSummaryBatchItems] = useState<BoardSummaryBatchItem[]>([]);
  const [isBoardSummaryBatchModalOpen, setIsBoardSummaryBatchModalOpen] = useState(false);
  const [isBoardSummaryBatchPreparing, setIsBoardSummaryBatchPreparing] = useState(false);
  const [isBoardSummaryBatchCopied, setIsBoardSummaryBatchCopied] = useState(false);
  const [pendingBoardSummaryBatch, setPendingBoardSummaryBatch] =
    useState<PendingBoardSummaryBatch | null>(null);

  const launchBoardSummaryBatch = (format: SummaryFormat): void => {
    if (shownVideosInBoardOrder.length === 0) {
      return;
    }

    const promptText = format.prompt.trim() || defaultSummaryPrompt;
    const modelText = (format.model ?? "").trim();
    const promptCacheKey = buildSummaryPromptCacheKey(promptText, modelText);
    const promptHash = hashText(promptCacheKey);
    boardSummaryBatchRunIdRef.current += 1;

    flushSync(() => {
      setIsBoardSummaryBatchRunning(true);
      setBoardSummaryBatchProgress({ completed: 0, total: shownVideosInBoardOrder.length });
      setBoardSummaryBatchItems([]);
      setIsBoardSummaryBatchPreparing(true);
      setPendingBoardSummaryBatch({
        targets: shownVideosInBoardOrder.map(({ video, column }) => ({ video, column })),
        promptText,
        modelText,
        promptCacheKey,
        promptHash
      });
      setIsBoardSummaryBatchModalOpen(true);
    });
  };

  const startBoardSummaryBatch = (): void => {
    if (shownVideosInBoardOrder.length === 0 || isBoardSummaryBatchRunning || !activeBoard) {
      return;
    }

    const resolvedSummaryFormat = resolveBoardSummaryFormat(
      summaryFormats,
      activeBoard.boardSummaryFormatId
    );
    launchBoardSummaryBatch(resolvedSummaryFormat);
  };

  const changeBoardSummaryFormat = (formatId: string): void => {
    if (!activeBoard) {
      return;
    }
    const nextFormat = summaryFormats.find((item) => item.id === formatId);
    if (!nextFormat) {
      return;
    }

    setBoard(activeBoard.id, (board) => ({
      ...board,
      boardSummaryFormatId: formatId
    }));
    launchBoardSummaryBatch(nextFormat);
  };

  useEffect(() => {
    if (!isBoardSummaryBatchModalOpen || !pendingBoardSummaryBatch) {
      return;
    }

    const runId = boardSummaryBatchRunIdRef.current;
    const { targets, promptText, modelText, promptCacheKey, promptHash } = pendingBoardSummaryBatch;
    setPendingBoardSummaryBatch(null);

    const initialItems: BoardSummaryBatchItem[] = targets.map(({ video, column }) => ({
      videoId: video.videoId,
      video,
      column,
      status: "loading",
      summary: "",
      keyPoints: [],
      error: null
    }));
    setBoardSummaryBatchItems(initialItems);
    setIsBoardSummaryBatchPreparing(false);

    const concurrency = 2;
    let nextIndex = 0;
    let completed = 0;
    const yieldToBrowser = (): Promise<void> =>
      new Promise((resolve) => {
        window.setTimeout(resolve, 0);
      });

    const updateBatchItem = (
      index: number,
      next: Partial<BoardSummaryBatchItem> & Pick<BoardSummaryBatchItem, "status">
    ): void => {
      if (boardSummaryBatchRunIdRef.current !== runId) {
        return;
      }
      setBoardSummaryBatchItems((previous) =>
        previous.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                ...next
              }
            : item
        )
      );
    };

    const runSingle = async (target: BoardSummaryBatchTarget, index: number): Promise<void> => {
      const { video } = target;
      try {
        const directCachedSummary = await readCachedSummary(video.videoId, promptHash);
        if (directCachedSummary) {
          updateBatchItem(index, {
            status: "done",
            summary: directCachedSummary.summary,
            keyPoints: directCachedSummary.keyPoints,
            error: null
          });
          return;
        }

        let transcriptText = (await readCachedTranscript(video.videoId)) ?? "";
        if (!transcriptText) {
          const transcriptPayload = await fetchTranscriptByVideoInput({
            videoId: video.videoId,
            videoUrl: video.videoUrl
          });
          transcriptText = transcriptPayload.text.trim();
          if (!transcriptText) {
            throw new Error("Transcript unavailable.");
          }
          await writeCachedTranscript(video.videoId, transcriptText);
        }

        const cached = await readCachedSummaryForTranscript(
          video.videoId,
          transcriptText,
          promptCacheKey
        );
        if (cached) {
          updateBatchItem(index, {
            status: "done",
            summary: cached.summary,
            keyPoints: cached.keyPoints,
            error: null
          });
          return;
        }

        updateBatchItem(index, {
          status: "summarizing",
          error: null
        });

        const payload = await fetchSummaryByVideoInput({
          videoId: video.videoId,
          videoUrl: video.videoUrl,
          transcriptText,
          mode: "short",
          prompt: promptText,
          model: modelText || undefined
        });
        const nextSummary = payload.summary.trim();
        if (!nextSummary) {
          throw new Error("No summary.");
        }

        await writeCachedSummaryForTranscript(video.videoId, transcriptText, promptCacheKey, {
          summary: nextSummary,
          keyPoints: [],
          model: payload.model
        });
        void refreshSummaryVideoCacheEntries();
        updateBatchItem(index, {
          status: "done",
          summary: nextSummary,
          keyPoints: [],
          error: null
        });
      } catch (error) {
        updateBatchItem(index, {
          status: "error",
          summary: "",
          keyPoints: [],
          error: error instanceof Error ? error.message : "Summary failed."
        });
      } finally {
        completed += 1;
        if (boardSummaryBatchRunIdRef.current === runId) {
          setBoardSummaryBatchProgress({ completed, total: targets.length });
        }
      }
    };

    void (async () => {
      try {
        const workers = Array.from({ length: Math.min(concurrency, targets.length) }, async () => {
          while (true) {
            const current = nextIndex;
            nextIndex += 1;
            if (current >= targets.length) {
              return;
            }
            await runSingle(targets[current], current);
            await yieldToBrowser();
          }
        });
        await Promise.all(workers);
      } finally {
        if (boardSummaryBatchRunIdRef.current === runId) {
          setIsBoardSummaryBatchPreparing(false);
          setIsBoardSummaryBatchRunning(false);
        }
      }
    })();
  }, [isBoardSummaryBatchModalOpen, pendingBoardSummaryBatch, refreshSummaryVideoCacheEntries]);

  const copyBoardSummaryBatchToClipboard = async (): Promise<void> => {
    const normalizedItems = boardSummaryBatchItems
      .map((item) => {
        const keyPoints = item.keyPoints
          .map((point) => point.trim())
          .filter((point) => point.length > 0);
        const textBody =
          item.status === "loading"
            ? "LOADING..."
            : item.status === "summarizing"
              ? "SUMMARIZING..."
              : item.error
                ? item.error
                : [item.summary.trim(), keyPoints.map((point) => `- ${point}`).join("\n")]
                    .filter(Boolean)
                    .join("\n\n")
                    .trim();
        return {
          title: item.video.title.toUpperCase(),
          status: item.status,
          summary: item.summary.trim(),
          keyPoints,
          error: item.error,
          textBody,
          videoUrl: item.video.videoUrl.trim()
        };
      })
      .filter((item) => item.textBody.length > 0);

    const text = normalizedItems
      .map((item) => [item.title, item.textBody, item.videoUrl].filter(Boolean).join("\n\n").trim())
      .join("\n\n\n");

    const htmlBlocks = normalizedItems.map((item) => {
      if (item.status === "loading" || item.status === "summarizing") {
        return [
          "<div>",
          `<h3 style="margin:0 0 8px;font-size:16px;font-weight:700;">${escapeHtml(item.title)}</h3>`,
          `<p style="margin:0;">${escapeHtml(item.textBody)}</p>`,
          "</div>"
        ].join("");
      }
      if (item.error) {
        return [
          "<div>",
          `<h3 style="margin:0 0 8px;font-size:16px;font-weight:700;">${escapeHtml(item.title)}</h3>`,
          `<p style="margin:0;color:#c96c7e;">${escapeHtml(item.error)}</p>`,
          "</div>"
        ].join("");
      }
      const summaryHtml = item.summary
        ? `<p style="margin:0 0 10px;">${escapeHtml(item.summary).replace(/\n/g, "<br />")}</p>`
        : "";
      const keyPointsHtml =
        item.keyPoints.length > 0
          ? `<ul style="margin:0;padding-left:20px;">${item.keyPoints
              .map((point) => `<li>${escapeHtml(point)}</li>`)
              .join("")}</ul>`
          : "";
      const linkHtml = item.videoUrl
        ? `<p style="margin:10px 0 0;"><a href="${escapeHtml(item.videoUrl)}">${escapeHtml(item.videoUrl)}</a></p>`
        : "";
      return [
        "<div>",
        `<h3 style="margin:0 0 8px;font-size:16px;font-weight:700;">${escapeHtml(item.title)}</h3>`,
        summaryHtml,
        keyPointsHtml,
        linkHtml,
        "</div>"
      ].join("");
    });

    const html = `<div>${htmlBlocks.join('<div style="height:24px;"><br /></div>')}</div>`;

    if (!text) {
      return;
    }

    try {
      if (
        navigator.clipboard &&
        typeof navigator.clipboard.write === "function" &&
        typeof ClipboardItem !== "undefined"
      ) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([text], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" })
          })
        ]);
      } else if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
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

    setIsBoardSummaryBatchCopied(true);
    if (boardSummaryCopyFeedbackTimeoutRef.current) {
      window.clearTimeout(boardSummaryCopyFeedbackTimeoutRef.current);
    }
    boardSummaryCopyFeedbackTimeoutRef.current = window.setTimeout(() => {
      setIsBoardSummaryBatchCopied(false);
      boardSummaryCopyFeedbackTimeoutRef.current = null;
    }, 1000);
  };

  const removeBoardSummaryBatchItems = (videoIds: string[]): void => {
    const videoIdSet = new Set(videoIds);
    setBoardSummaryBatchItems((previous) =>
      previous.filter((item) => !videoIdSet.has(item.videoId))
    );
  };

  return {
    isBoardSummaryBatchRunning,
    boardSummaryBatchProgress,
    boardSummaryBatchItems,
    isBoardSummaryBatchModalOpen,
    isBoardSummaryBatchPreparing,
    isBoardSummaryBatchCopied,
    startBoardSummaryBatch,
    changeBoardSummaryFormat,
    copyBoardSummaryBatchToClipboard,
    setIsBoardSummaryBatchModalOpen,
    removeBoardSummaryBatchItems
  };
}
