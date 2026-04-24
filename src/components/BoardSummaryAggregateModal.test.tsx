import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoardSummaryAggregateModal } from "./BoardSummaryAggregateModal";

vi.mock("antd", async () => {
  const actual = await vi.importActual<typeof import("antd")>("antd");

  return {
    ...actual,
    Modal: ({
      title,
      open,
      children,
      className,
      width
    }: {
      title?: ReactNode;
      open?: boolean;
      children?: ReactNode;
      className?: string;
      width?: string | number;
    }) => {
      if (!open) {
        return null;
      }

      return (
        <div className={className} data-modal-width={String(width ?? "")}>
          <div className="ant-modal">
            <div className="ant-modal-content" role="dialog">
              <div className="ant-modal-header">{title}</div>
              <div className="ant-modal-body">{children}</div>
            </div>
          </div>
        </div>
      );
    }
  };
});

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

  it("uses the same responsive width as the video player modal", () => {
    render(
      <BoardSummaryAggregateModal
        open
        loading={false}
        error={null}
        summaryText="Combined summary"
        summaryKeyPoints={[]}
        summaryModel="openai/gpt-4o-mini"
        summaryFormats={summaryFormats}
        selectedSummaryFormatId="summary-default"
        isCopied={false}
        onSummaryFormatChange={() => undefined}
        onCancel={() => undefined}
        onCopy={async () => undefined}
      />
    );

    const modalRoot = screen.getByRole("dialog").closest(".board-summary-aggregate-modal");
    expect(modalRoot).toHaveAttribute(
      "data-modal-width",
      "min(1480px, 70vw)"
    );
  });
});
