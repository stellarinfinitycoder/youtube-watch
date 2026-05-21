import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppTopbar } from "./AppTopbar";

describe("AppTopbar", () => {
  beforeEach(() => {
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      ((element: Element) =>
        ({
          getPropertyValue: () => "",
          overflow: element instanceof HTMLElement ? element.style.overflow || "" : ""
        }) as CSSStyleDeclaration) as typeof window.getComputedStyle
    );
  });

  it("opens stats from settings and keeps the logo clickable without hover text", () => {
    const fetchAllColumns = vi.fn();

    render(
      <AppTopbar
        buildInfoLabel="dev-build"
        lastApiQueryUnits={12}
        totalApiQueryUnits={34}
        topBarLogoSrc="/svg/logo-dev.svg"
        isLogoSpinning={false}
        isFetchingVideos={false}
        isSavedBoardActive={false}
        topbarLastFetchLabel="Today at 10:00"
        fetchAllColumns={fetchAllColumns}
        appTheme="dark"
        toggleAppTheme={() => undefined}
        activeBoardId="board-1"
        displayedBoards={[{ id: "board-1", name: "Board", kind: "channels" }]}
        newBoardOptionValue="__new__"
        boardDropdownListHeight={320}
        handleBoardSelectChange={() => undefined}
        onBoardSelectorPrewarm={() => undefined}
        blurActiveTopbarControl={() => undefined}
        moveBoard={() => undefined}
        openRenameBoardModal={() => undefined}
        columnScopeFilter={[]}
        isColumnScopeDisabled={false}
        columnScopeDropdownListHeight={240}
        formatColumnScopeSummary={() => "ALL"}
        columnScopeOptions={[]}
        onColumnScopeChange={() => undefined}
        videoFilter="all"
        onVideoFilterChange={() => undefined}
        videoWindowDays={30}
        onVideoWindowChange={() => undefined}
        savedVideoWindowSelectOptions={[]}
        channelVideoWindowSelectOptions={[]}
        videoDurationFilter={[]}
        onVideoDurationChange={() => undefined}
        formatDurationFilterSummary={() => "ANY"}
        videoDurationFilterOptions={[]}
        startBoardSummaryBatch={() => undefined}
        isBoardSummaryBatchRunning={false}
        openVideoDiscovery={() => undefined}
        playAllVideos={() => undefined}
        copyAllShownBoardLinks={async () => undefined}
        copiedLinkVideoId={null}
        openBulkWatchBoardAction={() => undefined}
        openMaintenanceMenuExport={() => undefined}
        openMaintenanceMenuRestore={() => undefined}
        openMaintenanceMenuLogs={() => undefined}
        openMaintenanceMenuBoardDurationBackfill={() => undefined}
        openMaintenanceMenuRefreshBoardAvatars={() => undefined}
        openMaintenanceMenuDeleteSummaries={() => undefined}
        canOpenMaintenanceBoardDurationBackfill={true}
        canOpenMaintenanceRefreshBoardAvatars={true}
        shownVideosTotal={5}
        areBoardActionsDisabled={false}
        scrollToEdge={() => undefined}
        scrollColumns={() => undefined}
      />
    );

    expect(screen.queryByText("FETCH ALL NEW VIDEOS FOR THIS BOARD.")).not.toBeInTheDocument();
    const actionStrip = screen.getByRole("button", { name: "Fetch all shown channels" }).closest(".topbar-action-strip");
    expect(actionStrip).not.toBeNull();
    expect(screen.getByRole("button", { name: "Fetch all shown channels" }).closest(".topbar-action-group-left")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Summarize all shown videos" }).closest(".topbar-action-strip")).toBe(actionStrip);
    expect(screen.getByRole("button", { name: "Play all videos" }).closest(".topbar-action-strip")).toBe(actionStrip);
    expect(screen.getByRole("button", { name: "Copy all shown links on board" }).closest(".topbar-action-strip")).toBe(actionStrip);
    expect(screen.getByRole("button", { name: "Mark all shown videos watched" }).closest(".topbar-action-strip")).toBe(actionStrip);
    expect(screen.getByRole("button", { name: "Create discovery board" }).closest(".topbar-action-strip")).toBe(actionStrip);
    expect(
      Boolean(
        screen
          .getByRole("button", { name: "Mark all shown videos watched" })
          .compareDocumentPosition(screen.getByRole("button", { name: "Create discovery board" })) &
          Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Open maintenance menu" }).closest(".topbar-action-strip")).toBe(actionStrip);
    const scrollControls = screen.getByRole("button", { name: "Scroll columns to first" }).closest(".columns-scroll-controls");
    expect(scrollControls).not.toBeNull();
    expect(scrollControls?.closest(".topbar-action-strip")).toBe(actionStrip);
    expect(screen.getByRole("button", { name: "Scroll columns left" }).closest(".columns-scroll-controls")).toBe(scrollControls);
    expect(screen.getByRole("button", { name: "Scroll columns right" }).closest(".columns-scroll-controls")).toBe(scrollControls);
    expect(screen.getByRole("button", { name: "Scroll columns to last" }).closest(".columns-scroll-controls")).toBe(scrollControls);

    fireEvent.click(screen.getByTestId("topbar-logo"));
    expect(fetchAllColumns).toHaveBeenCalledTimes(1);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Open maintenance menu" }));
    });
    act(() => {
      fireEvent.click(screen.getByText("OPEN INFO"));
    });

    expect(screen.getByText("LAST FETCH: Today at 10:00")).toBeInTheDocument();
    expect(screen.getByText("LAST API QUERY: 12")).toBeInTheDocument();
    expect(screen.getByText("TOTAL API QUERIES TODAY: 34")).toBeInTheDocument();
    expect(screen.getByText("MAX FETCHED VIDEO AGE: 90 DAYS")).toBeInTheDocument();
    expect(screen.getByText("MAX WATCHED VIDEO AGE: 90 DAYS")).toBeInTheDocument();
    expect(screen.getByText("MAX SAVED VIDEO AGE: UNLIMITED")).toBeInTheDocument();
    expect(screen.getByText("VERSION: dev-build")).toBeInTheDocument();
    expect(screen.queryByText("FETCH ALL NEW VIDEOS FOR THIS BOARD.")).not.toBeInTheDocument();
  });

  it("toggles theme from the settings menu", () => {
    const toggleAppTheme = vi.fn();

    render(
      <AppTopbar
        buildInfoLabel="dev-build"
        lastApiQueryUnits={0}
        totalApiQueryUnits={0}
        topBarLogoSrc="/svg/logo-dev.svg"
        isLogoSpinning={false}
        isFetchingVideos={false}
        isSavedBoardActive={false}
        topbarLastFetchLabel="-"
        fetchAllColumns={() => undefined}
        appTheme="lite"
        toggleAppTheme={toggleAppTheme}
        activeBoardId="board-1"
        displayedBoards={[{ id: "board-1", name: "Board", kind: "channels" }]}
        newBoardOptionValue="__new__"
        boardDropdownListHeight={320}
        handleBoardSelectChange={() => undefined}
        onBoardSelectorPrewarm={() => undefined}
        blurActiveTopbarControl={() => undefined}
        moveBoard={() => undefined}
        openRenameBoardModal={() => undefined}
        columnScopeFilter={[]}
        isColumnScopeDisabled={false}
        columnScopeDropdownListHeight={240}
        formatColumnScopeSummary={() => "ALL"}
        columnScopeOptions={[]}
        onColumnScopeChange={() => undefined}
        videoFilter="all"
        onVideoFilterChange={() => undefined}
        videoWindowDays={30}
        onVideoWindowChange={() => undefined}
        savedVideoWindowSelectOptions={[]}
        channelVideoWindowSelectOptions={[]}
        videoDurationFilter={[]}
        onVideoDurationChange={() => undefined}
        formatDurationFilterSummary={() => "ANY"}
        videoDurationFilterOptions={[]}
        startBoardSummaryBatch={() => undefined}
        isBoardSummaryBatchRunning={false}
        openVideoDiscovery={() => undefined}
        playAllVideos={() => undefined}
        copyAllShownBoardLinks={async () => undefined}
        copiedLinkVideoId={null}
        openBulkWatchBoardAction={() => undefined}
        openMaintenanceMenuExport={() => undefined}
        openMaintenanceMenuRestore={() => undefined}
        openMaintenanceMenuLogs={() => undefined}
        openMaintenanceMenuBoardDurationBackfill={() => undefined}
        openMaintenanceMenuRefreshBoardAvatars={() => undefined}
        openMaintenanceMenuDeleteSummaries={() => undefined}
        canOpenMaintenanceBoardDurationBackfill={false}
        canOpenMaintenanceRefreshBoardAvatars={false}
        shownVideosTotal={1}
        areBoardActionsDisabled={false}
        scrollToEdge={() => undefined}
        scrollColumns={() => undefined}
      />
    );

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Open maintenance menu" }));
    });
    act(() => {
      fireEvent.click(screen.getByText("SWITCH TO DARK"));
    });

    expect(toggleAppTheme).toHaveBeenCalledTimes(1);
  });

  it("creates a discovery board from the topbar discovery button and omits the settings link", () => {
    const openVideoDiscovery = vi.fn();

    render(
      <AppTopbar
        buildInfoLabel="dev-build"
        lastApiQueryUnits={0}
        totalApiQueryUnits={0}
        topBarLogoSrc="/svg/logo-dev.svg"
        isLogoSpinning={false}
        isFetchingVideos={false}
        isSavedBoardActive={false}
        topbarLastFetchLabel="-"
        fetchAllColumns={() => undefined}
        appTheme="dark"
        toggleAppTheme={() => undefined}
        activeBoardId="board-1"
        displayedBoards={[{ id: "board-1", name: "Board", kind: "channels" }]}
        newBoardOptionValue="__new__"
        boardDropdownListHeight={320}
        handleBoardSelectChange={() => undefined}
        onBoardSelectorPrewarm={() => undefined}
        blurActiveTopbarControl={() => undefined}
        moveBoard={() => undefined}
        openRenameBoardModal={() => undefined}
        columnScopeFilter={[]}
        isColumnScopeDisabled={false}
        columnScopeDropdownListHeight={240}
        formatColumnScopeSummary={() => "ALL"}
        columnScopeOptions={[]}
        onColumnScopeChange={() => undefined}
        videoFilter="all"
        onVideoFilterChange={() => undefined}
        videoWindowDays={30}
        onVideoWindowChange={() => undefined}
        savedVideoWindowSelectOptions={[]}
        channelVideoWindowSelectOptions={[]}
        videoDurationFilter={[]}
        onVideoDurationChange={() => undefined}
        formatDurationFilterSummary={() => "ANY"}
        videoDurationFilterOptions={[]}
        startBoardSummaryBatch={() => undefined}
        isBoardSummaryBatchRunning={false}
        openVideoDiscovery={openVideoDiscovery}
        playAllVideos={() => undefined}
        copyAllShownBoardLinks={async () => undefined}
        copiedLinkVideoId={null}
        openBulkWatchBoardAction={() => undefined}
        openMaintenanceMenuExport={() => undefined}
        openMaintenanceMenuRestore={() => undefined}
        openMaintenanceMenuLogs={() => undefined}
        openMaintenanceMenuBoardDurationBackfill={() => undefined}
        openMaintenanceMenuRefreshBoardAvatars={() => undefined}
        openMaintenanceMenuDeleteSummaries={() => undefined}
        canOpenMaintenanceBoardDurationBackfill={false}
        canOpenMaintenanceRefreshBoardAvatars={false}
        shownVideosTotal={1}
        areBoardActionsDisabled={false}
        scrollToEdge={() => undefined}
        scrollColumns={() => undefined}
      />
    );

    const discoveryButton = screen.getByRole("button", { name: "Create discovery board" });
    expect(discoveryButton).toContainElement(discoveryButton.querySelector(".btn-icon-discover"));
    expect(discoveryButton).not.toHaveTextContent("D");
    expect(discoveryButton).toHaveClass("top-discovery-btn");

    act(() => {
      fireEvent.click(discoveryButton);
    });

    expect(openVideoDiscovery).toHaveBeenCalledTimes(1);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Open maintenance menu" }));
    });
    expect(screen.queryByText("CREATE DISCOVERY BOARD")).not.toBeInTheDocument();
  });

  it("disables playlist and discovery actions without visible channels or shown videos", () => {
    const openVideoDiscovery = vi.fn();
    const playAllVideos = vi.fn();

    const { rerender } = render(
      <AppTopbar
        buildInfoLabel="dev-build"
        lastApiQueryUnits={0}
        totalApiQueryUnits={0}
        topBarLogoSrc="/svg/logo-dev.svg"
        isLogoSpinning={false}
        isFetchingVideos={false}
        isSavedBoardActive={false}
        topbarLastFetchLabel="-"
        fetchAllColumns={() => undefined}
        appTheme="dark"
        toggleAppTheme={() => undefined}
        activeBoardId="board-1"
        displayedBoards={[{ id: "board-1", name: "Board", kind: "channels" }]}
        newBoardOptionValue="__new__"
        boardDropdownListHeight={320}
        handleBoardSelectChange={() => undefined}
        onBoardSelectorPrewarm={() => undefined}
        blurActiveTopbarControl={() => undefined}
        moveBoard={() => undefined}
        openRenameBoardModal={() => undefined}
        columnScopeFilter={[]}
        isColumnScopeDisabled={false}
        columnScopeDropdownListHeight={240}
        formatColumnScopeSummary={() => "ALL"}
        columnScopeOptions={[]}
        onColumnScopeChange={() => undefined}
        videoFilter="all"
        onVideoFilterChange={() => undefined}
        videoWindowDays={30}
        onVideoWindowChange={() => undefined}
        savedVideoWindowSelectOptions={[]}
        channelVideoWindowSelectOptions={[]}
        videoDurationFilter={[]}
        onVideoDurationChange={() => undefined}
        formatDurationFilterSummary={() => "ANY"}
        videoDurationFilterOptions={[]}
        startBoardSummaryBatch={() => undefined}
        isBoardSummaryBatchRunning={false}
        openVideoDiscovery={openVideoDiscovery}
        playAllVideos={playAllVideos}
        copyAllShownBoardLinks={async () => undefined}
        copiedLinkVideoId={null}
        openBulkWatchBoardAction={() => undefined}
        openMaintenanceMenuExport={() => undefined}
        openMaintenanceMenuRestore={() => undefined}
        openMaintenanceMenuLogs={() => undefined}
        openMaintenanceMenuBoardDurationBackfill={() => undefined}
        openMaintenanceMenuRefreshBoardAvatars={() => undefined}
        openMaintenanceMenuDeleteSummaries={() => undefined}
        canOpenMaintenanceBoardDurationBackfill={false}
        canOpenMaintenanceRefreshBoardAvatars={false}
        shownVideosTotal={4}
        hasVisibleBoardColumns={false}
        areBoardActionsDisabled={false}
        scrollToEdge={() => undefined}
        scrollColumns={() => undefined}
      />
    );

    const playButton = screen.getByRole("button", { name: "Play all videos" });
    const discoveryButton = screen.getByRole("button", { name: "Create discovery board" });
    expect(playButton).toBeDisabled();
    expect(discoveryButton).toBeDisabled();

    fireEvent.click(playButton);
    fireEvent.click(discoveryButton);
    expect(playAllVideos).not.toHaveBeenCalled();
    expect(openVideoDiscovery).not.toHaveBeenCalled();

    rerender(
      <AppTopbar
        buildInfoLabel="dev-build"
        lastApiQueryUnits={0}
        totalApiQueryUnits={0}
        topBarLogoSrc="/svg/logo-dev.svg"
        isLogoSpinning={false}
        isFetchingVideos={false}
        isSavedBoardActive={false}
        topbarLastFetchLabel="-"
        fetchAllColumns={() => undefined}
        appTheme="dark"
        toggleAppTheme={() => undefined}
        activeBoardId="board-1"
        displayedBoards={[{ id: "board-1", name: "Board", kind: "channels" }]}
        newBoardOptionValue="__new__"
        boardDropdownListHeight={320}
        handleBoardSelectChange={() => undefined}
        onBoardSelectorPrewarm={() => undefined}
        blurActiveTopbarControl={() => undefined}
        moveBoard={() => undefined}
        openRenameBoardModal={() => undefined}
        columnScopeFilter={[]}
        isColumnScopeDisabled={false}
        columnScopeDropdownListHeight={240}
        formatColumnScopeSummary={() => "ALL"}
        columnScopeOptions={[]}
        onColumnScopeChange={() => undefined}
        videoFilter="all"
        onVideoFilterChange={() => undefined}
        videoWindowDays={30}
        onVideoWindowChange={() => undefined}
        savedVideoWindowSelectOptions={[]}
        channelVideoWindowSelectOptions={[]}
        videoDurationFilter={[]}
        onVideoDurationChange={() => undefined}
        formatDurationFilterSummary={() => "ANY"}
        videoDurationFilterOptions={[]}
        startBoardSummaryBatch={() => undefined}
        isBoardSummaryBatchRunning={false}
        openVideoDiscovery={openVideoDiscovery}
        playAllVideos={playAllVideos}
        copyAllShownBoardLinks={async () => undefined}
        copiedLinkVideoId={null}
        openBulkWatchBoardAction={() => undefined}
        openMaintenanceMenuExport={() => undefined}
        openMaintenanceMenuRestore={() => undefined}
        openMaintenanceMenuLogs={() => undefined}
        openMaintenanceMenuBoardDurationBackfill={() => undefined}
        openMaintenanceMenuRefreshBoardAvatars={() => undefined}
        openMaintenanceMenuDeleteSummaries={() => undefined}
        canOpenMaintenanceBoardDurationBackfill={false}
        canOpenMaintenanceRefreshBoardAvatars={false}
        shownVideosTotal={0}
        hasVisibleBoardColumns={true}
        areBoardActionsDisabled={false}
        scrollToEdge={() => undefined}
        scrollColumns={() => undefined}
      />
    );

    expect(screen.getByRole("button", { name: "Play all videos" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create discovery board" })).toBeDisabled();
  });

  it("shows summaries as a board option without board action controls", () => {
    const handleBoardSelectChange = vi.fn();

    render(
      <AppTopbar
        buildInfoLabel="dev-build"
        lastApiQueryUnits={0}
        totalApiQueryUnits={0}
        topBarLogoSrc="/svg/logo-dev.svg"
        isLogoSpinning={false}
        isFetchingVideos={false}
        isSavedBoardActive={false}
        topbarLastFetchLabel="-"
        fetchAllColumns={() => undefined}
        appTheme="dark"
        toggleAppTheme={() => undefined}
        activeBoardId="board-1"
        displayedBoards={[
          { id: "board-1", name: "Board", kind: "channels" },
          { id: "__summaries_board__", name: "Summaries", kind: "summaries" }
        ]}
        newBoardOptionValue="__new__"
        boardDropdownListHeight={320}
        handleBoardSelectChange={handleBoardSelectChange}
        onBoardSelectorPrewarm={() => undefined}
        blurActiveTopbarControl={() => undefined}
        moveBoard={() => undefined}
        openRenameBoardModal={() => undefined}
        columnScopeFilter={[]}
        isColumnScopeDisabled={false}
        columnScopeDropdownListHeight={240}
        formatColumnScopeSummary={() => "ALL"}
        columnScopeOptions={[]}
        onColumnScopeChange={() => undefined}
        videoFilter="all"
        onVideoFilterChange={() => undefined}
        videoWindowDays={30}
        onVideoWindowChange={() => undefined}
        savedVideoWindowSelectOptions={[]}
        channelVideoWindowSelectOptions={[]}
        videoDurationFilter={[]}
        onVideoDurationChange={() => undefined}
        formatDurationFilterSummary={() => "ANY"}
        videoDurationFilterOptions={[]}
        startBoardSummaryBatch={() => undefined}
        isBoardSummaryBatchRunning={false}
        openVideoDiscovery={() => undefined}
        playAllVideos={() => undefined}
        copyAllShownBoardLinks={async () => undefined}
        copiedLinkVideoId={null}
        openBulkWatchBoardAction={() => undefined}
        openMaintenanceMenuExport={() => undefined}
        openMaintenanceMenuRestore={() => undefined}
        openMaintenanceMenuLogs={() => undefined}
        openMaintenanceMenuBoardDurationBackfill={() => undefined}
        openMaintenanceMenuRefreshBoardAvatars={() => undefined}
        openMaintenanceMenuDeleteSummaries={() => undefined}
        canOpenMaintenanceBoardDurationBackfill={false}
        canOpenMaintenanceRefreshBoardAvatars={false}
        shownVideosTotal={1}
        areBoardActionsDisabled={false}
        scrollToEdge={() => undefined}
        scrollColumns={() => undefined}
      />
    );

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Board selector" }));
    fireEvent.click(screen.getByText("SUMMARIES"));

    expect(handleBoardSelectChange).toHaveBeenCalledWith("__summaries_board__");
    expect(screen.queryByRole("button", { name: "Edit Summaries" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move Summaries up" })).not.toBeInTheDocument();
  });

  it("renders a disabled channel scope select with all channels label", () => {
    render(
      <AppTopbar
        buildInfoLabel="dev-build"
        lastApiQueryUnits={0}
        totalApiQueryUnits={0}
        topBarLogoSrc="/svg/logo-dev.svg"
        isLogoSpinning={false}
        isFetchingVideos={false}
        isSavedBoardActive={false}
        topbarLastFetchLabel="-"
        fetchAllColumns={() => undefined}
        appTheme="dark"
        toggleAppTheme={() => undefined}
        activeBoardId="__summaries_board__"
        displayedBoards={[{ id: "__summaries_board__", name: "Summaries", kind: "summaries" }]}
        newBoardOptionValue="__new__"
        boardDropdownListHeight={320}
        handleBoardSelectChange={() => undefined}
        onBoardSelectorPrewarm={() => undefined}
        blurActiveTopbarControl={() => undefined}
        moveBoard={() => undefined}
        openRenameBoardModal={() => undefined}
        columnScopeFilter={["__all__"]}
        isColumnScopeDisabled={true}
        columnScopeDropdownListHeight={72}
        formatColumnScopeSummary={() => "ALL CHANNELS"}
        columnScopeOptions={[{ value: "__all__", label: "ALL CHANNELS" }]}
        onColumnScopeChange={() => undefined}
        videoFilter="all"
        onVideoFilterChange={() => undefined}
        videoWindowDays={30}
        onVideoWindowChange={() => undefined}
        savedVideoWindowSelectOptions={[]}
        channelVideoWindowSelectOptions={[]}
        videoDurationFilter={[]}
        onVideoDurationChange={() => undefined}
        formatDurationFilterSummary={() => "ANY"}
        videoDurationFilterOptions={[]}
        startBoardSummaryBatch={() => undefined}
        isBoardSummaryBatchRunning={false}
        openVideoDiscovery={() => undefined}
        playAllVideos={() => undefined}
        copyAllShownBoardLinks={async () => undefined}
        copiedLinkVideoId={null}
        openBulkWatchBoardAction={() => undefined}
        openMaintenanceMenuExport={() => undefined}
        openMaintenanceMenuRestore={() => undefined}
        openMaintenanceMenuLogs={() => undefined}
        openMaintenanceMenuBoardDurationBackfill={() => undefined}
        openMaintenanceMenuRefreshBoardAvatars={() => undefined}
        openMaintenanceMenuDeleteSummaries={() => undefined}
        canOpenMaintenanceBoardDurationBackfill={false}
        canOpenMaintenanceRefreshBoardAvatars={false}
        shownVideosTotal={1}
        areBoardActionsDisabled={true}
        scrollToEdge={() => undefined}
        scrollColumns={() => undefined}
      />
    );

    const channelScopeSelect = screen.getByTestId("topbar-channel-scope-select");
    expect(channelScopeSelect).toHaveClass("ant-select-disabled");
    expect(screen.getByText("ALL CHANNELS")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Summarize all shown videos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Play all videos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy all shown links on board" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark all shown videos watched" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scroll columns to first" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scroll columns left" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scroll columns right" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scroll columns to last" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open maintenance menu" })).toBeInTheDocument();
  });

  it("marks the topbar video count as fetching while videos are loading", () => {
    const { container } = render(
      <AppTopbar
        buildInfoLabel="dev-build"
        lastApiQueryUnits={0}
        totalApiQueryUnits={0}
        topBarLogoSrc="/svg/logo-dev.svg"
        isLogoSpinning={false}
        isFetchingVideos={true}
        isSavedBoardActive={false}
        topbarLastFetchLabel="-"
        fetchAllColumns={() => undefined}
        appTheme="dark"
        toggleAppTheme={() => undefined}
        activeBoardId="board-1"
        displayedBoards={[{ id: "board-1", name: "Board", kind: "channels" }]}
        newBoardOptionValue="__new__"
        boardDropdownListHeight={320}
        handleBoardSelectChange={() => undefined}
        onBoardSelectorPrewarm={() => undefined}
        blurActiveTopbarControl={() => undefined}
        moveBoard={() => undefined}
        openRenameBoardModal={() => undefined}
        columnScopeFilter={[]}
        isColumnScopeDisabled={false}
        columnScopeDropdownListHeight={240}
        formatColumnScopeSummary={() => "ALL"}
        columnScopeOptions={[]}
        onColumnScopeChange={() => undefined}
        videoFilter="all"
        onVideoFilterChange={() => undefined}
        videoWindowDays={30}
        onVideoWindowChange={() => undefined}
        savedVideoWindowSelectOptions={[]}
        channelVideoWindowSelectOptions={[]}
        videoDurationFilter={[]}
        onVideoDurationChange={() => undefined}
        formatDurationFilterSummary={() => "ANY"}
        videoDurationFilterOptions={[]}
        startBoardSummaryBatch={() => undefined}
        isBoardSummaryBatchRunning={false}
        openVideoDiscovery={() => undefined}
        playAllVideos={() => undefined}
        copyAllShownBoardLinks={async () => undefined}
        copiedLinkVideoId={null}
        openBulkWatchBoardAction={() => undefined}
        openMaintenanceMenuExport={() => undefined}
        openMaintenanceMenuRestore={() => undefined}
        openMaintenanceMenuLogs={() => undefined}
        openMaintenanceMenuBoardDurationBackfill={() => undefined}
        openMaintenanceMenuRefreshBoardAvatars={() => undefined}
        openMaintenanceMenuDeleteSummaries={() => undefined}
        canOpenMaintenanceBoardDurationBackfill={false}
        canOpenMaintenanceRefreshBoardAvatars={false}
        shownVideosTotal={16}
        areBoardActionsDisabled={false}
        scrollToEdge={() => undefined}
        scrollColumns={() => undefined}
      />
    );

    const count = container.querySelector(".topbar-video-count");
    expect(count).toHaveClass("is-fetching");
    expect(count).toBeEmptyDOMElement();
  });

  it("fetches all channels from the topbar video count", () => {
    const fetchAllColumns = vi.fn();

    render(
      <AppTopbar
        buildInfoLabel="dev-build"
        lastApiQueryUnits={0}
        totalApiQueryUnits={0}
        topBarLogoSrc="/svg/logo-dev.svg"
        isLogoSpinning={false}
        isFetchingVideos={false}
        isSavedBoardActive={false}
        topbarLastFetchLabel="-"
        fetchAllColumns={fetchAllColumns}
        appTheme="dark"
        toggleAppTheme={() => undefined}
        activeBoardId="board-1"
        displayedBoards={[{ id: "board-1", name: "Board", kind: "channels" }]}
        newBoardOptionValue="__new__"
        boardDropdownListHeight={320}
        handleBoardSelectChange={() => undefined}
        onBoardSelectorPrewarm={() => undefined}
        blurActiveTopbarControl={() => undefined}
        moveBoard={() => undefined}
        openRenameBoardModal={() => undefined}
        columnScopeFilter={[]}
        isColumnScopeDisabled={false}
        columnScopeDropdownListHeight={240}
        formatColumnScopeSummary={() => "ALL"}
        columnScopeOptions={[]}
        onColumnScopeChange={() => undefined}
        videoFilter="all"
        onVideoFilterChange={() => undefined}
        videoWindowDays={30}
        onVideoWindowChange={() => undefined}
        savedVideoWindowSelectOptions={[]}
        channelVideoWindowSelectOptions={[]}
        videoDurationFilter={[]}
        onVideoDurationChange={() => undefined}
        formatDurationFilterSummary={() => "ANY"}
        videoDurationFilterOptions={[]}
        startBoardSummaryBatch={() => undefined}
        isBoardSummaryBatchRunning={false}
        openVideoDiscovery={() => undefined}
        playAllVideos={() => undefined}
        copyAllShownBoardLinks={async () => undefined}
        copiedLinkVideoId={null}
        openBulkWatchBoardAction={() => undefined}
        openMaintenanceMenuExport={() => undefined}
        openMaintenanceMenuRestore={() => undefined}
        openMaintenanceMenuLogs={() => undefined}
        openMaintenanceMenuBoardDurationBackfill={() => undefined}
        openMaintenanceMenuRefreshBoardAvatars={() => undefined}
        openMaintenanceMenuDeleteSummaries={() => undefined}
        canOpenMaintenanceBoardDurationBackfill={false}
        canOpenMaintenanceRefreshBoardAvatars={false}
        shownVideosTotal={0}
        areBoardActionsDisabled={false}
        scrollToEdge={() => undefined}
        scrollColumns={() => undefined}
      />
    );

    const countButton = screen.getByRole("button", { name: "Fetch all shown channels" });

    expect(countButton).toHaveClass("is-zero");
    expect(countButton).toContainElement(countButton.querySelector(".btn-icon-fetch"));

    fireEvent.click(countButton);

    expect(fetchAllColumns).toHaveBeenCalledTimes(1);
  });
});
