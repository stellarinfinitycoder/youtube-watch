import { describe, expect, it } from "vitest";
import {
  formatSlackSummaryCopyHtml,
  formatSlackSummaryCopyText,
  formatSlackSummaryDigestCopyHtml,
  formatSlackSummaryDigestCopyText
} from "./slackCopy";

describe("slackCopy", () => {
  it("formats a single summary as Slack-ready plain text", () => {
    expect(
      formatSlackSummaryCopyText({
        title: "Example Video",
        summary: "Summary text",
        videoUrl: "https://www.youtube.com/watch?v=video-1"
      })
    ).toBe("Example Video\n\nSummary text\n\nhttps://www.youtube.com/watch?v=video-1");
  });

  it("separates digest items with a Slack-friendly divider", () => {
    expect(
      formatSlackSummaryDigestCopyText([
        {
          title: "Example Video",
          summary: "Summary text",
          videoUrl: "https://www.youtube.com/watch?v=video-1"
        },
        {
          title: "Second Video",
          summary: "Second summary",
          videoUrl: "https://www.youtube.com/watch?v=video-2"
        }
      ])
    ).toBe(
      [
        "Example Video\n\nSummary text\n\nhttps://www.youtube.com/watch?v=video-1",
        "Second Video\n\nSecond summary\n\nhttps://www.youtube.com/watch?v=video-2"
      ].join("\n\n---\n\n")
    );
  });

  it("skips invalid summary items", () => {
    expect(
      formatSlackSummaryDigestCopyText([
        {
          title: "Missing summary",
          summary: "",
          videoUrl: "https://www.youtube.com/watch?v=video-1"
        },
        {
          title: "Ready",
          summary: "Summary text",
          videoUrl: "https://www.youtube.com/watch?v=video-2"
        }
      ])
    ).toBe("Ready\n\nSummary text\n\nhttps://www.youtube.com/watch?v=video-2");
  });

  it("preserves title punctuation for plain text paste", () => {
    expect(
      formatSlackSummaryCopyText({
        title: "Why *AI* uses `tokens`",
        summary: "Summary text",
        videoUrl: "https://www.youtube.com/watch?v=video-1"
      })
    ).toBe("Why *AI* uses `tokens`\n\nSummary text\n\nhttps://www.youtube.com/watch?v=video-1");
  });

  it("removes unsupported Markdown markers from summary bodies", () => {
    expect(
      formatSlackSummaryCopyText({
        title: "Markdown Summary",
        summary: [
          "## Main point",
          "",
          "**Bold lead** with _emphasis_ and `inline code`.",
          "",
          "- First bullet",
          "* Second bullet",
          "1. Numbered item",
          "",
          "[Source](https://example.com)",
          "",
          "> Quoted note"
        ].join("\n"),
        videoUrl: "https://www.youtube.com/watch?v=video-1"
      })
    ).toBe(
      [
        "Markdown Summary",
        [
          "Main point",
          "",
          "Bold lead with emphasis and inline code.",
          "",
          "- First bullet",
          "- Second bullet",
          "1. Numbered item",
          "",
          "Source (https://example.com)",
          "",
          "Quoted note"
        ].join("\n"),
        "https://www.youtube.com/watch?v=video-1"
      ].join("\n\n")
    );
  });

  it("formats summary bodies as rich HTML for Slack paste", () => {
    const html = formatSlackSummaryCopyHtml({
      title: "Formatted Video",
      summary: [
        "## Main point",
        "",
        "**Bold lead** with _emphasis_.",
        "",
        "- First bullet",
        "- Second bullet",
        "",
        "[Source](https://example.com)"
      ].join("\n"),
      videoUrl: "https://www.youtube.com/watch?v=video-1"
    });

    expect(html).toContain("<strong>Formatted Video</strong><br><br>");
    expect(html).toContain("<strong>Main point</strong><br>");
    expect(html).toContain("<strong>Bold lead</strong><br>with <em>emphasis</em>.");
    expect(html).toContain("<ul");
    expect(html).toContain("</ul><br>");
    expect(html).toContain("<li>First bullet</li>");
    expect(html).toContain('<a href="https://example.com">Source</a>');
    expect(html).toContain(
      '<a href="https://www.youtube.com/watch?v=video-1">https://www.youtube.com/watch?v=video-1</a>'
    );
  });

  it("separates rich digest items with a divider", () => {
    const html = formatSlackSummaryDigestCopyHtml([
      {
        title: "First",
        summary: "First summary",
        videoUrl: "https://www.youtube.com/watch?v=video-1"
      },
      {
        title: "Second",
        summary: "Second summary",
        videoUrl: "https://www.youtube.com/watch?v=video-2"
      }
    ]);

    expect(html).toContain("<hr");
    expect(html).toContain("<strong>First</strong>");
    expect(html).toContain("<strong>Second</strong>");
  });

  it("puts text after a bold lead on the next line in rich HTML", () => {
    const html = formatSlackSummaryCopyHtml({
      title: "Lead Test",
      summary: "**Actionable recommendations for individuals and builders** Individuals are advised to break jobs into tasks.",
      videoUrl: "https://www.youtube.com/watch?v=video-1"
    });

    expect(html).toContain(
      "<strong>Actionable recommendations for individuals and builders</strong><br>Individuals are advised"
    );
  });
});
