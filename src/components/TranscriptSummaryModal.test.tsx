import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TranscriptSummaryModal from "./TranscriptSummaryModal";

const summaryFormat = {
  id: "summary-default",
  name: "Summary",
  prompt: "Default prompt",
  model: "",
  isDefault: true,
  createdAt: 1,
  updatedAt: 1
};

describe("TranscriptSummaryModal", () => {
  beforeEach(() => {
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      ((element: Element) =>
        ({
          getPropertyValue: () => "",
          overflow: element instanceof HTMLElement ? element.style.overflow || "" : ""
        }) as CSSStyleDeclaration) as typeof window.getComputedStyle
    );
  });

  it("shows cache loading state without transcript fetch status", () => {
    render(
      <TranscriptSummaryModal
        transcriptVideo={{
          videoId: "video-1",
          title: "Example video",
          publishedAt: "2026-04-10T10:00:00Z",
          thumbnailUrl: "https://img.test/video-1.jpg",
          channelTitle: "Example Channel",
          videoUrl: "https://www.youtube.com/watch?v=video-1",
          viewCount: 100
        }}
        summaryHydrating={false}
        transcriptHydrating
        transcriptLoading={false}
        transcriptText=""
        transcriptError={null}
        transcriptViewMode="summary"
        isTranscriptCopied={false}
        summaryLoading={false}
        summaryText=""
        summaryKeyPoints={[]}
        summaryError={null}
        summaryModel=""
        isPublishingSummary={false}
        publishSummaryFeedback={null}
        summaryFormats={[summaryFormat]}
        summaryModelPresets={[]}
        activeSummaryFormat={summaryFormat}
        isSummaryPromptEditMode={false}
        editingSummaryFormatId={summaryFormat.id}
        summaryFormatNameDraft={summaryFormat.name}
        summaryPromptDraft={summaryFormat.prompt}
        summaryFormatModelDraft={summaryFormat.model}
        isNewSummaryModelDraftMode={false}
        summaryFormatDefaultDraft
        hasPublishableSummary={false}
        isSummaryBusy={false}
        onCancel={() => undefined}
        setSummaryFormatNameDraft={() => undefined}
        setSummaryPromptDraft={() => undefined}
        setSummaryFormatModelDraft={() => undefined}
        setIsNewSummaryModelDraftMode={() => undefined}
        setSummaryFormatDefaultDraft={() => undefined}
        setActiveSummaryFormatId={() => undefined}
        setIsSummaryPromptEditMode={() => undefined}
        cancelSummaryFormatEditing={() => undefined}
        handleTranscriptViewModeChange={async () => undefined}
        copyTranscriptText={async () => undefined}
        regenerateSummary={async () => undefined}
        publishCurrentVideoSummary={async () => undefined}
        openSummaryFormatEditor={() => undefined}
        moveSummaryFormat={() => undefined}
        removeSummaryModelPreset={() => undefined}
        saveSummaryPromptAndClose={async () => undefined}
        deleteSummaryFormatAndClose={() => undefined}
      />
    );

    expect(screen.getByText("LOADING...")).toBeInTheDocument();
    expect(screen.queryByText("FETCHING TRANSCRIPT...")).not.toBeInTheDocument();
    expect(screen.queryByText("SUMMARIZING...")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy summary" })).toBeDisabled();
  });

  it("keeps the summary format selector enabled in summary mode without transcript text", () => {
    render(
      <TranscriptSummaryModal
        transcriptVideo={{
          videoId: "video-1",
          title: "Example video",
          publishedAt: "2026-04-10T10:00:00Z",
          thumbnailUrl: "https://img.test/video-1.jpg",
          channelTitle: "Example Channel",
          videoUrl: "https://www.youtube.com/watch?v=video-1",
          viewCount: 100
        }}
        summaryHydrating={false}
        transcriptHydrating={false}
        transcriptLoading={false}
        transcriptText=""
        transcriptError={null}
        transcriptViewMode="summary"
        isTranscriptCopied={false}
        summaryLoading={false}
        summaryText={"Cached summary body\n\n- Model formatted point"}
        summaryKeyPoints={[]}
        summaryError={null}
        summaryModel="openai/gpt-4o-mini"
        isPublishingSummary={false}
        publishSummaryFeedback={null}
        summaryFormats={[summaryFormat]}
        summaryModelPresets={[]}
        activeSummaryFormat={summaryFormat}
        isSummaryPromptEditMode={false}
        editingSummaryFormatId={summaryFormat.id}
        summaryFormatNameDraft={summaryFormat.name}
        summaryPromptDraft={summaryFormat.prompt}
        summaryFormatModelDraft={summaryFormat.model}
        isNewSummaryModelDraftMode={false}
        summaryFormatDefaultDraft
        hasPublishableSummary
        isSummaryBusy={false}
        onCancel={() => undefined}
        setSummaryFormatNameDraft={() => undefined}
        setSummaryPromptDraft={() => undefined}
        setSummaryFormatModelDraft={() => undefined}
        setIsNewSummaryModelDraftMode={() => undefined}
        setSummaryFormatDefaultDraft={() => undefined}
        setActiveSummaryFormatId={() => undefined}
        setIsSummaryPromptEditMode={() => undefined}
        cancelSummaryFormatEditing={() => undefined}
        handleTranscriptViewModeChange={async () => undefined}
        copyTranscriptText={async () => undefined}
        regenerateSummary={async () => undefined}
        publishCurrentVideoSummary={async () => undefined}
        openSummaryFormatEditor={() => undefined}
        moveSummaryFormat={() => undefined}
        removeSummaryModelPreset={() => undefined}
        saveSummaryPromptAndClose={async () => undefined}
        deleteSummaryFormatAndClose={() => undefined}
      />
    );

    expect(screen.getByRole("combobox", { name: "Transcript view mode" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Copy summary" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Regenerate summary" })).toBeEnabled();
    const rawSummary = document.querySelector(".summary-raw-text");
    expect(rawSummary?.textContent).toBe("Cached summary body\n\n- Model formatted point");
  });
});
