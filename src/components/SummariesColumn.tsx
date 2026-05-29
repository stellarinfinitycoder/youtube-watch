import { Button, Empty, List, Typography } from "antd";
import { SlackOutlined } from "@ant-design/icons";
import { Suspense, lazy, memo, useEffect, useMemo, useRef, useState } from "react";
import type { StoredSummaryDisplayEntry, SummariesBoardVideo } from "../domain/summariesBoard";
import {
  formatSlackSummaryCopyPayload,
  formatSlackSummaryDigestCopyPayload,
  type SlackSummaryCopyPayload
} from "../domain/slackCopy";
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
  deleteAllStoredSummaries: () => Promise<void>;
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
  const labelParts = getStoredSummaryLabelParts(entry.label);
  const heading = [`## ${labelParts.name}`, labelParts.meta].filter(Boolean).join("\n");
  return [heading, entry.summary.trim()].filter(Boolean).join("\n\n");
}

function formatStoredSummariesCopyText(entries: StoredSummaryDisplayEntry[]): string {
  return entries
    .map(formatStoredSummaryCopyText)
    .filter((text) => text.trim().length > 0)
    .join("\n\n---\n\n");
}

function formatStoredSummaryCopyHtml(entry: StoredSummaryDisplayEntry): string {
  const labelParts = getStoredSummaryLabelParts(entry.label);
  const summaryHtml = entry.summary.trim()
    ? `<p style="margin:0;">${escapeHtml(entry.summary.trim()).replace(/\n/g, "<br />")}</p>`
    : "";
  const metaHtml = labelParts.meta
    ? `<div style="margin:4px 0 0;font-size:12px;line-height:1.45;color:#c08f56;font-weight:400;">${escapeHtml(labelParts.meta)}</div>`
    : "";
  return [
    "<div>",
    `<h3 style="margin:0 0 8px;font-size:16px;font-weight:700;">${escapeHtml(labelParts.name)}${metaHtml}</h3>`,
    summaryHtml,
    "</div>"
  ].join("");
}

function formatStoredSummariesCopyHtml(entries: StoredSummaryDisplayEntry[]): string {
  return entries.map(formatStoredSummaryCopyHtml).join('<hr style="margin:16px 0;" />');
}

function formatSummaryLabelDateForMeta(value: string): string {
  if (value === "UNKNOWN DATE") {
    return "--.--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--.--";
  }
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

function getStoredSummaryLabelParts(label: string): { name: string; meta: string | null } {
  const match = label.match(/^(.*) - (.+) - (\d{4}-\d{2}-\d{2}|UNKNOWN DATE)$/);
  if (!match) {
    return { name: label, meta: null };
  }
  return {
    name: match[1] ?? label,
    meta: `${match[2] ?? ""} | ${formatSummaryLabelDateForMeta(match[3] ?? "")}`.trim()
  };
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
  deleteStoredSummary,
  deleteAllStoredSummaries
}: SummariesColumnProps) {
  const [copiedSummaryPromptHash, setCopiedSummaryPromptHash] = useState<string | null>(null);
  const [copiedSlackSummaryPromptHash, setCopiedSlackSummaryPromptHash] = useState<string | null>(
    null
  );
  const copyFeedbackTimeoutRef = useRef<number | null>(null);
  const slackCopyFeedbackTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copyFeedbackTimeoutRef.current) {
        window.clearTimeout(copyFeedbackTimeoutRef.current);
      }
      if (slackCopyFeedbackTimeoutRef.current) {
        window.clearTimeout(slackCopyFeedbackTimeoutRef.current);
      }
    },
    []
  );

  const copyPlainTextToClipboard = async (text: string): Promise<void> => {
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
  };

  const copySlackPayloadToClipboard = async (payload: SlackSummaryCopyPayload): Promise<void> => {
    if (!payload.text) {
      return;
    }
    try {
      if (
        payload.html &&
        navigator.clipboard &&
        typeof navigator.clipboard.write === "function" &&
        typeof ClipboardItem !== "undefined"
      ) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([payload.text], { type: "text/plain" }),
            "text/html": new Blob([payload.html], { type: "text/html" })
          })
        ]);
      } else {
        await copyPlainTextToClipboard(payload.text);
      }
    } catch {
      await copyPlainTextToClipboard(payload.text);
    }
  };

  const showSlackCopyFeedback = (value: string): void => {
    setCopiedSlackSummaryPromptHash(value);
    if (slackCopyFeedbackTimeoutRef.current) {
      window.clearTimeout(slackCopyFeedbackTimeoutRef.current);
    }
    slackCopyFeedbackTimeoutRef.current = window.setTimeout(() => {
      setCopiedSlackSummaryPromptHash(null);
      slackCopyFeedbackTimeoutRef.current = null;
    }, SUMMARY_COPY_FEEDBACK_MS);
  };

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

  const copyStoredSummaryForSlack = async (entry: StoredSummaryDisplayEntry): Promise<void> => {
    if (!selectedSummaryVideo) {
      return;
    }
    const payload = formatSlackSummaryCopyPayload({
      title: selectedSummaryVideo.title,
      summary: entry.summary,
      videoUrl: selectedSummaryVideo.videoUrl
    });
    if (!payload.text) {
      return;
    }

    await copySlackPayloadToClipboard(payload);
    showSlackCopyFeedback(entry.promptHash);
  };

  const copyAllStoredSummaries = async (): Promise<void> => {
    const text = formatStoredSummariesCopyText(selectedSummaryEntries);
    const html = formatStoredSummariesCopyHtml(selectedSummaryEntries);
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

    setCopiedSummaryPromptHash("__all__");
    if (copyFeedbackTimeoutRef.current) {
      window.clearTimeout(copyFeedbackTimeoutRef.current);
    }
    copyFeedbackTimeoutRef.current = window.setTimeout(() => {
      setCopiedSummaryPromptHash(null);
      copyFeedbackTimeoutRef.current = null;
    }, SUMMARY_COPY_FEEDBACK_MS);
  };

  const copyAllStoredSummariesForSlack = async (): Promise<void> => {
    if (!selectedSummaryVideo) {
      return;
    }
    const payload = formatSlackSummaryDigestCopyPayload(
      selectedSummaryEntries.map((entry) => ({
        title: selectedSummaryVideo.title,
        summary: entry.summary,
        videoUrl: selectedSummaryVideo.videoUrl
      }))
    );
    if (!payload.text) {
      return;
    }

    await copySlackPayloadToClipboard(payload);
    showSlackCopyFeedback("__all__");
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
              <div className="summaries-detail-content">
                <div className="summaries-detail-title-card">
                  <Text className="summaries-detail-video-title">{selectedSummaryVideo.title}</Text>
                  <Button
                    htmlType="button"
                    className={`column-move-btn transcript-copy-btn board-summary-copy-btn board-summary-row-copy-btn ${
                      copiedSummaryPromptHash === "__all__" ? "is-copied" : ""
                    }`}
                    aria-label={`Copy all summaries for ${selectedSummaryVideo.title}`}
                    disabled={selectedSummaryLoading || selectedSummaryEntries.length === 0}
                    onClick={() => void copyAllStoredSummaries()}
                  >
                    {copiedSummaryPromptHash === "__all__" ? (
                      <span className="btn-icon btn-icon-check" aria-hidden />
                    ) : (
                      <span className="btn-icon btn-icon-copy" aria-hidden />
                    )}
                  </Button>
                  <Button
                    htmlType="button"
                    className={`column-move-btn transcript-copy-btn board-summary-copy-btn board-summary-row-copy-btn ${
                      copiedSlackSummaryPromptHash === "__all__" ? "is-copied" : ""
                    }`}
                    aria-label={`Copy Slack-ready summaries for ${selectedSummaryVideo.title}`}
                    disabled={selectedSummaryLoading || selectedSummaryEntries.length === 0}
                    onClick={() => void copyAllStoredSummariesForSlack()}
                  >
                    {copiedSlackSummaryPromptHash === "__all__" ? (
                      <span className="btn-icon btn-icon-check" aria-hidden />
                    ) : (
                      <SlackOutlined className="btn-icon btn-icon-slack" aria-hidden />
                    )}
                  </Button>
                  <Button
                    htmlType="button"
                    className="remove-column-btn"
                    aria-label={`Delete all summaries for ${selectedSummaryVideo.title}`}
                    disabled={selectedSummaryLoading || selectedSummaryEntries.length === 0}
                    onClick={() => void deleteAllStoredSummaries()}
                  >
                    <span className="btn-icon btn-icon-delete" aria-hidden />
                  </Button>
                </div>
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
                      const labelParts = getStoredSummaryLabelParts(entry.label);
                      return (
                        <article className="summaries-detail-card" key={entry.id}>
                          <div className="summaries-detail-card-title-row">
                            <Text className="summaries-detail-card-label">
                              <span className="summaries-detail-card-label-name">{labelParts.name}</span>
                              {labelParts.meta ? (
                                <Text className="video-meta summaries-detail-card-meta">
                                  {labelParts.meta}
                                </Text>
                              ) : null}
                            </Text>
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
                              className={`column-move-btn transcript-copy-btn board-summary-copy-btn board-summary-row-copy-btn ${
                                copiedSlackSummaryPromptHash === entry.promptHash ? "is-copied" : ""
                              }`}
                              aria-label={`Copy Slack-ready ${entry.label}`}
                              disabled={summaryText.length === 0}
                              onClick={() => void copyStoredSummaryForSlack(entry)}
                            >
                              {copiedSlackSummaryPromptHash === entry.promptHash ? (
                                <span className="btn-icon btn-icon-check" aria-hidden />
                              ) : (
                                <SlackOutlined className="btn-icon btn-icon-slack" aria-hidden />
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
              </div>
            )}
          </section>
        </section>
      </div>
    </div>
  );
}

export const SummariesColumn = memo(SummariesColumnComponent);
