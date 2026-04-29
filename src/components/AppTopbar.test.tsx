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
        isSavedBoardActive={false}
        topbarLastFetchLabel="Today at 10:00"
        fetchAllColumns={fetchAllColumns}
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

  it("shows summaries as a board option without board action controls", () => {
    const handleBoardSelectChange = vi.fn();

    render(
      <AppTopbar
        buildInfoLabel="dev-build"
        lastApiQueryUnits={0}
        totalApiQueryUnits={0}
        topBarLogoSrc="/svg/logo-dev.svg"
        isLogoSpinning={false}
        isSavedBoardActive={false}
        topbarLastFetchLabel="-"
        fetchAllColumns={() => undefined}
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
        isSavedBoardActive={false}
        topbarLastFetchLabel="-"
        fetchAllColumns={() => undefined}
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
});
