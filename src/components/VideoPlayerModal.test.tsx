import { useEffect, type ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VideoPlayerModal } from "./VideoPlayerModal";

vi.mock("antd", async () => {
  const actual = await vi.importActual<typeof import("antd")>("antd");

  return {
    ...actual,
    Modal: ({
      title,
      open,
      children,
      className,
      width,
      onCancel,
      afterOpenChange
    }: {
      title?: ReactNode;
      open?: boolean;
      children?: ReactNode;
      className?: string;
      width?: string | number;
      onCancel?: () => void;
      afterOpenChange?: (open: boolean) => void;
    }) => {
      useEffect(() => {
        afterOpenChange?.(Boolean(open));
      }, [afterOpenChange, open]);

      if (!open) {
        return null;
      }

      return (
        <div className={className} data-modal-width={String(width ?? "")}>
          <div className="ant-modal">
            <button aria-label="Close" onClick={onCancel} type="button" />
            <div aria-label={typeof title === "string" ? title : "Video"} className="ant-modal-content" role="dialog">
              {children}
            </div>
          </div>
        </div>
      );
    }
  };
});

const activeVideo = {
  videoId: "focused-vid",
  title: "Focused Embed Video",
  publishedAt: "2026-03-12T10:00:00Z",
  embeddable: true,
  thumbnailUrl: "https://img.test/video-1.jpg",
  channelTitle: "Stored Channel",
  videoUrl: "https://www.youtube.com/watch?v=focused-vid",
  viewCount: 4321
};

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

  it("uses a responsive modal width with a large-screen cap", () => {
    render(
      <VideoPlayerModal
        activeVideo={activeVideo}
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

    const modalRoot = screen.getByRole("dialog").closest(".video-player-modal");
    expect(modalRoot).not.toBeNull();
    expect(modalRoot).toHaveAttribute(
      "data-modal-width",
      "min(1680px, 92vw, max(0px, calc((100dvh - 300px) * 16 / 9)))"
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
        activeVideo={activeVideo}
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
