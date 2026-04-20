import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VideoPlayerModal } from "./VideoPlayerModal";

describe("VideoPlayerModal", () => {
  it("shows a YouTube fallback when embedded playback is blocked", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(
      <VideoPlayerModal
        activeVideo={{
          videoId: "blocked-vid",
          title: "Blocked Embed Video",
          publishedAt: "2026-03-12T10:00:00Z",
          embeddable: false,
          thumbnailUrl: "https://img.test/video-1.jpg",
          channelTitle: "Stored Channel",
          videoUrl: "https://www.youtube.com/watch?v=blocked-vid",
          viewCount: 4321
        }}
        closeVideoModal={() => undefined}
        stopPlaylist={() => undefined}
        videoModalWrapRef={{ current: null }}
        toggleVideoFullscreen={() => undefined}
        copiedLinkVideoId={null}
        copyVideoLink={async () => undefined}
        openSaveVideoModal={() => undefined}
        saveDestinationColumnsLength={1}
        markWatchedAndAdvanceOrClose={() => undefined}
        isPlaylistActive={false}
        playlistIndex={0}
        playlistQueueLength={0}
        playlistScope="all"
        playlistChannelLabel=""
        isSavedBoardActive={false}
        playlistOrderLabel="NEWEST FIRST"
      />
    );

    expect(screen.getByText("Playback is blocked in embeds")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Watch on YouTube" }));

    expect(openSpy).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=blocked-vid",
      "_blank",
      "noopener,noreferrer"
    );

    openSpy.mockRestore();
  });
});
