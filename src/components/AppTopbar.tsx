import { memo, useState } from "react";
import { Button, Dropdown, Modal, Select, Typography } from "antd";
import type { MenuProps } from "antd";

const { Text } = Typography;

type BoardOption = {
  id: string;
  name: string;
  kind: "channels" | "saved" | "summaries";
};

type AppTopbarProps = {
  buildInfoLabel: string;
  lastApiQueryUnits: number;
  totalApiQueryUnits: number;
  topBarLogoSrc: string;
  isLogoSpinning: boolean;
  isSavedBoardActive: boolean;
  topbarLastFetchLabel: string;
  fetchAllColumns: () => void;
  activeBoardId?: string;
  displayedBoards: BoardOption[];
  newBoardOptionValue: string;
  boardDropdownListHeight: number;
  handleBoardSelectChange: (value: string) => void;
  onBoardSelectorPrewarm: () => void;
  blurActiveTopbarControl: () => void;
  moveBoard: (boardId: string, direction: "up" | "down") => void;
  openRenameBoardModal: (boardId: string) => void;
  columnScopeFilter: string[];
  isColumnScopeDisabled: boolean;
  columnScopeDropdownListHeight: number;
  formatColumnScopeSummary: () => string;
  columnScopeOptions: Array<{ value: string; label: string }>;
  onColumnScopeChange: (value: string[]) => void;
  videoFilter: "all" | "new" | "watched";
  onVideoFilterChange: (value: "all" | "new" | "watched") => void;
  videoWindowDays: string | number;
  onVideoWindowChange: (value: string | number) => void;
  savedVideoWindowSelectOptions: Array<{ value: string | number; label: string }>;
  channelVideoWindowSelectOptions: Array<{ value: string | number; label: string }>;
  videoDurationFilter: string[];
  onVideoDurationChange: (value: string[]) => void;
  formatDurationFilterSummary: () => string;
  videoDurationFilterOptions: Array<{ value: string; label: string }>;
  startBoardSummaryBatch: () => void;
  isBoardSummaryBatchRunning: boolean;
  playAllVideos: () => void;
  copyAllShownBoardLinks: () => Promise<void>;
  copiedLinkVideoId: string | null;
  openBulkWatchBoardAction: () => void;
  openMaintenanceMenuExport: () => void;
  openMaintenanceMenuRestore: () => void;
  openMaintenanceMenuLogs: () => void;
  openMaintenanceMenuBoardDurationBackfill: () => void;
  openMaintenanceMenuRefreshBoardAvatars: () => void;
  openMaintenanceMenuDeleteSummaries: () => void;
  canOpenMaintenanceBoardDurationBackfill: boolean;
  canOpenMaintenanceRefreshBoardAvatars: boolean;
  shownVideosTotal: number;
  areBoardActionsDisabled: boolean;
  scrollToEdge: (direction: "start" | "end") => void;
  scrollColumns: (direction: "left" | "right") => void;
};

function AppTopbarComponent({
  buildInfoLabel,
  lastApiQueryUnits,
  totalApiQueryUnits,
  topBarLogoSrc,
  isLogoSpinning,
  isSavedBoardActive,
  topbarLastFetchLabel,
  fetchAllColumns,
  activeBoardId,
  displayedBoards,
  newBoardOptionValue,
  boardDropdownListHeight,
  handleBoardSelectChange,
  onBoardSelectorPrewarm,
  blurActiveTopbarControl,
  moveBoard,
  openRenameBoardModal,
  columnScopeFilter,
  isColumnScopeDisabled,
  columnScopeDropdownListHeight,
  formatColumnScopeSummary,
  columnScopeOptions,
  onColumnScopeChange,
  videoFilter,
  onVideoFilterChange,
  videoWindowDays,
  onVideoWindowChange,
  savedVideoWindowSelectOptions,
  channelVideoWindowSelectOptions,
  videoDurationFilter,
  onVideoDurationChange,
  formatDurationFilterSummary,
  videoDurationFilterOptions,
  startBoardSummaryBatch,
  isBoardSummaryBatchRunning,
  playAllVideos,
  copyAllShownBoardLinks,
  copiedLinkVideoId,
  openBulkWatchBoardAction,
  openMaintenanceMenuExport,
  openMaintenanceMenuRestore,
  openMaintenanceMenuLogs,
  openMaintenanceMenuBoardDurationBackfill,
  openMaintenanceMenuRefreshBoardAvatars,
  openMaintenanceMenuDeleteSummaries,
  canOpenMaintenanceBoardDurationBackfill,
  canOpenMaintenanceRefreshBoardAvatars,
  shownVideosTotal,
  areBoardActionsDisabled,
  scrollToEdge,
  scrollColumns
}: AppTopbarProps) {
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const channelBoardCount = displayedBoards.filter((board) => board.kind === "channels").length;
  const maintenanceMenuItems: MenuProps["items"] = [
    { key: "backup", label: "BACKUP" },
    { key: "restore", label: "RESTORE" },
    { key: "open-stats", label: "OPEN INFO" },
    { key: "logs", label: "OPEN LOGS" },
    {
      key: "board-duration",
      label: "BACKFILL METADATA",
      disabled: !canOpenMaintenanceBoardDurationBackfill
    },
    {
      key: "refresh-avatars",
      label: "REFRESH AVATARS",
      disabled: !canOpenMaintenanceRefreshBoardAvatars
    },
    { key: "delete-summaries", label: "DELETE SUMMARIES", danger: true }
  ];

  const handleMaintenanceMenuClick: MenuProps["onClick"] = ({ key }) => {
    if (key === "open-stats") {
      setIsStatsModalOpen(true);
      return;
    }
    if (key === "backup") {
      openMaintenanceMenuExport();
      return;
    }
    if (key === "restore") {
      openMaintenanceMenuRestore();
      return;
    }
    if (key === "logs") {
      openMaintenanceMenuLogs();
      return;
    }
    if (key === "board-duration") {
      openMaintenanceMenuBoardDurationBackfill();
      return;
    }
    if (key === "refresh-avatars") {
      openMaintenanceMenuRefreshBoardAvatars();
      return;
    }
    if (key === "delete-summaries") {
      openMaintenanceMenuDeleteSummaries();
    }
  };

  return (
    <>
      <div className="columns-nav">
        <img
          src={topBarLogoSrc}
          alt="Logo"
          className={`top-bar-logo ${isLogoSpinning ? "is-spinning" : ""}`}
          onClick={fetchAllColumns}
          data-testid="topbar-logo"
        />
        <Select<string>
          value={activeBoardId}
          onChange={(value) => {
            handleBoardSelectChange(value);
            blurActiveTopbarControl();
          }}
          onFocus={onBoardSelectorPrewarm}
          onOpenChange={(open) => {
            if (open) {
              onBoardSelectorPrewarm();
            }
          }}
          aria-label="Board selector"
          className="video-filter-select board-select"
          data-testid="topbar-board-select"
          optionLabelProp="title"
          listHeight={boardDropdownListHeight}
        >
        {displayedBoards.map((board, boardIndex) => (
          <Select.Option key={board.id} value={board.id} title={board.name.toUpperCase()}>
            <div className="board-option-row">
              <span className="board-option-name">{board.name.toUpperCase()}</span>
              {board.kind === "channels" ? (
                <div className="board-option-actions">
                  <button
                    type="button"
                    className="board-option-move-btn"
                    aria-label={`Move ${board.name} up`}
                    disabled={boardIndex === 0}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      moveBoard(board.id, "up");
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="board-option-move-btn"
                    aria-label={`Move ${board.name} down`}
                    disabled={boardIndex >= channelBoardCount - 1}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      moveBoard(board.id, "down");
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="board-option-edit-btn"
                    aria-label={`Edit ${board.name}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openRenameBoardModal(board.id);
                    }}
                  >
                    <span className="btn-icon btn-icon-edit-board" aria-hidden />
                  </button>
                </div>
              ) : null}
            </div>
          </Select.Option>
        ))}
        <Select.Option value={newBoardOptionValue} title="NEW BOARD">
          NEW BOARD
        </Select.Option>
      </Select>
      <Select
        mode="multiple"
        value={columnScopeFilter}
        onChange={onColumnScopeChange}
        disabled={isColumnScopeDisabled}
        aria-label="Channel scope filter"
        className="video-filter-select channel-scope-select"
        data-testid="topbar-channel-scope-select"
        listHeight={columnScopeDropdownListHeight}
        maxTagCount={0}
        maxTagPlaceholder={formatColumnScopeSummary}
        showSearch={false}
        options={columnScopeOptions}
      />
      {!isSavedBoardActive ? (
        <Select<"all" | "new" | "watched">
          value={videoFilter}
          onChange={onVideoFilterChange}
          aria-label="Video filter"
          className="video-filter-select video-status-select"
          data-testid="topbar-status-select"
          options={[
            { value: "all", label: "ALL" },
            { value: "new", label: "NEW" },
            { value: "watched", label: "WATCHED" }
          ]}
        />
      ) : null}
      <Select<string | number>
        value={videoWindowDays}
        onChange={onVideoWindowChange}
        aria-label="Video age window"
        className="video-filter-select video-window-select"
        data-testid="topbar-days-select"
        listHeight={360}
        options={isSavedBoardActive ? savedVideoWindowSelectOptions : channelVideoWindowSelectOptions}
      />
      <Select
        mode="multiple"
        value={videoDurationFilter}
        onChange={onVideoDurationChange}
        aria-label="Video duration filter"
        className="video-filter-select video-duration-select"
        data-testid="topbar-duration-select"
        maxTagCount={0}
        maxTagPlaceholder={formatDurationFilterSummary}
        showSearch={false}
        options={videoDurationFilterOptions}
      />
      <Text className={`topbar-video-count ${shownVideosTotal === 0 ? "is-zero" : ""}`}>
        {shownVideosTotal}
      </Text>
      <Button
        htmlType="button"
        onClick={startBoardSummaryBatch}
        aria-label="Summarize all shown videos"
        className="nav-btn top-summary-btn"
        disabled={shownVideosTotal === 0 || isBoardSummaryBatchRunning || areBoardActionsDisabled}
        data-testid="topbar-summarize-all"
      >
        <span className="btn-icon btn-icon-transcript" aria-hidden />
      </Button>
      <Button
        htmlType="button"
        onClick={playAllVideos}
        aria-label="Play all videos"
        className="nav-btn"
        disabled={areBoardActionsDisabled}
        data-testid="topbar-play-all"
      >
        <span className="btn-icon btn-icon-play" aria-hidden />
      </Button>
      <Button
        htmlType="button"
        onClick={() => void copyAllShownBoardLinks()}
        aria-label="Copy all shown links on board"
        className={`nav-btn link-copy-btn ${
          copiedLinkVideoId === `board-links:${activeBoardId}` ? "is-copied" : ""
        }`}
        disabled={shownVideosTotal === 0 || areBoardActionsDisabled}
        data-testid="topbar-copy-all-links"
      >
        <span className="btn-icon btn-icon-link" aria-hidden />
      </Button>
      {!isSavedBoardActive ? (
        <Button
          htmlType="button"
          onClick={openBulkWatchBoardAction}
          aria-label={`Mark all shown videos ${videoFilter === "watched" ? "new" : "watched"}`}
          className="nav-btn top-wa-btn"
          disabled={videoFilter === "all" || shownVideosTotal === 0 || areBoardActionsDisabled}
          data-testid="topbar-mark-all"
        >
          {videoFilter === "watched" ? (
            <span className="btn-icon btn-icon-undo" aria-hidden />
          ) : (
            <span className="btn-icon btn-icon-check" aria-hidden />
          )}
        </Button>
      ) : null}
      <Dropdown
        menu={{ items: maintenanceMenuItems, onClick: handleMaintenanceMenuClick }}
        trigger={["click"]}
        placement="bottomRight"
        overlayClassName="maintenance-menu-dropdown"
      >
        <Button
          htmlType="button"
          aria-label="Open maintenance menu"
          className="nav-btn maintenance-menu-btn"
        >
          <span className="btn-icon btn-icon-settings" aria-hidden />
        </Button>
      </Dropdown>
      <Button
        htmlType="button"
        onClick={() => scrollToEdge("start")}
        aria-label="Scroll columns to first"
        className="nav-btn scroll-btn"
      >
        {"«"}
      </Button>
      <Button
        htmlType="button"
        onClick={() => scrollColumns("left")}
        aria-label="Scroll columns left"
        className="nav-btn scroll-btn"
      >
        {"‹"}
      </Button>
      <Button
        htmlType="button"
        onClick={() => scrollColumns("right")}
        aria-label="Scroll columns right"
        className="nav-btn scroll-btn"
      >
        {"›"}
      </Button>
      <Button
        htmlType="button"
        onClick={() => scrollToEdge("end")}
        aria-label="Scroll columns to last"
        className="nav-btn scroll-btn"
      >
        {"»"}
      </Button>
      </div>
      <Modal
        title="STATS"
        open={isStatsModalOpen}
        onCancel={() => setIsStatsModalOpen(false)}
        footer={null}
        width={420}
        destroyOnHidden
      >
        <div className="stats-modal-body">
          <div>LAST FETCH: {topbarLastFetchLabel}</div>
          <div>LAST API QUERY: {lastApiQueryUnits}</div>
          <div>TOTAL API QUERIES TODAY: {totalApiQueryUnits}</div>
          <div style={{ height: 8 }} />
          <div>MAX FETCHED VIDEO AGE: 90 DAYS</div>
          <div>MAX WATCHED VIDEO AGE: 90 DAYS</div>
          <div>MAX SAVED VIDEO AGE: UNLIMITED</div>
          <div style={{ height: 8 }} />
          <div>VERSION: {buildInfoLabel}</div>
        </div>
      </Modal>
    </>
  );
}

export const AppTopbar = memo(AppTopbarComponent);
