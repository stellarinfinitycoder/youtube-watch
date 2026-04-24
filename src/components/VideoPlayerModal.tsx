import { memo, useCallback, useEffect, useRef } from "react";
import { Button, Modal, Space, Typography } from "antd";
import type { VideoItem } from "../types/youtube";
import { RESPONSIVE_MEDIA_MODAL_WIDTH } from "./modalSizing";

const { Text } = Typography;

type VideoPlayerModalProps = {
  activeVideo: VideoItem | null;
  closeVideoModal: () => void;
  stopPlaylist: () => void;
  videoModalWrapRef: React.RefObject<HTMLDivElement>;
  toggleVideoFullscreen: () => void;
  copiedLinkVideoId: string | null;
  copyVideoLink: (video: VideoItem) => Promise<void>;
  openSaveVideoModal: (video: VideoItem) => void;
  saveDestinationColumnsLength: number;
  markWatchedAndAdvanceOrClose: () => void;
  isPlaylistActive: boolean;
  playlistIndex: number;
  playlistQueueLength: number;
  playlistScope: "all" | "channel";
  playlistChannelLabel: string;
  isSavedBoardActive: boolean;
  playlistOrderLabel: string;
};

function VideoPlayerModalComponent({
  activeVideo,
  closeVideoModal,
  stopPlaylist,
  videoModalWrapRef,
  toggleVideoFullscreen,
  copiedLinkVideoId,
  copyVideoLink,
  openSaveVideoModal,
  saveDestinationColumnsLength,
  markWatchedAndAdvanceOrClose,
  isPlaylistActive,
  playlistIndex,
  playlistQueueLength,
  playlistScope,
  playlistChannelLabel,
  isSavedBoardActive,
  playlistOrderLabel
}: VideoPlayerModalProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const focusRetryTimeoutRef = useRef<number | null>(null);
  const focusAnimationFrameRef = useRef<number | null>(null);
  const embedUrl = activeVideo
    ? `https://www.youtube.com/embed/${activeVideo.videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1`
    : "";
  const isEmbedBlocked = activeVideo?.embeddable === false;

  const clearPendingFocus = useCallback((): void => {
    if (typeof window === "undefined") {
      return;
    }
    if (focusAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(focusAnimationFrameRef.current);
      focusAnimationFrameRef.current = null;
    }
    if (focusRetryTimeoutRef.current !== null) {
      window.clearTimeout(focusRetryTimeoutRef.current);
      focusRetryTimeoutRef.current = null;
    }
  }, []);

  const focusEmbeddedPlayer = useCallback((attempt = 0): void => {
    if (typeof window === "undefined") {
      return;
    }

    videoModalWrapRef.current?.focus();
    focusAnimationFrameRef.current = window.requestAnimationFrame(() => {
      focusAnimationFrameRef.current = null;
      iframeRef.current?.focus();

      if (document.activeElement === iframeRef.current || attempt >= 2) {
        return;
      }

      focusRetryTimeoutRef.current = window.setTimeout(() => {
        focusRetryTimeoutRef.current = null;
        focusEmbeddedPlayer(attempt + 1);
      }, 120);
    });
  }, [videoModalWrapRef]);

  useEffect(() => {
    clearPendingFocus();
    if (!activeVideo || isEmbedBlocked) {
      return;
    }
    focusEmbeddedPlayer();
  }, [activeVideo, isEmbedBlocked, clearPendingFocus, focusEmbeddedPlayer]);

  useEffect(() => clearPendingFocus, [clearPendingFocus]);

  const openVideoOnYouTube = (): void => {
    if (!activeVideo || typeof window === "undefined") {
      return;
    }
    window.open(activeVideo.videoUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Modal
      title={activeVideo?.title ?? "Video"}
      open={activeVideo !== null}
      onCancel={() => {
        stopPlaylist();
        closeVideoModal();
      }}
      footer={null}
      width={RESPONSIVE_MEDIA_MODAL_WIDTH}
      zIndex={1000}
      destroyOnHidden
      className="video-player-modal"
      afterOpenChange={(open) => {
        clearPendingFocus();
        if (open && activeVideo && !isEmbedBlocked) {
          focusEmbeddedPlayer();
        }
      }}
    >
      {activeVideo ? (
        <Space direction="vertical" size="middle" className="video-player-modal-layout full-width">
          <div ref={videoModalWrapRef} className="video-modal-wrap" tabIndex={0}>
            {isEmbedBlocked ? (
              <div className="video-modal-fallback">
                <Text className="video-modal-fallback-title">Playback is blocked in embeds</Text>
                <Text className="video-modal-fallback-copy">
                  This video still plays on YouTube, but the uploader has disabled embedded playback.
                </Text>
                <Button
                  htmlType="button"
                  className="video-watch-btn modal-save-btn"
                  onClick={openVideoOnYouTube}
                >
                  Watch on YouTube
                </Button>
              </div>
            ) : (
              <iframe
                ref={iframeRef}
                className="video-modal-frame"
                src={embedUrl}
                title={activeVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                tabIndex={-1}
              />
            )}
          </div>
          <div className="speed-controls">
            <div className="speed-controls-left">
              <Button
                htmlType="button"
                className="video-watch-btn modal-save-btn modal-fullscreen-btn"
                aria-label="Toggle fullscreen"
                onClick={toggleVideoFullscreen}
              >
                <span className="btn-icon btn-icon-fullscreen" aria-hidden />
              </Button>
              <Button
                htmlType="button"
                className={`column-move-btn link-copy-btn ${copiedLinkVideoId === activeVideo.videoId ? "is-copied" : ""}`}
                aria-label={`Copy link for ${activeVideo.title}`}
                onClick={() => void copyVideoLink(activeVideo)}
              >
                <span className="btn-icon btn-icon-link" aria-hidden />
              </Button>
              <Button
                htmlType="button"
                className="video-watch-btn modal-save-btn"
                aria-label={`Save ${activeVideo.title}`}
                onClick={() => openSaveVideoModal(activeVideo)}
                disabled={saveDestinationColumnsLength === 0}
              >
                <span className="btn-icon btn-icon-star" aria-hidden />
              </Button>
              <Button
                htmlType="button"
                className="video-watch-btn modal-watch-btn"
                aria-label={`Mark ${activeVideo.title} as watched`}
                onClick={markWatchedAndAdvanceOrClose}
              >
                <span className="btn-icon btn-icon-check" aria-hidden />
              </Button>
              {isPlaylistActive ? (
                <Text className="playlist-progress-text">
                  {playlistIndex + 1} of {playlistQueueLength} |{" "}
                  {playlistScope === "channel"
                    ? playlistChannelLabel || "CHANNEL"
                    : isSavedBoardActive
                      ? "ALL LISTS"
                      : "ALL CHANNELS"}{" "}
                  | {playlistOrderLabel}
                </Text>
              ) : null}
            </div>
          </div>
        </Space>
      ) : null}
    </Modal>
  );
}

export const VideoPlayerModal = memo(VideoPlayerModalComponent);
