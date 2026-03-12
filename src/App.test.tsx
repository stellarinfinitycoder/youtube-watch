import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import * as youtubeApi from "./api/youtube";

describe("App", () => {
  beforeEach(() => {
    if (typeof window.localStorage.removeItem === "function") {
      window.localStorage.removeItem("youtube-watch:handles:v1");
      window.localStorage.removeItem("youtube-watch:columns:v2");
    }
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
          videos: [
            {
              videoId: "vid-1",
              title: "Stored Video",
              publishedAt: "2026-03-12T10:00:00Z",
              thumbnailUrl: "https://img.test/video-1.jpg",
              channelTitle: "Stored Channel",
              videoUrl: "https://www.youtube.com/watch?v=vid-1"
            }
          ]
        }
      ])
    );

    render(<App />);

    expect(screen.getByLabelText("Channel 1 handle")).toHaveValue("@one");
    expect(screen.getByAltText("Channel 1")).toBeInTheDocument();
    expect(screen.getByText("Stored Video")).toBeInTheDocument();
    expect(screen.getByLabelText("Channel 2 placeholder")).toBeInTheDocument();
    expect(screen.getByLabelText("Channel 3 placeholder")).toBeInTheDocument();
  });

  it("enables fetch only when a valid handle is entered per column", () => {
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
          publishedAt: "2026-01-01T12:00:00Z",
          thumbnailUrl: "https://img.test/demo.jpg",
          channelTitle: "Demo Channel",
          videoUrl: "https://www.youtube.com/watch?v=abc123"
        }
      ]
    });

    await waitFor(() => {
      expect(screen.getByText("Demo Video")).toBeInTheDocument();
    });
    expect(screen.getByAltText("Channel 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Channel 2 placeholder")).toBeInTheDocument();
    expect(screen.getByLabelText("Channel 3 placeholder")).toBeInTheDocument();

    expect(spy).toHaveBeenCalledWith("@validhandle", 15);
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

  it("refreshes using current handle", async () => {
    const spy = vi
      .spyOn(youtubeApi, "getLatestVideosAndChannelByHandle")
      .mockResolvedValue({
        channelThumbnailUrl: "",
        videos: []
      });

    render(<App />);
    fireEvent.change(screen.getByLabelText("Channel 1 handle"), {
      target: { value: "@validhandle" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Fetch column 1" }));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    const refreshButton = screen.getByRole("button", {
      name: "Refresh column 1"
    });
    fireEvent.click(refreshButton);

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy).toHaveBeenNthCalledWith(2, "@validhandle", 15);
  });
});
