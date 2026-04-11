import { memo } from "react";
import { Button, Modal, Space, Typography } from "antd";
import type { VideoItem } from "../types/youtube";

const { Text } = Typography;

type VideoPlayerModalProps = {
  activeVideo: VideoItem | null;
  playerStatusLabel: string | null;
  playerFailed: boolean;
  focusVideoPlayerSurface: () => void;
  closeVideoModal: () => void;
  stopPlaylist: () => void;
  videoModalWrapRef: React.RefObject<HTMLDivElement>;
  setPlayerHost: (node: HTMLDivElement | null) => void;
  toggleVideoFullscreen: () => void;
  isPlayerInteractive: boolean;
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
  availablePlaybackRates: number[];
  playbackRate: number;
  handlePlaybackRateClick: (rate: number) => void;
  openActiveVideoOnYouTube: () => void;
};

function VideoPlayerModalComponent({
  activeVideo,
  playerStatusLabel,
  playerFailed,
  focusVideoPlayerSurface,
  closeVideoModal,
  stopPlaylist,
  videoModalWrapRef,
  setPlayerHost,
  toggleVideoFullscreen,
  isPlayerInteractive,
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
  playlistOrderLabel,
  availablePlaybackRates,
  playbackRate,
  handlePlaybackRateClick,
  openActiveVideoOnYouTube
}: VideoPlayerModalProps) {
  return (
    <Modal
      title={activeVideo?.title ?? "Video"}
      open={activeVideo !== null}
      afterOpenChange={(open) => {
        if (open) {
          focusVideoPlayerSurface();
        }
      }}
      onCancel={() => {
        stopPlaylist();
        closeVideoModal();
      }}
      footer={null}
      width={1125}
      zIndex={1000}
      destroyOnHidden
      className="video-player-modal"
    >
      {activeVideo ? (
        <Space direction="vertical" size="middle" className="full-width">
          <div className="video-player-status-row">
            {playerStatusLabel ? (
              <Text className={`video-meta-feedback ${playerFailed ? "is-error" : "is-info"}`}>
                {playerStatusLabel}
              </Text>
            ) : null}
            {playerFailed ? (
              <Button htmlType="button" className="column-move-btn link-copy-btn" onClick={openActiveVideoOnYouTube}>
                Open on YouTube
              </Button>
            ) : null}
          </div>
          <div ref={videoModalWrapRef} className="video-modal-wrap" tabIndex={0}>
            <div ref={setPlayerHost} tabIndex={-1} className="video-modal-frame" />
          </div>
          <div className="speed-controls">
            <div className="speed-controls-left">
              <Button
                htmlType="button"
                className="video-watch-btn modal-save-btn modal-fullscreen-btn"
                aria-label="Toggle fullscreen"
                onClick={toggleVideoFullscreen}
                disabled={!isPlayerInteractive}
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
            <div className="speed-controls-right">
              {availablePlaybackRates.map((rate) => (
                <Button
                  key={rate}
                  htmlType="button"
                  className="speed-btn"
                  type={playbackRate === rate ? "primary" : "default"}
                  onClick={() => handlePlaybackRateClick(rate)}
                  disabled={!isPlayerInteractive}
                >
                  {rate}x
                </Button>
              ))}
            </div>
          </div>
        </Space>
      ) : null}
    </Modal>
  );
}

export const VideoPlayerModal = memo(VideoPlayerModalComponent);
