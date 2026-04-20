import { Button, Modal, Select, Typography } from "antd";
import { Suspense, lazy, memo, useMemo } from "react";
import { looksLikeMarkdown, type SummaryFormat } from "../hooks/useTranscriptSummary";

const { Text } = Typography;
const SummaryMarkdownRenderer = lazy(() => import("./SummaryMarkdownRenderer"));

type BoardSummaryAggregateModalProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  summaryText: string;
  summaryKeyPoints: string[];
  summaryModel: string;
  summaryFormats: SummaryFormat[];
  selectedSummaryFormatId: string;
  isCopied: boolean;
  onSummaryFormatChange: (value: string) => void;
  onCancel: () => void;
  onCopy: () => Promise<void>;
};

function BoardSummaryAggregateModalComponent({
  open,
  loading,
  error,
  summaryText,
  summaryKeyPoints,
  summaryModel,
  summaryFormats,
  selectedSummaryFormatId,
  isCopied,
  onSummaryFormatChange,
  onCancel,
  onCopy
}: BoardSummaryAggregateModalProps) {
  const combinedSummary = useMemo(() => {
    const pointsBlock =
      summaryKeyPoints.length > 0 ? summaryKeyPoints.map((point) => `- ${point}`).join("\n") : "";
    return [summaryText, pointsBlock].filter(Boolean).join("\n\n").trim();
  }, [summaryKeyPoints, summaryText]);
  const markdownMode = useMemo(() => looksLikeMarkdown(combinedSummary), [combinedSummary]);
  const plainSummaryText = summaryText.trim();
  const plainSummaryPoints = useMemo(
    () =>
      summaryKeyPoints
        .map((point) => point.trim())
        .filter((point) => point.length > 0),
    [summaryKeyPoints]
  );

  return (
    <Modal
      title={
        <div>
          <div className="transcript-modal-status-row">
            {loading ? <Text className="video-meta-feedback is-info">SUMMARIZING...</Text> : null}
            {!loading && summaryModel ? (
              <Text className="video-meta-feedback is-info">MODEL: {summaryModel}</Text>
            ) : null}
          </div>
          <div className="transcript-modal-header-row">
            <span className="transcript-modal-header-title">SUMMARIES SUMMARY</span>
            <div className="transcript-modal-header-controls">
              <Select<string>
                value={selectedSummaryFormatId}
                onChange={onSummaryFormatChange}
                aria-label="Summary of summaries format"
                className="video-filter-select board-summary-format-select"
                popupClassName="summary-format-dropdown"
                popupMatchSelectWidth={false}
                optionLabelProp="title"
                showSearch={false}
                disabled={loading}
              >
                {summaryFormats.map((format) => (
                  <Select.Option key={format.id} value={format.id} title={format.name.toUpperCase()}>
                    <div className="board-option-row">
                      <span className="board-option-name">{format.name.toUpperCase()}</span>
                    </div>
                  </Select.Option>
                ))}
              </Select>
              <Button
                htmlType="button"
                className={`column-move-btn transcript-copy-btn ${isCopied ? "is-copied" : ""}`}
                aria-label="Copy summaries summary"
                onClick={() => void onCopy()}
                disabled={loading || !!error || combinedSummary.length === 0}
              >
                {isCopied ? (
                  <span className="btn-icon btn-icon-check" aria-hidden />
                ) : (
                  <span className="btn-icon btn-icon-copy" aria-hidden />
                )}
              </Button>
            </div>
          </div>
        </div>
      }
      open={open}
      onCancel={onCancel}
      footer={null}
      width={900}
      destroyOnHidden
      className="transcript-modal board-summary-aggregate-modal"
    >
      <div className="transcript-modal-body">
        {!loading && error ? <Text type="danger">{error}</Text> : null}
        {!loading && !error && combinedSummary ? (
          <div className="summary-content">
            {!markdownMode ? (
              <>
                {plainSummaryText ? <p className="summary-paragraph">{plainSummaryText}</p> : null}
                {plainSummaryPoints.length > 0 ? (
                  <ul className="summary-points">
                    {plainSummaryPoints.map((point, index) => (
                      <li key={`${index}-${point.slice(0, 24)}`}>{point}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <Suspense
                fallback={
                  <>
                    {plainSummaryText ? <p className="summary-paragraph">{plainSummaryText}</p> : null}
                    {plainSummaryPoints.length > 0 ? (
                      <ul className="summary-points">
                        {plainSummaryPoints.map((point, index) => (
                          <li key={`${index}-${point.slice(0, 24)}`}>{point}</li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                }
              >
                <SummaryMarkdownRenderer content={combinedSummary} />
              </Suspense>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

export const BoardSummaryAggregateModal = memo(BoardSummaryAggregateModalComponent);
