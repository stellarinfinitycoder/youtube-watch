import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoardSummaryAggregateModal } from "./BoardSummaryAggregateModal";

const summaryFormats = [
  {
    id: "summary-default",
    name: "Summary",
    prompt: "Default prompt",
    model: "",
    isDefault: true,
    createdAt: 1,
    updatedAt: 1
  },
  {
    id: "summary-alt",
    name: "Alt",
    prompt: "Alt prompt",
    model: "openai/gpt-4o-mini",
    isDefault: false,
    createdAt: 2,
    updatedAt: 2
  }
];

describe("BoardSummaryAggregateModal", () => {
  beforeEach(() => {
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      ((element: Element) =>
        ({
          getPropertyValue: () => "",
          overflow: element instanceof HTMLElement ? element.style.overflow || "" : ""
        }) as CSSStyleDeclaration) as typeof window.getComputedStyle
    );
  });

  it("renders markdown summary content and notifies on format change", async () => {
    const onSummaryFormatChange = vi.fn();

    render(
      <BoardSummaryAggregateModal
        open
        loading={false}
        error={null}
        summaryText={"## Combined summary\n\n- First point"}
        summaryKeyPoints={[]}
        summaryModel="openai/gpt-4o-mini"
        summaryFormats={summaryFormats}
        selectedSummaryFormatId="summary-default"
        isCopied={false}
        onSummaryFormatChange={onSummaryFormatChange}
        onCancel={() => undefined}
        onCopy={async () => undefined}
      />
    );

    expect(screen.getByText("SUMMARY")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Combined summary" })).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("First point");

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Summary of summaries format" }));
    fireEvent.click(await screen.findByText("ALT"));

    expect(onSummaryFormatChange).toHaveBeenCalledWith(
      "summary-alt",
      expect.objectContaining({ value: "summary-alt" })
    );
  });
});
