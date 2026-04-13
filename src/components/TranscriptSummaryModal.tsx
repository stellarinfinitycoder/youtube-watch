import { Button, Checkbox, Input, Modal, Select, Space, Typography } from "antd";
import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { VideoItem } from "../types/youtube";
import {
  ALL_SUMMARY_FORMATS_OPTION,
  looksLikeMarkdown,
  NEW_SUMMARY_FORMAT_OPTION,
  NEW_SUMMARY_MODEL_OPTION,
  preserveTreeBlocksInMarkdown,
  SUMMARY_MODE_OPTION_PREFIX,
  type InlineMetaFeedback,
  type SummaryFormat,
  type SummaryModelPreset
} from "../hooks/useTranscriptSummary";

const { Text } = Typography;

type TranscriptSummaryModalProps = {
  transcriptVideo: VideoItem;
  transcriptLoading: boolean;
  transcriptText: string;
  transcriptError: string | null;
  transcriptViewMode: "transcript" | "summary";
  isTranscriptCopied: boolean;
  summaryLoading: boolean;
  summaryText: string;
  summaryKeyPoints: string[];
  summaryError: string | null;
  summaryModel: string;
  isPublishingSummary: boolean;
  publishSummaryFeedback: InlineMetaFeedback | null;
  summaryFormats: SummaryFormat[];
  summaryModelPresets: SummaryModelPreset[];
  activeSummaryFormat: SummaryFormat;
  isAllSummaryFormatsMode: boolean;
  isSummaryPromptEditMode: boolean;
  editingSummaryFormatId: string | null;
  summaryFormatNameDraft: string;
  summaryPromptDraft: string;
  summaryFormatModelDraft: string;
  isNewSummaryModelDraftMode: boolean;
  summaryFormatDefaultDraft: boolean;
  hasPublishableSummary: boolean;
  isSummaryBusy: boolean;
  onCancel: () => void;
  setSummaryFormatNameDraft: (value: string) => void;
  setSummaryPromptDraft: (value: string) => void;
  setSummaryFormatModelDraft: (value: string) => void;
  setIsNewSummaryModelDraftMode: (value: boolean) => void;
  setSummaryFormatDefaultDraft: (value: boolean) => void;
  setIsAllSummaryFormatsMode: (value: boolean) => void;
  setActiveSummaryFormatId: (value: string) => void;
  setIsSummaryPromptEditMode: (value: boolean) => void;
  handleTranscriptViewModeChange: (value: "transcript" | "summary" | string) => Promise<void>;
  copyTranscriptText: () => Promise<void>;
  regenerateSummary: () => Promise<void>;
  publishCurrentVideoSummary: () => Promise<void>;
  openSummaryFormatEditor: (formatId: string | null) => void;
  moveSummaryFormat: (formatId: string, direction: "up" | "down") => void;
  removeSummaryModelPreset: (modelValue: string) => void;
  saveSummaryPromptAndClose: () => Promise<void>;
  deleteSummaryFormatAndClose: () => void;
};

function TranscriptSummaryModalComponent(props: TranscriptSummaryModalProps) {
  const {
    transcriptVideo,
    transcriptLoading,
    transcriptText,
    transcriptError,
    transcriptViewMode,
    isTranscriptCopied,
    summaryLoading,
    summaryText,
    summaryKeyPoints,
    summaryError,
    summaryModel,
    isPublishingSummary,
    publishSummaryFeedback,
    summaryFormats,
    summaryModelPresets,
    activeSummaryFormat,
    isAllSummaryFormatsMode,
    isSummaryPromptEditMode,
    editingSummaryFormatId,
    summaryFormatNameDraft,
    summaryPromptDraft,
    summaryFormatModelDraft,
    isNewSummaryModelDraftMode,
    summaryFormatDefaultDraft,
    hasPublishableSummary,
    isSummaryBusy,
    onCancel,
    setSummaryFormatNameDraft,
    setSummaryPromptDraft,
    setSummaryFormatModelDraft,
    setIsNewSummaryModelDraftMode,
    setSummaryFormatDefaultDraft,
    setIsAllSummaryFormatsMode,
    setActiveSummaryFormatId,
    setIsSummaryPromptEditMode,
    handleTranscriptViewModeChange,
    copyTranscriptText,
    regenerateSummary,
    publishCurrentVideoSummary,
    openSummaryFormatEditor,
    moveSummaryFormat,
    removeSummaryModelPreset,
    saveSummaryPromptAndClose,
    deleteSummaryFormatAndClose
  } = props;

  const combinedSummary = useMemo(() => {
    const pointsBlock =
      summaryKeyPoints.length > 0 ? summaryKeyPoints.map((point) => `- ${point}`).join("\n") : "";
    return [summaryText, pointsBlock].filter(Boolean).join("\n\n").trim();
  }, [summaryKeyPoints, summaryText]);

  const combinedWithTreeBlocks = useMemo(
    () => preserveTreeBlocksInMarkdown(combinedSummary),
    [combinedSummary]
  );
  const markdownMode = useMemo(
    () => looksLikeMarkdown(combinedSummary),
    [combinedSummary]
  );
  const showPublishButton =
    transcriptViewMode === "summary" &&
    (hasPublishableSummary || isPublishingSummary || publishSummaryFeedback !== null);

  return (
    <Modal
      title={
        <div>
          <div className="transcript-modal-status-row">
            {transcriptLoading ? (
              <Text className="video-meta-feedback is-info">FETCHING TRANSCRIPT...</Text>
            ) : null}
            {!transcriptLoading && summaryLoading ? (
              <Text className="video-meta-feedback is-info">SUMMARIZING...</Text>
            ) : null}
            {publishSummaryFeedback ? (
              <Text className={`video-meta-feedback is-${publishSummaryFeedback.kind}`}>
                {publishSummaryFeedback.text}
              </Text>
            ) : null}
            {isPublishingSummary ? (
              <Text className="video-meta-feedback is-info">PUBLISHING...</Text>
            ) : null}
            {!transcriptLoading &&
            !summaryLoading &&
            !isPublishingSummary &&
            !publishSummaryFeedback &&
            transcriptViewMode === "summary" &&
            !isSummaryPromptEditMode &&
            summaryModel ? (
              <Text className="video-meta-feedback is-info">MODEL: {summaryModel}</Text>
            ) : null}
          </div>
          <div className="transcript-modal-header-row">
            <span className="transcript-modal-header-title">
              {isSummaryPromptEditMode ? "EDIT SUMMARY FORMAT" : transcriptVideo.title}
            </span>
            <div className="transcript-modal-header-controls">
              <Select<string>
                value={
                  isSummaryPromptEditMode && editingSummaryFormatId === null
                    ? NEW_SUMMARY_FORMAT_OPTION
                    : transcriptViewMode === "transcript"
                      ? "transcript"
                      : isAllSummaryFormatsMode
                        ? ALL_SUMMARY_FORMATS_OPTION
                        : `${SUMMARY_MODE_OPTION_PREFIX}${activeSummaryFormat.id}`
                }
                onChange={(value) => void handleTranscriptViewModeChange(value)}
                aria-label="Transcript view mode"
                className="video-filter-select transcript-mode-select"
                popupClassName="summary-format-dropdown"
                optionLabelProp="title"
                disabled={
                  isSummaryBusy ||
                  transcriptLoading ||
                  !!transcriptError ||
                  transcriptText.trim().length === 0
                }
              >
                <Select.Option value="transcript" title="TRANSCRIPT">
                  TRANSCRIPT
                </Select.Option>
                <Select.Option value={ALL_SUMMARY_FORMATS_OPTION} title="ALL FORMATS">
                  ALL FORMATS
                </Select.Option>
                {summaryFormats.map((format, formatIndex) => (
                  <Select.Option
                    key={format.id}
                    value={`${SUMMARY_MODE_OPTION_PREFIX}${format.id}`}
                    title={format.name.toUpperCase()}
                  >
                    <div className="board-option-row">
                      <span className="board-option-name">{format.name.toUpperCase()}</span>
                      <div className="board-option-actions">
                        <button
                          type="button"
                          className="board-option-move-btn"
                          aria-label={`Move ${format.name} up`}
                          disabled={formatIndex === 0}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            moveSummaryFormat(format.id, "up");
                          }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="board-option-move-btn"
                          aria-label={`Move ${format.name} down`}
                          disabled={formatIndex === summaryFormats.length - 1}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            moveSummaryFormat(format.id, "down");
                          }}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="board-option-edit-btn"
                          aria-label={`Edit ${format.name}`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setIsAllSummaryFormatsMode(false);
                            setActiveSummaryFormatId(format.id);
                            openSummaryFormatEditor(format.id);
                          }}
                        >
                          <span className="btn-icon btn-icon-edit-board" aria-hidden />
                        </button>
                      </div>
                    </div>
                  </Select.Option>
                ))}
                <Select.Option value={NEW_SUMMARY_FORMAT_OPTION} title="NEW FORMAT">
                  NEW FORMAT
                </Select.Option>
              </Select>
              <Button
                htmlType="button"
                className={`column-move-btn transcript-copy-btn ${
                  isTranscriptCopied ? "is-copied" : ""
                }`}
                aria-label={transcriptViewMode === "summary" ? "Copy summary" : "Copy transcript"}
                onClick={() => void copyTranscriptText()}
                disabled={
                  isSummaryPromptEditMode
                    ? true
                    : transcriptViewMode === "summary"
                      ? summaryLoading ||
                        !!summaryError ||
                        (summaryText.trim().length === 0 && summaryKeyPoints.length === 0)
                      : transcriptLoading || !!transcriptError || transcriptText.trim().length === 0
                }
              >
                {isTranscriptCopied ? (
                  <span className="btn-icon btn-icon-check" aria-hidden />
                ) : (
                  <span className="btn-icon btn-icon-copy" aria-hidden />
                )}
              </Button>
              <Button
                htmlType="button"
                className="column-move-btn transcript-regenerate-btn"
                aria-label="Regenerate summary"
                onClick={() => void regenerateSummary()}
                disabled={
                  transcriptViewMode === "transcript" ||
                  isSummaryBusy ||
                  isSummaryPromptEditMode ||
                  transcriptLoading ||
                  !!transcriptError ||
                  transcriptText.trim().length === 0
                }
              >
                <span className="btn-icon btn-icon-fetch" aria-hidden />
              </Button>
              {showPublishButton ? (
                <Button
                  htmlType="button"
                  className="column-move-btn transcript-publish-btn"
                  aria-label="Publish summary"
                  onClick={() => void publishCurrentVideoSummary()}
                  disabled={
                    isSummaryBusy ||
                    isSummaryPromptEditMode ||
                    isPublishingSummary ||
                    transcriptLoading ||
                    !!transcriptError ||
                    !hasPublishableSummary
                  }
                >
                  <span
                    className={`btn-icon btn-icon-feed ${isPublishingSummary ? "is-spinning" : ""}`}
                    aria-hidden
                  />
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      }
      open
      onCancel={onCancel}
      footer={null}
      width={900}
      destroyOnHidden
      className="transcript-modal"
    >
      <div className="transcript-modal-body">
        {isSummaryPromptEditMode ? (
          <div className="summary-prompt-editor">
            <Input
              key={`summary-name-${editingSummaryFormatId ?? "new"}-${isSummaryPromptEditMode ? "open" : "closed"}`}
              defaultValue={summaryFormatNameDraft}
              onChange={(event) => setSummaryFormatNameDraft(event.target.value)}
              placeholder="Name"
              maxLength={20}
            />
            <Input.TextArea
              key={`summary-prompt-${editingSummaryFormatId ?? "new"}-${isSummaryPromptEditMode ? "open" : "closed"}`}
              defaultValue={summaryPromptDraft}
              onChange={(event) => setSummaryPromptDraft(event.target.value)}
              autoSize={{ minRows: 8, maxRows: 18 }}
              placeholder="Enter plain summary instructions (style/focus)."
            />
            <Select<string>
              value={
                isNewSummaryModelDraftMode
                  ? NEW_SUMMARY_MODEL_OPTION
                  : summaryFormatModelDraft || "__default_model__"
              }
              onChange={(value) => {
                if (value === NEW_SUMMARY_MODEL_OPTION) {
                  setIsNewSummaryModelDraftMode(true);
                  setSummaryFormatModelDraft("");
                  return;
                }
                setIsNewSummaryModelDraftMode(false);
                const nextValue = value === "__default_model__" ? "" : value;
                setSummaryFormatModelDraft(nextValue);
              }}
              className="video-filter-select"
              options={[
                ...summaryModelPresets.map((preset) => ({
                  value: preset.value.trim().length === 0 ? "__default_model__" : preset.value,
                  label: preset.label
                })),
                { value: NEW_SUMMARY_MODEL_OPTION, label: "NEW MODEL" }
              ]}
              optionRender={(option) => {
                const optionValue = String(option.data.value ?? "");
                const optionLabel = String(option.data.label ?? optionValue);
                const isDefaultEnv = optionValue === "__default_model__";
                const isNewModel = optionValue === NEW_SUMMARY_MODEL_OPTION;
                return (
                  <div className="summary-model-option-row">
                    <span>{optionLabel}</span>
                    {!isDefaultEnv && !isNewModel ? (
                      <button
                        type="button"
                        className="summary-model-remove-btn"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          removeSummaryModelPreset(optionValue);
                        }}
                        aria-label={`Remove model preset ${optionLabel}`}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                );
              }}
            />
            <Input
              value={summaryFormatModelDraft}
              onChange={(event) => setSummaryFormatModelDraft(event.target.value)}
              placeholder="OPENROUTER MODEL ID"
            />
            <Checkbox
              className="summary-default-checkbox"
              checked={summaryFormatDefaultDraft}
              onChange={(event) => setSummaryFormatDefaultDraft(event.target.checked)}
            >
              SET DEFAULT
            </Checkbox>
            <div className="summary-prompt-actions">
              <Button
                htmlType="button"
                className="summary-prompt-action-btn red-outline-btn"
                disabled={summaryFormats.length <= 1 || editingSummaryFormatId === null}
                onClick={deleteSummaryFormatAndClose}
              >
                DELETE
              </Button>
              <Space size={8}>
                <Button
                  htmlType="button"
                  className="summary-prompt-action-btn"
                  onClick={() => {
                    setIsSummaryPromptEditMode(false);
                    setSummaryFormatNameDraft(activeSummaryFormat.name);
                    setSummaryPromptDraft(activeSummaryFormat.prompt);
                    setSummaryFormatModelDraft(activeSummaryFormat.model ?? "");
                    setIsNewSummaryModelDraftMode(false);
                    setSummaryFormatDefaultDraft(activeSummaryFormat.isDefault);
                  }}
                >
                  CANCEL
                </Button>
                <Button
                  htmlType="button"
                  type="primary"
                  className="summary-prompt-action-btn"
                  onClick={() => void saveSummaryPromptAndClose()}
                >
                  SAVE
                </Button>
              </Space>
            </div>
          </div>
        ) : transcriptViewMode === "transcript" ? (
          <>
            {!transcriptLoading && transcriptError ? <Text type="danger">{transcriptError}</Text> : null}
            {!transcriptLoading && !transcriptError ? <pre className="transcript-text">{transcriptText}</pre> : null}
          </>
        ) : (
          <>
            {!summaryLoading && summaryError ? <Text type="danger">{summaryError}</Text> : null}
            {!summaryLoading && !summaryError && (summaryText || summaryKeyPoints.length > 0) ? (
              <div className="summary-content">
                {isAllSummaryFormatsMode ? (
                  <div className="summary-markdown summary-combined-markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{combinedWithTreeBlocks}</ReactMarkdown>
                  </div>
                ) : !markdownMode ? (
                  <>
                    {summaryText ? <p className="summary-paragraph">{summaryText}</p> : null}
                    {summaryKeyPoints.length > 0 ? (
                      <ul className="summary-points">
                        {summaryKeyPoints.map((point, index) => (
                          <li key={`${index}-${point.slice(0, 24)}`}>{point}</li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : (
                  <div className="summary-markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{combinedSummary}</ReactMarkdown>
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}

export default memo(TranscriptSummaryModalComponent);
