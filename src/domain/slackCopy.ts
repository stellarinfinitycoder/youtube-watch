export type SlackSummaryCopyItem = {
  title: string;
  summary: string;
  videoUrl: string;
};

export type SlackSummaryCopyPayload = {
  text: string;
  html: string;
};

function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeSlackSummaryBody(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/```[\s\S]*?```/g, (match) =>
      match
        .replace(/^```[^\n]*\n?/, "")
        .replace(/\n?```$/, "")
        .trim()
    )
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
    .replace(/^[ \t]{0,3}[-*_]{3,}[ \t]*$/gm, "---")
    .replace(/^[ \t]{0,3}([-*+])[ \t]+/gm, "- ")
    .replace(/^[ \t]{0,3}\d+[.)][ \t]+/gm, (match) => match.trim().replace(/[.)][ \t]*$/, ". "))
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/~~([^~\n]+)~~/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatInlineMarkdownAsHtml(value: string): string {
  return escapeHtml(value)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>")
    .replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
}

function formatParagraphHtml(value: string): string {
  const boldLead = value.match(/^\*\*([^*\n]+)\*\*\s+(.+)$/);
  if (boldLead) {
    return `<strong>${escapeHtml(boldLead[1] ?? "")}</strong><br>${formatInlineMarkdownAsHtml(
      boldLead[2] ?? ""
    )}`;
  }

  const strongLead = value.match(/^__([^_\n]+)__\s+(.+)$/);
  if (strongLead) {
    return `<strong>${escapeHtml(strongLead[1] ?? "")}</strong><br>${formatInlineMarkdownAsHtml(
      strongLead[2] ?? ""
    )}`;
  }

  return formatInlineMarkdownAsHtml(value);
}

function formatSlackSummaryBodyHtml(value: string): string {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushParagraph = (): void => {
    const text = paragraph.join(" ").trim();
    if (text) {
      blocks.push(`${formatParagraphHtml(text)}<br><br>`);
    }
    paragraph = [];
  };

  const flushList = (): void => {
    if (listType && listItems.length > 0) {
      blocks.push(
        `<${listType}>${listItems
          .map((item) => `<li>${formatInlineMarkdownAsHtml(item)}</li>`)
          .join("")}</${listType}><br>`
      );
    }
    listItems = [];
    listType = null;
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      return;
    }

    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(`<strong>${formatInlineMarkdownAsHtml(heading[1] ?? "")}</strong><br>`);
      return;
    }

    const unordered = line.match(/^[-*+]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(unordered[1] ?? "");
      return;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(ordered[1] ?? "");
      return;
    }

    const quote = line.match(/^>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push(`<em>${formatInlineMarkdownAsHtml(quote[1] ?? "")}</em><br><br>`);
      return;
    }

    paragraph.push(line);
  });

  flushParagraph();
  flushList();
  return blocks.join("");
}

export function formatSlackSummaryCopyText(item: SlackSummaryCopyItem): string {
  const title = normalizeTitle(item.title);
  const summary = normalizeSlackSummaryBody(item.summary);
  const videoUrl = item.videoUrl.trim();

  if (!title || !summary || !videoUrl) {
    return "";
  }

  return [title, summary, videoUrl].join("\n\n");
}

export function formatSlackSummaryDigestCopyText(items: SlackSummaryCopyItem[]): string {
  return items
    .map(formatSlackSummaryCopyText)
    .filter((text) => text.length > 0)
    .join("\n\n---\n\n");
}

export function formatSlackSummaryCopyHtml(item: SlackSummaryCopyItem): string {
  const title = normalizeTitle(item.title);
  const summaryHtml = formatSlackSummaryBodyHtml(item.summary);
  const videoUrl = item.videoUrl.trim();

  if (!title || !summaryHtml || !videoUrl) {
    return "";
  }

  return [
    '<div>',
    `<strong>${escapeHtml(title)}</strong><br><br>`,
    summaryHtml,
    `<a href="${escapeHtml(videoUrl)}">${escapeHtml(videoUrl)}</a>`,
    "</div>"
  ].join("");
}

export function formatSlackSummaryDigestCopyHtml(items: SlackSummaryCopyItem[]): string {
  return items
    .map(formatSlackSummaryCopyHtml)
    .filter((html) => html.length > 0)
    .join('<hr style="margin:18px 0;border:0;border-top:1px solid #ddd;" />');
}

export function formatSlackSummaryCopyPayload(item: SlackSummaryCopyItem): SlackSummaryCopyPayload {
  return {
    text: formatSlackSummaryCopyText(item),
    html: formatSlackSummaryCopyHtml(item)
  };
}

export function formatSlackSummaryDigestCopyPayload(items: SlackSummaryCopyItem[]): SlackSummaryCopyPayload {
  return {
    text: formatSlackSummaryDigestCopyText(items),
    html: formatSlackSummaryDigestCopyHtml(items)
  };
}
