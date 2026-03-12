import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import * as youtubeApi from "./api/youtube";

describe("App", () => {
  it("disables submit for invalid input", () => {
    render(<App />);
    const submit = screen.getByRole("button", { name: "Fetch Latest 15" });
    const input = screen.getByPlaceholderText("@channel");

    expect(submit).toBeDisabled();
    fireEvent.change(input, { target: { value: "@validhandle" } });
    expect(submit).toBeEnabled();
  });

  it("renders loading and then video cards", async () => {
    let resolveRequest: ((value: Awaited<ReturnType<typeof youtubeApi.getLatestVideosByHandle>>) => void) | null =
      null;
    const spy = vi
      .spyOn(youtubeApi, "getLatestVideosByHandle")
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRequest = resolve;
          })
      );

    render(<App />);
    fireEvent.change(screen.getByPlaceholderText("@channel"), {
      target: { value: "@validhandle" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Fetch Latest 15" }));

    expect(await screen.findByText("Loading videos...")).toBeInTheDocument();
    resolveRequest?.([
      {
        videoId: "abc123",
        title: "Demo Video",
        publishedAt: "2026-01-01T12:00:00Z",
        thumbnailUrl: "https://img.test/demo.jpg",
        channelTitle: "Demo Channel",
        videoUrl: "https://www.youtube.com/watch?v=abc123"
      }
    ]);

    await waitFor(() => {
      expect(screen.getByText("Demo Video")).toBeInTheDocument();
    });

    expect(spy).toHaveBeenCalledWith("@validhandle", 15);
  });

  it("shows error alert on request failure", async () => {
    vi.spyOn(youtubeApi, "getLatestVideosByHandle").mockRejectedValue(
      new Error("Quota exceeded")
    );

    render(<App />);
    fireEvent.change(screen.getByPlaceholderText("@channel"), {
      target: { value: "@validhandle" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Fetch Latest 15" }));

    await waitFor(() => {
      expect(screen.getByText("Quota exceeded")).toBeInTheDocument();
    });
  });

  it("refreshes using current handle", async () => {
    const spy = vi
      .spyOn(youtubeApi, "getLatestVideosByHandle")
      .mockResolvedValue([]);

    render(<App />);
    fireEvent.change(screen.getByPlaceholderText("@channel"), {
      target: { value: "@validhandle" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Fetch Latest 15" }));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    const refreshButton = screen.getByRole("button", { name: /Refresh/ });
    fireEvent.click(refreshButton);

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy).toHaveBeenNthCalledWith(2, "@validhandle", 15);
  });
});
