import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import * as youtubeApi from "./api/youtube";

const originalFetch = global.fetch;

describe("App", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({})
    } as Response) as typeof fetch;

    if (typeof window.localStorage.removeItem === "function") {
      window.localStorage.removeItem("youtube-watch:boards:v1");
      window.localStorage.removeItem("youtube-watch:active-board-id:v1");
      window.localStorage.removeItem("youtube-watch:handles:v1");
      window.localStorage.removeItem("youtube-watch:columns:v2");
      window.localStorage.removeItem("youtube-watch:watched:v1");
      window.localStorage.removeItem("youtube-watch:playback-rate:v1");
    }
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("restores saved handles from localStorage", () => {
    window.localStorage.setItem(
      "youtube-watch:handles:v1",
      JSON.stringify(["@one", "@two", "@three"])
    );

    render(<App />);

    expect(screen.getByLabelText("Channel 1 handle")).toHaveValue("@one");
    expect(screen.getByLabelText("Channel 2 handle")).toHaveValue("@two");
    expect(screen.getByLabelText("Channel 3 handle")).toHaveValue("@three");
  });

  it("renders three independent columns", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "Add column" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fetch column 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fetch column 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fetch column 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove column 1" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Move column \d+ left/i })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /Move column \d+ right/i })).toHaveLength(3);
    expect(
      screen.getByLabelText("Channel 1 placeholder")
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Channel 2 placeholder")
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Channel 3 placeholder")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Channel 1 handle")).toBeInTheDocument();
    expect(screen.getByLabelText("Channel 2 handle")).toBeInTheDocument();
    expect(screen.getByLabelText("Channel 3 handle")).toBeInTheDocument();
  });

  it("restores cached thumbnail and videos from localStorage", () => {
    window.localStorage.setItem(
      "youtube-watch:columns:v2",
      JSON.stringify([
        {
          handleInput: "@one",
          currentHandle: "@one",
          channelThumbnailUrl: "https://img.test/channel-1.jpg",
          lastFetchAt: "11/03/2026, 22:17:03",
          videos: [
            {
              videoId: "vid-1",
              title: "Stored Video",
              publishedAt: "2026-03-12T10:00:00Z",
              thumbnailUrl: "https://img.test/video-1.jpg",
              channelTitle: "Stored Channel",
              videoUrl: "https://www.youtube.com/watch?v=vid-1",
              viewCount: 4321
            }
          ]
        }
      ])
    );

    render(<App />);

    expect(screen.getByLabelText("Channel 1 handle")).toHaveValue("@one");
    expect(screen.getByAltText("Channel 1")).toBeInTheDocument();
    expect(screen.getByText("Stored Video")).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes(", 4k"))).toBeInTheDocument();
    expect(screen.queryByLabelText("Channel 2 placeholder")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Channel 3 placeholder")).not.toBeInTheDocument();
  });

  it("restores zero columns when saved state is empty", () => {
    window.localStorage.setItem("youtube-watch:columns:v2", JSON.stringify([]));

    render(<App />);

    expect(screen.queryByRole("button", { name: "Fetch column 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add column" })).toBeInTheDocument();
  });

  it("switches boards without fetching YouTube data and preloads destination assets", async () => {
    const resolveInputSpy = vi.spyOn(youtubeApi, "resolveChannelByInputWithThumbnail");
    const resolveHandleSpy = vi.spyOn(youtubeApi, "resolveChannelByHandleWithThumbnail");
    const discoverySpy = vi.spyOn(youtubeApi, "fetchPlaylistDiscoveryPage");
    const statsSpy = vi.spyOn(youtubeApi, "fetchVideoStatsByVideoIds");
    const loadedImages: string[] = [];
    const originalImage = global.Image;

    class TestImage {
      decoding = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(value: string) {
        loadedImages.push(value);
        this.onload?.();
      }
    }

    global.Image = TestImage as unknown as typeof Image;
    window.localStorage.setItem(
      "youtube-watch:boards:v1",
      JSON.stringify([
        {
          id: "board-1",
          name: "Board 1",
          kind: "channels",
          columnScopeFilter: ["__all__"],
          watchedVideos: {},
          viewCountRefreshedAtByVideoId: {},
          videoFilter: "all",
          videoDurationFilter: ["all"],
          videoWindowDays: 90,
          defaultPlaybackRate: 1.5,
          columns: [
            {
              id: "column-1",
              handleInput: "@one",
              currentHandle: "@one",
              channelId: "channel-1",
              uploadsPlaylistId: "uploads-1",
              channelThumbnailUrl: "https://yt3.ggpht.com/avatar-one.jpg",
              lastGoodChannelThumbnailUrl: "https://yt3.ggpht.com/avatar-one.jpg",
              videos: [
                {
                  videoId: "video-1",
                  title: "Board One Video",
                  publishedAt: "2099-04-01T10:00:00Z",
                  thumbnailUrl: "https://i.ytimg.com/vi/video-1/hqdefault.jpg",
                  channelTitle: "One",
                  videoUrl: "https://www.youtube.com/watch?v=video-1",
                  viewCount: 1
                }
              ],
              lastFetchAt: null
            }
          ]
        },
        {
          id: "board-2",
          name: "Board 2",
          kind: "channels",
          columnScopeFilter: ["__all__"],
          watchedVideos: {},
          viewCountRefreshedAtByVideoId: {},
          videoFilter: "all",
          videoDurationFilter: ["all"],
          videoWindowDays: 90,
          defaultPlaybackRate: 1.5,
          columns: [
            {
              id: "column-2",
              handleInput: "@two",
              currentHandle: "@two",
              channelId: "channel-2",
              uploadsPlaylistId: "uploads-2",
              channelThumbnailUrl: "https://yt3.ggpht.com/avatar-two.jpg",
              lastGoodChannelThumbnailUrl: "https://yt3.ggpht.com/avatar-two.jpg",
              videos: [
                {
                  videoId: "video-2",
                  title: "Board Two Video",
                  publishedAt: "2099-04-02T10:00:00Z",
                  thumbnailUrl: "https://i.ytimg.com/vi/video-2/hqdefault.jpg",
                  channelTitle: "Two",
                  videoUrl: "https://www.youtube.com/watch?v=video-2",
                  viewCount: 2
                }
              ],
              lastFetchAt: null
            }
          ]
        }
      ])
    );
    window.localStorage.setItem("youtube-watch:active-board-id:v1", "board-1");

    try {
      render(<App />);

      const boardSelect = screen.getByTestId("topbar-board-select");
      fireEvent.mouseDown(
        boardSelect.querySelector(".ant-select-selector") ?? boardSelect
      );
      fireEvent.click(await screen.findByText("BOARD 2"));

      await waitFor(() => {
        expect(screen.getByLabelText("Channel 1 handle")).toHaveValue("@two");
      });
      expect(resolveInputSpy).not.toHaveBeenCalled();
      expect(resolveHandleSpy).not.toHaveBeenCalled();
      expect(discoverySpy).not.toHaveBeenCalled();
      expect(statsSpy).not.toHaveBeenCalled();
      expect(loadedImages).toEqual(
        expect.arrayContaining([
          "/api/youtube/channel-avatar?url=https%3A%2F%2Fyt3.ggpht.com%2Favatar-two.jpg",
          "https://i.ytimg.com/vi/video-2/hqdefault.jpg"
        ])
      );
    } finally {
      global.Image = originalImage;
    }
  });

  it("enables column fetch when that column handle is valid", () => {
    render(<App />);
    const fetchOne = screen.getByRole("button", { name: "Fetch column 1" });
    const columnOneInput = screen.getByLabelText("Channel 1 handle");

    expect(fetchOne).toBeDisabled();
    fireEvent.change(columnOneInput, { target: { value: "@validhandle" } });
    expect(fetchOne).toBeEnabled();
  });

  it("shows loading and then renders fetched videos in a column", async () => {
    let resolveRequest:
      | ((
          value: Awaited<ReturnType<typeof youtubeApi.getLatestVideosAndChannelByHandle>>
        ) => void)
      | null =
      null;
    const spy = vi
      .spyOn(youtubeApi, "getLatestVideosAndChannelByHandle")
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRequest = resolve;
          })
      );

    render(<App />);
    fireEvent.change(screen.getByLabelText("Channel 1 handle"), {
      target: { value: "@validhandle" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Fetch column 1" }));

    expect(await screen.findByText("Loading...")).toBeInTheDocument();
    resolveRequest?.({
      channelThumbnailUrl: "https://img.test/channel.jpg",
      videos: [
        {
          videoId: "abc123",
          title: "Demo Video",
          publishedAt: "2026-03-13T12:00:00Z",
          thumbnailUrl: "https://img.test/demo.jpg",
          channelTitle: "Demo Channel",
          videoUrl: "https://www.youtube.com/watch?v=abc123",
          viewCount: 777
        }
      ]
    });

    await waitFor(() => {
      expect(screen.getByText("Demo Video")).toBeInTheDocument();
    });
    expect(screen.getByText((content) => content.includes(", 777"))).toBeInTheDocument();
    expect(screen.getByAltText("Channel 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Channel 2 placeholder")).toBeInTheDocument();
    expect(screen.getByLabelText("Channel 3 placeholder")).toBeInTheDocument();

    expect(spy).toHaveBeenCalledWith("@validhandle", 50);
  });

  it("shows error alert on request failure", async () => {
    vi.spyOn(youtubeApi, "getLatestVideosAndChannelByHandle").mockRejectedValue(
      new Error("Quota exceeded")
    );

    render(<App />);
    fireEvent.change(screen.getByLabelText("Channel 1 handle"), {
      target: { value: "@validhandle" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Fetch column 1" }));

    await waitFor(() => {
      expect(screen.getByText("Quota exceeded")).toBeInTheDocument();
    });
  });

  it("fetches only the targeted column", async () => {
    const spy = vi
      .spyOn(youtubeApi, "getLatestVideosAndChannelByHandle")
      .mockResolvedValue({
        channelThumbnailUrl: "",
        videos: []
      });

    render(<App />);
    fireEvent.change(screen.getByLabelText("Channel 1 handle"), {
      target: { value: "@validone" }
    });
    fireEvent.change(screen.getByLabelText("Channel 2 handle"), {
      target: { value: "@othertwo" }
    });
    fireEvent.change(screen.getByLabelText("Channel 3 handle"), {
      target: { value: "invalid" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Fetch column 1" }));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy).toHaveBeenNthCalledWith(1, "@validone", 50);
  });

  it("adds and removes columns", () => {
    render(<App />);
    expect(screen.getAllByRole("button", { name: /Fetch column/i })).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Add column" }));
    expect(screen.getAllByRole("button", { name: /Fetch column/i })).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Fetch column 4" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove column 4" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getAllByRole("button", { name: /Fetch column/i })).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Remove column 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove column 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove column 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.queryByRole("button", { name: "Fetch column 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add column" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add column" }));
    expect(screen.getByRole("button", { name: "Fetch column 1" })).toBeInTheDocument();
  });

  it("marks a video as watched, hides it in New filter, and persists state", async () => {
    window.localStorage.setItem(
      "youtube-watch:columns:v2",
      JSON.stringify([
        {
          handleInput: "@one",
          currentHandle: "@one",
          channelThumbnailUrl: "https://img.test/channel-1.jpg",
          lastFetchAt: "11/03/2026, 22:17:03",
          videos: [
            {
              videoId: "vid-1",
              title: "Stored Video",
              publishedAt: "2026-03-12T10:00:00Z",
              thumbnailUrl: "https://img.test/video-1.jpg",
              channelTitle: "Stored Channel",
              videoUrl: "https://www.youtube.com/watch?v=vid-1",
              viewCount: 4321
            }
          ]
        }
      ])
    );

    render(<App />);

    fireEvent.click(
      screen.getByRole("button", { name: "Mark Stored Video as watched" })
    );

    await waitFor(() => {
      expect(screen.queryByText("Stored Video")).not.toBeInTheDocument();
    });

    const persistedBoards = JSON.parse(
      window.localStorage.getItem("youtube-watch:boards:v1") ?? "[]"
    ) as Array<{ watchedVideos?: Record<string, number> }>;
    expect(typeof persistedBoards[0]?.watchedVideos?.["vid-1"]).toBe("number");
  });

  it("shows watched videos in Watched filter and allows restoring them to New", async () => {
    window.localStorage.setItem(
      "youtube-watch:columns:v2",
      JSON.stringify([
        {
          handleInput: "@one",
          currentHandle: "@one",
          channelThumbnailUrl: "https://img.test/channel-1.jpg",
          lastFetchAt: "11/03/2026, 22:17:03",
          videos: [
            {
              videoId: "vid-1",
              title: "Stored Video",
              publishedAt: "2026-03-12T10:00:00Z",
              thumbnailUrl: "https://img.test/video-1.jpg",
              channelTitle: "Stored Channel",
              videoUrl: "https://www.youtube.com/watch?v=vid-1",
              viewCount: 4321
            }
          ]
        }
      ])
    );
    window.localStorage.setItem(
      "youtube-watch:watched:v1",
      JSON.stringify({ "vid-1": true })
    );

    render(<App />);

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Video filter" }));
    fireEvent.click(await screen.findByText("WATCHED"));

    expect(screen.getByText("Stored Video")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark Stored Video as new" }));

    await waitFor(() => {
      expect(screen.queryByText("Stored Video")).not.toBeInTheDocument();
    });

    const persistedBoards = JSON.parse(
      window.localStorage.getItem("youtube-watch:boards:v1") ?? "[]"
    ) as Array<{ watchedVideos?: Record<string, number> }>;
    expect(persistedBoards[0]?.watchedVideos).toEqual({});
  });
});
