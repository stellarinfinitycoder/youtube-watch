import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import * as youtubeApi from "./api/youtube";
import { resetCacheDbForTests } from "./storage/indexedDbCache";

const originalFetch = global.fetch;
const DISCOVERY_IGNORE_STORAGE_KEY = "youtube-watch:discovery-ignore:v1";

function makeResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => data
  } as Response;
}

function seedStoredBoards(options?: {
  videoFilter?: "all" | "new" | "watched";
  watchedVideos?: Record<string, number>;
  includeWatchedVideo?: boolean;
}): void {
  const videos = [
    {
      videoId: "active-seed-video",
      title: "Active Seed Video about agents",
      publishedAt: "2026-05-17T00:00:00Z",
      thumbnailUrl: "https://img.test/active.jpg",
      channelTitle: "Active Channel",
      videoUrl: "https://www.youtube.com/watch?v=active-seed-video",
      viewCount: 100
    },
    ...(options?.includeWatchedVideo
      ? [
          {
            videoId: "watched-hidden-video",
            title: "Watched Hidden Video should not seed",
            publishedAt: "2026-05-16T00:00:00Z",
            thumbnailUrl: "https://img.test/watched.jpg",
            channelTitle: "Active Channel",
            videoUrl: "https://www.youtube.com/watch?v=watched-hidden-video",
            viewCount: 90
          }
        ]
      : [])
  ];
  window.localStorage.setItem(
    "youtube-watch:boards:v1",
    JSON.stringify([
      {
        id: "board-active",
        name: "AI",
        kind: "channels",
        columnScopeFilter: ["__all__"],
        columns: [
          {
            id: "col-active",
            handleInput: "@active",
            currentHandle: "@active",
              channelId: "channel-active",
              uploadsPlaylistId: "uploads-active",
              channelThumbnailUrl: "",
              videos,
              lastFetchAt: null
            }
          ],
          watchedVideos: options?.watchedVideos ?? {},
          videoFilter: options?.videoFilter ?? "all",
          videoWindowDays: 90,
          defaultPlaybackRate: 1.5
        },
      {
        id: "board-other",
        name: "OTHER",
        kind: "channels",
        columnScopeFilter: ["__all__"],
        columns: [
          {
            id: "col-other",
            handleInput: "@other",
            currentHandle: "@other",
            channelId: "channel-other",
            uploadsPlaylistId: "uploads-other",
            channelThumbnailUrl: "",
            videos: [],
            lastFetchAt: null
          }
        ],
        watchedVideos: {},
        videoFilter: "all",
        videoWindowDays: 90,
        defaultPlaybackRate: 1.5
      }
    ])
  );
  window.localStorage.setItem("youtube-watch:active-board-id:v1", "board-active");
}

function mockSeedGeneration(
  summary = "llm ai discovery seed\nagent coding workflows\nautomation developer tools"
): ReturnType<
  typeof vi.spyOn<typeof youtubeApi, "fetchSummaryByVideoInput">
> {
  return vi.spyOn(youtubeApi, "fetchSummaryByVideoInput").mockResolvedValue({
    videoId: "discovery-seed:board-active:1",
    model: "openai/gpt-4o-mini",
    summary,
    keyPoints: []
  });
}

function makeDiscoverySuccessResult() {
  return {
    videos: [
      {
        videoId: "existing-active-video",
        title: "Existing active result",
        publishedAt: "2026-05-01T00:00:00Z",
        thumbnailUrl: "https://img.test/existing-active-video.jpg",
        channelTitle: "Existing Active",
        videoUrl: "https://www.youtube.com/watch?v=existing-active-video",
        viewCount: 100,
        channelId: "channel-active",
        channelThumbnailUrl: "https://img.test/existing-active.jpg",
        uploadsPlaylistId: "uploads-active",
        channelHandle: "@active",
        channelUrl: "https://www.youtube.com/@active",
        matchReason: "Matched board video",
        matchedSeed: "active seed",
        score: 100,
        alreadyOnBoard: true
      },
      {
        videoId: "existing-other-video",
        title: "Existing other result",
        publishedAt: "2026-05-01T00:00:00Z",
        thumbnailUrl: "https://img.test/existing-other-video.jpg",
        channelTitle: "Existing Other",
        videoUrl: "https://www.youtube.com/watch?v=existing-other-video",
        viewCount: 100,
        channelId: "channel-other",
        channelThumbnailUrl: "https://img.test/existing-other.jpg",
        uploadsPlaylistId: "uploads-other",
        channelHandle: "@other",
        channelUrl: "https://www.youtube.com/@other",
        matchReason: "Matched board video",
        matchedSeed: "active seed",
        score: 90,
        alreadyOnBoard: true
      },
      {
        videoId: "new-one-video",
        title: "New one result",
        publishedAt: "2026-05-01T00:00:00Z",
        thumbnailUrl: "https://img.test/new-one-video.jpg",
        channelTitle: "New One",
        videoUrl: "https://www.youtube.com/watch?v=new-one-video",
        viewCount: 100,
        channelId: "channel-new-one",
        channelThumbnailUrl: "https://img.test/new-one.jpg",
        uploadsPlaylistId: "uploads-new-one",
        channelHandle: "@newone",
        channelUrl: "https://www.youtube.com/@newone",
        matchReason: "Matched search seed",
        matchedSeed: "edited ai channels",
        score: 80,
        alreadyOnBoard: false
      },
      {
        videoId: "new-two-video",
        title: "New two result",
        publishedAt: "2026-05-01T00:00:00Z",
        thumbnailUrl: "https://img.test/new-two-video.jpg",
        channelTitle: "New Two",
        videoUrl: "https://www.youtube.com/watch?v=new-two-video",
        viewCount: 100,
        channelId: "channel-new-two",
        channelThumbnailUrl: "https://img.test/new-two.jpg",
        uploadsPlaylistId: "uploads-new-two",
        channelHandle: "@newtwo",
        channelUrl: "https://www.youtube.com/@newtwo",
        matchReason: "Matched search seed",
        matchedSeed: "edited ai channels",
        score: 70,
        alreadyOnBoard: false
      }
    ],
    searchedSeeds: [
      {
        query: "edited ai channels",
        source: "manual",
        sourceTitle: "Active Seed Video about agents"
      }
    ],
    estimatedQuotaUnits: 102
  };
}

function mockDiscoverySuccess(): {
  discoverSpy: ReturnType<typeof vi.spyOn>;
  playlistSpy: ReturnType<typeof vi.spyOn>;
} {
  const discoverSpy = vi.spyOn(youtubeApi, "discoverSimilarVideos").mockResolvedValue(
    makeDiscoverySuccessResult()
  );
  const playlistSpy = vi.spyOn(youtubeApi, "fetchPlaylistDiscoveryPage").mockResolvedValue({
    videos: [],
    nextPageToken: null
  });
  vi.spyOn(youtubeApi, "fetchVideoStatsByVideoIds").mockResolvedValue({});
  return { discoverSpy, playlistSpy };
}

async function openDiscoverySeedModal(): Promise<void> {
  fireEvent.click(screen.getByTestId("topbar-discover-videos"));
  await screen.findByLabelText("Discovery search seed 1");
}

describe("App discovery board", () => {
  beforeEach(async () => {
    await resetCacheDbForTests();
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({})
    } as Response) as typeof fetch;
    window.localStorage.clear();
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      ((element: Element) =>
        ({
          getPropertyValue: () => "",
          overflow: element instanceof HTMLElement ? element.style.overflow || "" : ""
        }) as CSSStyleDeclaration) as typeof window.getComputedStyle
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it("opens an empty editable seed modal before calling summary or discovery", async () => {
    const summarySpy = mockSeedGeneration();
    const { discoverSpy } = mockDiscoverySuccess();
    seedStoredBoards({
      videoFilter: "new",
      includeWatchedVideo: true,
      watchedVideos: { "watched-hidden-video": 1 }
    });

    render(<App />);
    await openDiscoverySeedModal();

    expect(screen.getByRole("dialog", { name: "CREATE DISCOVERY BOARD" })).toBeInTheDocument();
    expect(screen.getByLabelText("Discovery search seed 1")).toHaveValue("");
    expect(screen.getByLabelText("Discovery search seed 2")).toHaveValue("");
    expect(screen.getByLabelText("Discovery search seed 3")).toHaveValue("");
    const llmSeedButton = screen.getByRole("button", { name: "Generate discovery seeds with LLM" });
    expect(llmSeedButton).toContainElement(llmSeedButton.querySelector(".btn-icon-llm"));
    expect(llmSeedButton).not.toHaveTextContent("L");
    expect(screen.getByRole("button", { name: "CREATE" })).toBeDisabled();
    expect(summarySpy).not.toHaveBeenCalled();
    expect(discoverSpy).not.toHaveBeenCalled();
  });

  it("fills seed inputs from shown video titles when L is clicked", async () => {
    const summarySpy = mockSeedGeneration();
    const { discoverSpy } = mockDiscoverySuccess();
    seedStoredBoards({
      videoFilter: "new",
      includeWatchedVideo: true,
      watchedVideos: { "watched-hidden-video": 1 }
    });

    render(<App />);
    await openDiscoverySeedModal();
    fireEvent.click(screen.getByRole("button", { name: "Generate discovery seeds with LLM" }));

    expect(await screen.findByDisplayValue("llm ai discovery seed")).toBeInTheDocument();
    expect(screen.getByLabelText("Discovery search seed 2")).toHaveValue("agent coding workflows");
    expect(screen.getByLabelText("Discovery search seed 3")).toHaveValue(
      "automation developer tools"
    );
    expect(summarySpy).toHaveBeenCalledTimes(1);
    expect(summarySpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        videoId: expect.stringMatching(/^discovery-seed:board-active:/),
        transcriptText: "Active Seed Video about agents",
        mode: "short",
        prompt: expect.stringContaining("Create exactly 3 distinct YouTube search keyword seeds")
      })
    );
    expect(summarySpy.mock.calls[0]?.[0].model).toBeUndefined();
    expect(summarySpy.mock.calls[0]?.[0].transcriptText).not.toContain(
      "Watched Hidden Video should not seed"
    );
    expect(discoverSpy).not.toHaveBeenCalled();
  });

  it("spins only the LLM button while generating seeds", async () => {
    let resolveSummary:
      | ((value: { videoId: string; model: string; summary: string; keyPoints: string[] }) => void)
      | null = null;
    vi.spyOn(youtubeApi, "fetchSummaryByVideoInput").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSummary = resolve;
        })
    );
    mockDiscoverySuccess();
    seedStoredBoards();

    render(<App />);
    await openDiscoverySeedModal();

    const logo = screen.getByTestId("topbar-logo");
    const llmSeedButton = screen.getByRole("button", { name: "Generate discovery seeds with LLM" });
    fireEvent.click(llmSeedButton);

    await waitFor(() => {
      expect(llmSeedButton).toHaveAttribute("aria-busy", "true");
      expect(llmSeedButton.querySelector(".btn-icon-llm")).toHaveClass("is-spinning");
    });
    expect(logo).not.toHaveClass("is-spinning");

    resolveSummary?.({
      videoId: "discovery-seed:board-active:1",
      model: "openai/gpt-4o-mini",
      summary: "llm ai discovery seed",
      keyPoints: []
    });

    await waitFor(() => {
      expect(llmSeedButton).toHaveAttribute("aria-busy", "false");
      expect(llmSeedButton.querySelector(".btn-icon-llm")).not.toHaveClass("is-spinning");
    });
    expect(logo).not.toHaveClass("is-spinning");
  });

  it("creates a discovery board from edited search seeds", async () => {
    const { discoverSpy, playlistSpy } = mockDiscoverySuccess();
    seedStoredBoards();

    render(<App />);
    await openDiscoverySeedModal();

    fireEvent.change(screen.getByLabelText("Discovery search seed 1"), {
      target: { value: "edited ai channels" }
    });
    fireEvent.change(screen.getByLabelText("Discovery search seed 2"), {
      target: { value: "developer agent workflows" }
    });
    fireEvent.change(screen.getByLabelText("Discovery search seed 3"), {
      target: { value: "" }
    });
    fireEvent.click(screen.getByRole("button", { name: "CREATE" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Channel 1 handle")).toHaveValue("@newone");
      expect(screen.getByLabelText("Channel 2 handle")).toHaveValue("@newtwo");
    });
    expect(discoverSpy).toHaveBeenCalledWith({
      seeds: [
        {
          query: "edited ai channels",
          source: "manual",
          sourceTitle: "Shown video titles"
        },
        {
          query: "developer agent workflows",
          source: "manual",
          sourceTitle: "Shown video titles"
        }
      ],
      existingChannelIds: expect.arrayContaining(["channel-active", "channel-other"]),
      maxSeeds: 3,
      resultsPerSeed: 50
    });
    await waitFor(() => {
      expect(playlistSpy).toHaveBeenCalledWith("uploads-new-one", "", 50);
      expect(playlistSpy).toHaveBeenCalledWith("uploads-new-two", "", 50);
    });
  });

  it("switches to the discovery board before discovered channels populate", async () => {
    let resolveDiscover:
      | ((value: Awaited<ReturnType<typeof youtubeApi.discoverSimilarVideos>>) => void)
      | null = null;
    const discoverSpy = vi.spyOn(youtubeApi, "discoverSimilarVideos").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDiscover = resolve;
        })
    );
    const playlistSpy = vi.spyOn(youtubeApi, "fetchPlaylistDiscoveryPage").mockResolvedValue({
      videos: [],
      nextPageToken: null
    });
    vi.spyOn(youtubeApi, "fetchVideoStatsByVideoIds").mockResolvedValue({});
    seedStoredBoards();

    render(<App />);
    await openDiscoverySeedModal();

    fireEvent.change(screen.getByLabelText("Discovery search seed 1"), {
      target: { value: "edited ai channels" }
    });
    fireEvent.click(screen.getByRole("button", { name: "CREATE" }));

    await waitFor(() => {
      expect(screen.queryByDisplayValue("@active")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Fetch column 1" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add column" })).toBeInTheDocument();
      expect(screen.getByText("DISCOVERY 1")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Summarize all shown videos" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Play all videos" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy all shown links on board" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mark all shown videos watched" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create discovery board" })).toBeDisabled();
    expect(discoverSpy).toHaveBeenCalledTimes(1);
    expect(playlistSpy).not.toHaveBeenCalled();

    await act(async () => {
      resolveDiscover?.(makeDiscoverySuccessResult());
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Channel 1 handle")).toHaveValue("@newone");
      expect(screen.getByLabelText("Channel 2 handle")).toHaveValue("@newtwo");
    });
  });

  it("does not create a board when the editable seed modal is canceled", async () => {
    const { discoverSpy } = mockDiscoverySuccess();
    seedStoredBoards();

    render(<App />);
    await openDiscoverySeedModal();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(discoverSpy).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Channel 2 handle")).not.toBeInTheDocument();
  });

  it("does not submit a too-short edited search seed", async () => {
    const { discoverSpy } = mockDiscoverySuccess();
    seedStoredBoards();

    render(<App />);
    await openDiscoverySeedModal();
    fireEvent.change(screen.getByLabelText("Discovery search seed 1"), {
      target: { value: "ai" }
    });
    fireEvent.change(screen.getByLabelText("Discovery search seed 2"), {
      target: { value: "" }
    });
    fireEvent.change(screen.getByLabelText("Discovery search seed 3"), {
      target: { value: "" }
    });

    expect(screen.getByRole("button", { name: "CREATE" })).toBeDisabled();
    expect(discoverSpy).not.toHaveBeenCalled();
  });

  it("dedupes and ignores blank LLM discovery seeds before submission while preserving three fields", async () => {
    mockSeedGeneration("1. Duplicate Seed\n- duplicate seed\n\"\"");
    const { discoverSpy } = mockDiscoverySuccess();
    seedStoredBoards();

    render(<App />);
    await openDiscoverySeedModal();
    fireEvent.click(screen.getByRole("button", { name: "Generate discovery seeds with LLM" }));

    expect(await screen.findByDisplayValue("Duplicate Seed")).toBeInTheDocument();
    expect(screen.getByLabelText("Discovery search seed 2")).toHaveValue("");
    expect(screen.getByLabelText("Discovery search seed 3")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "CREATE" }));

    await waitFor(() => {
      expect(discoverSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          seeds: [
            {
              query: "Duplicate Seed",
              source: "manual",
              sourceTitle: "Shown video titles"
            }
          ],
          maxSeeds: 3,
          resultsPerSeed: 50
        })
      );
    });
  });

  it("excludes ignored channels from future discovery boards", async () => {
    mockDiscoverySuccess();
    seedStoredBoards();
    window.localStorage.setItem(
      DISCOVERY_IGNORE_STORAGE_KEY,
      JSON.stringify(["channel-new-one"])
    );

    render(<App />);
    await openDiscoverySeedModal();
    fireEvent.change(screen.getByLabelText("Discovery search seed 1"), {
      target: { value: "manual discovery seed" }
    });
    fireEvent.click(screen.getByRole("button", { name: "CREATE" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Channel 1 handle")).toHaveValue("@newtwo");
    });
    expect(screen.queryByDisplayValue("@newone")).not.toBeInTheDocument();
  });

  it("adds a deleted discovery board channel to the ignore list", async () => {
    mockDiscoverySuccess();
    seedStoredBoards();

    render(<App />);
    await openDiscoverySeedModal();
    fireEvent.change(screen.getByLabelText("Discovery search seed 1"), {
      target: { value: "manual discovery seed" }
    });
    fireEvent.click(screen.getByRole("button", { name: "CREATE" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Channel 1 handle")).toHaveValue("@newone");
    });
    fireEvent.click(screen.getAllByTestId("column-delete")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(
        JSON.parse(window.localStorage.getItem(DISCOVERY_IGNORE_STORAGE_KEY) ?? "[]")
      ).toContain("channel-new-one");
    });
  });

  it("does not ignore channels deleted from normal channel boards", async () => {
    seedStoredBoards();

    render(<App />);
    fireEvent.click(screen.getAllByTestId("column-delete")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByLabelText("Channel 1 handle")).not.toBeInTheDocument();
    });
    expect(
      JSON.parse(window.localStorage.getItem(DISCOVERY_IGNORE_STORAGE_KEY) ?? "[]")
    ).not.toContain("channel-active");
  });

  it("shows an error when the LLM returns no usable discovery seed", async () => {
    mockSeedGeneration("  ");
    const { discoverSpy } = mockDiscoverySuccess();
    seedStoredBoards();

    render(<App />);
    fireEvent.click(screen.getByTestId("topbar-discover-videos"));
    await screen.findByLabelText("Discovery search seed 1");
    fireEvent.click(screen.getByRole("button", { name: "Generate discovery seeds with LLM" }));

    expect(await screen.findByText("Failed to generate a usable discovery seed.")).toBeInTheDocument();
    expect(screen.getByLabelText("Discovery search seed 1")).toHaveValue("");
    expect(discoverSpy).not.toHaveBeenCalled();
  });
});
