import { render, screen, within } from "@testing-library/react";

import SummaryMarkdownRenderer from "./SummaryMarkdownRenderer";

describe("SummaryMarkdownRenderer", () => {
  it("renders Obsidian wikilinks with page labels", () => {
    const { container } = render(<SummaryMarkdownRenderer content="Read [[Memory System]] next." />);

    const wikilink = screen.getByText("Memory System");
    expect(wikilink).toHaveClass("summary-wikilink");
    expect(wikilink).toHaveAttribute("data-page", "Memory System");
    expect(container.querySelector("a")).not.toBeInTheDocument();
  });

  it("renders Obsidian wikilinks with aliases", () => {
    render(<SummaryMarkdownRenderer content="Read [[Memory System|the memory note]] next." />);

    const wikilink = screen.getByText("the memory note");
    expect(wikilink).toHaveClass("summary-wikilink");
    expect(wikilink).toHaveAttribute("data-page", "Memory System");
  });

  it("renders Obsidian callouts and preserves nested Markdown body content", () => {
    const content = "> [!note] Useful context\n> This body has **important** context.";
    const { container } = render(<SummaryMarkdownRenderer content={content} />);

    const callout = container.querySelector(".summary-callout");
    expect(callout).toBeInTheDocument();
    expect(callout).toHaveAttribute("data-callout", "note");
    expect(within(callout as HTMLElement).getByText("Useful context")).toHaveClass(
      "summary-callout-title"
    );
    expect(within(callout as HTMLElement).getByText(/This body has/)).toBeInTheDocument();
    expect(within(callout as HTMLElement).getByText("important").tagName).toBe("STRONG");
  });

  it("renders same-line bold lead-ins as paragraph-size bold text with body below", () => {
    const { container } = render(
      <SummaryMarkdownRenderer content="**No One-Size-Fits-All Memory System** Every brain is different." />
    );

    expect(screen.queryByRole("heading", { name: "No One-Size-Fits-All Memory System" })).not.toBeInTheDocument();
    expect(screen.getByText("No One-Size-Fits-All Memory System").tagName).toBe("STRONG");
    expect(screen.getByText("Every brain is different.")).toBeInTheDocument();
    expect(container.querySelector(".summary-bold-lead")).toBeInTheDocument();
  });

  it("renders soft-break bold title lines as paragraph-size bold text with body below", () => {
    const { container } = render(
      <SummaryMarkdownRenderer
        content={
          "**No One-Size-Fits-All Memory System**\nBrains and workflows differ.\n\n**Complement, Don't Replace**\nLayer your custom memory."
        }
      />
    );

    expect(screen.queryByRole("heading", { name: "No One-Size-Fits-All Memory System" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Complement, Don't Replace" })).not.toBeInTheDocument();
    expect(screen.getByText("No One-Size-Fits-All Memory System").tagName).toBe("STRONG");
    expect(screen.getByText("Complement, Don't Replace").tagName).toBe("STRONG");
    expect(screen.getByText("Brains and workflows differ.")).toBeInTheDocument();
    expect(screen.getByText("Layer your custom memory.")).toBeInTheDocument();
    expect(container.querySelectorAll(".summary-bold-lead")).toHaveLength(2);
  });

  it("keeps standard headings, lists, and inline bold text working", () => {
    render(
      <SummaryMarkdownRenderer
        content={"# Main title\n\n## Section title\n\n### Detail title\n\n- A **strong** point"}
      />
    );

    expect(screen.getByRole("heading", { level: 1, name: "Main title" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Section title" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Detail title" })).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("A strong point");
    expect(screen.getByText("strong")).toBeInTheDocument();
  });
});
