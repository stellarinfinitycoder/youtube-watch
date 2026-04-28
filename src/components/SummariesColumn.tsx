import { Button, Empty, List, Typography } from "antd";
import { Suspense, lazy, memo, useEffect, useMemo, useRef, useState } from "react";
import type { StoredSummaryDisplayEntry, SummariesBoardVideo } from "../domain/summariesBoard";
import type { VideoItem } from "../types/youtube";
import type { InlineMetaFeedback } from "./boardColumnsShared";
import { VideoTile } from "./VideoTile";

const { Text } = Typography;
const SummaryMarkdownRenderer = lazy(() => import("./SummaryMarkdownRenderer"));
const SUMMARY_COPY_FEEDBACK_MS = 1000;

type SummariesColumnProps = {
  activeBoardId: string;
  videos: SummariesBoardVideo[];
  selectedVideoId: string | null;
  selectedSummaryEntries: StoredSummaryDisplayEntry[];
  selectedSummaryLoading: boolean;
  selectedSummaryError: string | null;
  copiedLinkVideoId: string | null;
  saveDestinationColumnsLength: number;
  videoStatsBackfillInFlight: string[];
  videoMetaFeedbackById: Record<string, InlineMetaFeedback>;
  formatVideoMeta: (video: VideoItem) => string;
  backfillVideoStats: (videoId: string) => Promise<void>;
  getVideoThumbnailSrc: (video: VideoItem) => string;
  handleVideoThumbnailError: (video: VideoItem) => void;
  openTranscript: (video: VideoItem, handle?: string) => Promise<void>;
  copyVideoLink: (video: VideoItem) => Promise<void>;
  openSaveVideoModal: (video: VideoItem) => void;
  toggleWatched: (videoId: string) => void;
  openVideo: (video: VideoItem) => void;
  deleteStoredSummary: (promptHash: string) => Promise<void>;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatStoredSummaryCopyText(entry: StoredSummaryDisplayEntry): string {
  return [`## ${entry.label}`, entry.summary.trim()].filter(Boolean).join("\n\n");
}

function formatStoredSummaryCopyHtml(entry: StoredSummaryDisplayEntry): string {
  const summaryHtml = entry.summary.trim()
    ? `<p style="margin:0;">${escapeHtml(entry.summary.trim()).replace(/\n/g, "<br />")}</p>`
    : "";
  return [
    "<div>",
    `<h3 style="margin:0 0 8px;font-size:16px;font-weight:700;">${escapeHtml(entry.label)}</h3>`,
    summaryHtml,
    "</div>"
  ].join("");
}

function SummariesColumnComponent({
  activeBoardId,
  videos,
  selectedVideoId,
  selectedSummaryEntries,
  selectedSummaryLoading,
  selectedSummaryError,
  copiedLinkVideoId,
  saveDestinationColumnsLength,
  videoStatsBackfillInFlight,
  videoMetaFeedbackById,
  formatVideoMeta,
  backfillVideoStats,
  getVideoThumbnailSrc,
  handleVideoThumbnailError,
  openTranscript,
  copyVideoLink,
  openSaveVideoModal,
  toggleWatched,
  openVideo,
  deleteStoredSummary
}: SummariesColumnProps) {
  const [copiedSummaryPromptHash, setCopiedSummaryPromptHash] = useState<string | null>(null);
  const copyFeedbackTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copyFeedbackTimeoutRef.current) {
        window.clearTimeout(copyFeedbackTimeoutRef.current);
      }
    },
    []
  );

  const copyStoredSummary = async (entry: StoredSummaryDisplayEntry): Promise<void> => {
    const text = formatStoredSummaryCopyText(entry);
    const html = formatStoredSummaryCopyHtml(entry);
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

    setCopiedSummaryPromptHash(entry.promptHash);
    if (copyFeedbackTimeoutRef.current) {
      window.clearTimeout(copyFeedbackTimeoutRef.current);
    }
    copyFeedbackTimeoutRef.current = window.setTimeout(() => {
      setCopiedSummaryPromptHash(null);
      copyFeedbackTimeoutRef.current = null;
    }, SUMMARY_COPY_FEEDBACK_MS);
  };

  const videoItems = useMemo(
    () =>
      videos.map(({ video, sourceColumn, isWatched }) => (
        <VideoTile
          key={video.videoId}
          boardId={activeBoardId}
          column={sourceColumn}
          isSavedBoardActive={false}
          isActive={video.videoId === selectedVideoId}
          video={video}
          isWatched={isWatched}
          isMetaRefreshInFlight={videoStatsBackfillInFlight.includes(video.videoId)}
          metaFeedback={videoMetaFeedbackById[video.videoId]}
          metaText={formatVideoMeta(video)}
          copiedLinkVideoId={copiedLinkVideoId}
          saveDestinationColumnsLength={saveDestinationColumnsLength}
          savedBoardColumnsLength={0}
          manualIndex={0}
          filteredVideosLength={videos.length}
          savedSortMode=""
          onBackfillVideoStats={backfillVideoStats}
          onOpenTranscript={openTranscript}
          onCopyVideoLink={copyVideoLink}
          onOpenMoveSavedVideoModal={() => undefined}
          onSetDeletingSavedVideo={() => undefined}
          onMoveSavedVideoInManualOrder={() => undefined}
          onOpenSaveVideoModal={openSaveVideoModal}
          onToggleWatched={toggleWatched}
          onOpenVideo={openVideo}
          getVideoThumbnailSrc={getVideoThumbnailSrc}
          onHandleVideoThumbnailError={handleVideoThumbnailError}
        />
      )),
    [
      activeBoardId,
      videos,
      selectedVideoId,
      videoStatsBackfillInFlight,
      videoMetaFeedbackById,
      formatVideoMeta,
      copiedLinkVideoId,
      saveDestinationColumnsLength,
      backfillVideoStats,
      openTranscript,
      copyVideoLink,
      openSaveVideoModal,
      toggleWatched,
      openVideo,
      deleteStoredSummary,
      getVideoThumbnailSrc,
      handleVideoThumbnailError
    ]
  );
  const selectedSummaryVideo =
    selectedVideoId === null
      ? null
      : videos.find(({ video }) => video.videoId === selectedVideoId)?.video ?? null;

  return (
    <div className="columns-scroll summaries-board-scroll">
      <div className="columns-layout summaries-board-layout">
        <section className="columns-grid summaries-board-grid">
          <article
            className="channel-column is-channel-column summaries-column"
            data-board-id={activeBoardId}
            data-column-id="summaries"
            data-handle="summaries"
            data-hidden="false"
          >
            {videos.length === 0 ? (
              <Empty description="Empty" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <List itemLayout="vertical" dataSource={videos} renderItem={(_, idx) => videoItems[idx] ?? null} />
            )}
          </article>
          <section className="summaries-detail-pane" aria-label="Stored summaries">
            {videos.length === 0 ? (
              <Empty description="No summarized videos" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : selectedSummaryVideo === null ? (
              <Empty description="Select a video" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <>
                {selectedSummaryLoading ? (
                  <Text className="video-meta-feedback is-info">LOADING SUMMARIES...</Text>
                ) : selectedSummaryError ? (
                  <Text type="danger">{selectedSummaryError}</Text>
                ) : selectedSummaryEntries.length === 0 ? (
                  <Empty description="No readable summaries" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  <div className="summaries-detail-list">
                    {selectedSummaryEntries.map((entry) => {
                      const summaryText = entry.summary.trim();
                      return (
                        <article className="summaries-detail-card" key={entry.id}>
                          <div className="summaries-detail-card-title-row">
                            <Text className="summaries-detail-card-label">{entry.label}</Text>
                            <Button
                              htmlType="button"
                              className={`column-move-btn transcript-copy-btn board-summary-copy-btn board-summary-row-copy-btn ${
                                copiedSummaryPromptHash === entry.promptHash ? "is-copied" : ""
                              }`}
                              aria-label={`Copy ${entry.label}`}
                              onClick={() => void copyStoredSummary(entry)}
                            >
                              {copiedSummaryPromptHash === entry.promptHash ? (
                                <span className="btn-icon btn-icon-check" aria-hidden />
                              ) : (
                                <span className="btn-icon btn-icon-copy" aria-hidden />
                              )}
                            </Button>
                            <Button
                              htmlType="button"
                              className="remove-column-btn"
                              aria-label={`Delete ${entry.label}`}
                              onClick={() => void deleteStoredSummary(entry.promptHash)}
                            >
                              <span className="btn-icon btn-icon-delete" aria-hidden />
                            </Button>
                          </div>
                          {summaryText ? (
                            <div className="summary-content summaries-detail-summary">
                              <Suspense fallback={<pre className="summary-raw-text">{summaryText}</pre>}>
                                <SummaryMarkdownRenderer content={summaryText} />
                              </Suspense>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        </section>
      </div>
    </div>
  );
}

export const SummariesColumn = memo(SummariesColumnComponent);
