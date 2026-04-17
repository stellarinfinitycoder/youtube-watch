import { memo } from "react";
import { Button, Select, Tooltip, Typography } from "antd";

const { Text } = Typography;

type BoardOption = {
  id: string;
  name: string;
  kind: "channels" | "saved";
};

type AppTopbarProps = {
  buildInfoLabel: string;
  quotaEstimateText: string;
  topBarLogoSrc: string;
  isLogoSpinning: boolean;
  triggerLogoSpin: () => void;
  isSavedBoardActive: boolean;
  topbarLastFetchLabel: string;
  fetchAllColumns: () => void;
  activeBoardId?: string;
  displayedBoards: BoardOption[];
  newBoardOptionValue: string;
  boardDropdownListHeight: number;
  handleBoardSelectChange: (value: string) => void;
  blurActiveTopbarControl: () => void;
  moveBoard: (boardId: string, direction: "up" | "down") => void;
  openRenameBoardModal: (boardId: string) => void;
  columnScopeFilter: string[];
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
  playAllVideos: () => void;
  openBulkWatchBoardAction: () => void;
  shownVideosTotal: number;
  scrollToEdge: (direction: "start" | "end") => void;
  scrollColumns: (direction: "left" | "right") => void;
};

function AppTopbarComponent({
  buildInfoLabel,
  quotaEstimateText,
  topBarLogoSrc,
  isLogoSpinning,
  triggerLogoSpin,
  isSavedBoardActive,
  topbarLastFetchLabel,
  fetchAllColumns,
  activeBoardId,
  displayedBoards,
  newBoardOptionValue,
  boardDropdownListHeight,
  handleBoardSelectChange,
  blurActiveTopbarControl,
  moveBoard,
  openRenameBoardModal,
  columnScopeFilter,
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
  playAllVideos,
  openBulkWatchBoardAction,
  shownVideosTotal,
  scrollToEdge,
  scrollColumns
}: AppTopbarProps) {
  return (
    <div className="columns-nav">
      <Tooltip
        title={
          <>
            <div>{buildInfoLabel}</div>
            <div>{quotaEstimateText}</div>
            <div>MAX FETCHED VIDEO AGE: 90 DAYS</div>
            <div>MAX SAVED VIDEO AGE: UNLIMITED</div>
          </>
        }
        placement="bottom"
        overlayClassName="fetch-all-tooltip"
      >
        <img
          src={topBarLogoSrc}
          alt="Logo"
          className={`top-bar-logo ${isLogoSpinning ? "is-spinning" : ""}`}
          onClick={triggerLogoSpin}
          data-testid="topbar-logo"
        />
      </Tooltip>
      {!isSavedBoardActive ? (
        <Tooltip
          title={
            <>
              <div>Fetch all new videos for all channels.</div>
              <div>Last: {topbarLastFetchLabel}</div>
            </>
          }
          placement="bottom"
          overlayClassName="fetch-all-tooltip"
        >
          <Button
            type="primary"
            htmlType="button"
            onClick={fetchAllColumns}
            aria-label="Fetch all channels"
            className="nav-btn"
            data-testid="topbar-fetch-all"
          >
            <span className="btn-icon btn-icon-fetch" aria-hidden />
          </Button>
        </Tooltip>
      ) : null}
      <Select<string>
        value={activeBoardId}
        onChange={(value) => {
          handleBoardSelectChange(value);
          blurActiveTopbarControl();
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
              {board.kind !== "saved" ? (
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
                    disabled={boardIndex === displayedBoards.length - 2}
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
        onClick={playAllVideos}
        aria-label="Play all videos"
        className="nav-btn"
        data-testid="topbar-play-all"
      >
        <span className="btn-icon btn-icon-play" aria-hidden />
      </Button>
      {!isSavedBoardActive ? (
        <Button
          htmlType="button"
          onClick={openBulkWatchBoardAction}
          aria-label={`Mark all shown videos ${videoFilter === "watched" ? "new" : "watched"}`}
          className="nav-btn top-wa-btn"
          disabled={videoFilter === "all" || shownVideosTotal === 0}
          data-testid="topbar-mark-all"
        >
          {videoFilter === "watched" ? (
            <span className="btn-icon btn-icon-undo" aria-hidden />
          ) : (
            <span className="btn-icon btn-icon-check" aria-hidden />
          )}
        </Button>
      ) : null}
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
  );
}

export const AppTopbar = memo(AppTopbarComponent);
