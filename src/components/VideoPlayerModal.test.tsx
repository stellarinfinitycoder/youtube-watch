import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VideoPlayerModal } from "./VideoPlayerModal";

describe("VideoPlayerModal", () => {
  beforeEach(() => {
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      ((element: Element) =>
        ({
          getPropertyValue: () => "",
          overflow: element instanceof HTMLElement ? element.style.overflow || "" : ""
        }) as CSSStyleDeclaration) as typeof window.getComputedStyle
    );
  });

  it("focuses the embedded player after the modal opens", () => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const focusOrder: string[] = [];
    const focusSpy = vi
      .spyOn(HTMLElement.prototype, "focus")
      .mockImplementation(function focusMock(this: HTMLElement) {
        if (this.classList.contains("video-modal-wrap")) {
          focusOrder.push("wrapper");
          return;
        }
        if (this.tagName === "IFRAME") {
          focusOrder.push("iframe");
        }
      });

    render(
      <VideoPlayerModal
        activeVideo={{
          videoId: "focused-vid",
          title: "Focused Embed Video",
          publishedAt: "2026-03-12T10:00:00Z",
          embeddable: true,
          thumbnailUrl: "https://img.test/video-1.jpg",
          channelTitle: "Stored Channel",
          videoUrl: "https://www.youtube.com/watch?v=focused-vid",
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

    act(() => {
      vi.runAllTimers();
    });

    expect(focusSpy).toHaveBeenCalled();
    expect(focusOrder[0]).toBe("wrapper");
    expect(focusOrder).toContain("iframe");
    expect(focusOrder.indexOf("iframe")).toBeGreaterThan(focusOrder.indexOf("wrapper"));

    vi.useRealTimers();
  });

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
