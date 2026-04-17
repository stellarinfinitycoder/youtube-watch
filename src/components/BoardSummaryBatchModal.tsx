import { Button, Modal, Typography } from "antd";
import { memo } from "react";

const { Text } = Typography;

export type BoardSummaryBatchItem = {
  videoId: string;
  title: string;
  status: "loading" | "summarizing" | "done" | "error";
  summary: string;
  keyPoints: string[];
  error: string | null;
};

type BoardSummaryBatchModalProps = {
  open: boolean;
  boardName: string;
  isPreparing: boolean;
  isCopied: boolean;
  items: BoardSummaryBatchItem[];
  onCopyAll: () => Promise<void>;
  onCancel: () => void;
  onAfterOpenChange?: (open: boolean) => void;
};

function BoardSummaryBatchModalComponent({
  open,
  boardName: _boardName,
  isPreparing,
  isCopied,
  items,
  onCopyAll,
  onCancel,
  onAfterOpenChange
}: BoardSummaryBatchModalProps) {
  return (
    <Modal
      title={null}
      open={open}
      onCancel={onCancel}
      afterOpenChange={onAfterOpenChange}
      footer={null}
      width={920}
      className="board-summary-batch-modal"
    >
      <div className="board-summary-batch-toolbar">
        <Button
          htmlType="button"
          className={`column-move-btn transcript-copy-btn board-summary-copy-btn ${
            isCopied ? "is-copied" : ""
          }`}
          aria-label="Copy all board summaries"
          onClick={() => void onCopyAll()}
          disabled={isPreparing && items.length === 0}
        >
          {isCopied ? (
            <span className="btn-icon btn-icon-check" aria-hidden />
          ) : (
            <span className="btn-icon btn-icon-copy" aria-hidden />
          )}
        </Button>
      </div>
      <div className="board-summary-batch-scroll-content">
        {isPreparing && items.length === 0 ? (
          <div className="board-summary-batch-preparing">PREPARING SUMMARIES...</div>
        ) : (
          <div className="board-summary-batch-list">
            {items.map((item) => {
              return (
                <section key={item.videoId} className="board-summary-batch-item">
                  <h3 className="board-summary-batch-title">{item.title.toUpperCase()}</h3>
                  {item.status === "loading" ? (
                    <Text className="board-summary-batch-status">LOADING...</Text>
                  ) : item.status === "summarizing" ? (
                    <Text className="board-summary-batch-status">SUMMARIZING...</Text>
                  ) : item.error ? (
                    <Text type="danger" className="board-summary-batch-error">
                      {item.error}
                    </Text>
                  ) : (
                    <div className="board-summary-batch-content">
                      {item.summary.trim() ? (
                        <p className="board-summary-batch-paragraph">{item.summary.trim()}</p>
                      ) : null}
                      {item.keyPoints.length > 0 ? (
                        <ul className="board-summary-batch-points">
                          {item.keyPoints.map((point, index) => (
                            <li key={`${item.videoId}-point-${index}`}>{point}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

export const BoardSummaryBatchModal = memo(BoardSummaryBatchModalComponent);
