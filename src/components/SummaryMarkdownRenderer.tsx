import { Children, cloneElement, isValidElement, memo, type ReactElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type SummaryMarkdownRendererProps = {
  content: string;
};

const wikiLinkPattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const wikiLinkHrefPrefix = "#obsidian-wikilink=";
const calloutPattern = /^\[!([a-z][\w-]*)\][ \t]*([^\n]*)/i;

function normalizeWikiLinks(content: string): string {
  return content.replace(wikiLinkPattern, (_match, page: string, alias?: string) => {
    const label = alias?.trim() || page.trim();
    return `[${label}](${wikiLinkHrefPrefix}${encodeURIComponent(page.trim())})`;
  });
}

function normalizeObsidianMarkdown(content: string): string {
  return normalizeWikiLinks(content);
}

function getTextContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getTextContent).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return getTextContent(node.props.children);
  }

  return "";
}

function trimCalloutMarker(children: ReactNode): ReactNode {
  let markerRemoved = false;

  return Children.map(children, (child) => {
    if (markerRemoved || !isValidElement<{ children?: ReactNode }>(child)) {
      return child;
    }

    const childText = getTextContent(child.props.children).trimStart();
    const markerMatch = childText.match(calloutPattern);
    if (!markerMatch) {
      return child;
    }

    markerRemoved = true;
    const nextChildren = removeCalloutMarkerFromChildren(child.props.children);
    if (!hasRenderableContent(nextChildren)) {
      return null;
    }

    return cloneElement(child as ReactElement<{ children?: ReactNode }>, { children: nextChildren });
  });
}

function removeCalloutMarkerFromChildren(children: ReactNode): ReactNode {
  let markerRemoved = false;

  return Children.map(children, (child) => {
    if (markerRemoved) {
      return child;
    }

    if (typeof child === "string") {
      const markerMatch = child.match(/^[\s\n]*\[![a-z][\w-]*\][ \t]*[^\n]*(?:\n)?([\s\S]*)$/i);
      if (!markerMatch) {
        return child;
      }

      markerRemoved = true;
      const remainingText = markerMatch[1].trimStart();
      return remainingText || null;
    }

    if (isValidElement<{ children?: ReactNode }>(child)) {
      const nextChildren = removeCalloutMarkerFromChildren(child.props.children);
      if (!hasRenderableContent(nextChildren)) {
        return null;
      }

      markerRemoved = true;
      return cloneElement(child as ReactElement<{ children?: ReactNode }>, { children: nextChildren });
    }

    return child;
  });
}

function hasRenderableContent(node: ReactNode): boolean {
  return Children.toArray(node).some((child) => {
    if (typeof child === "string") {
      return child.trim().length > 0;
    }

    return true;
  });
}

function SummaryParagraph({ children }: { children?: ReactNode }) {
  const childList = Children.toArray(children);
  const [firstChild, secondChild, ...remainingChildren] = childList;
  const secondText = typeof secondChild === "string" ? secondChild : "";
  const bodyText = secondText.trimStart();

  if (
    isValidElement(firstChild) &&
    firstChild.type === "strong" &&
    /^\s/.test(secondText) &&
    bodyText.length > 0
  ) {
    return (
      <p className="summary-bold-lead">
        {firstChild}
        <span>
          {bodyText}
          {remainingChildren}
        </span>
      </p>
    );
  }

  return <p>{children}</p>;
}

function SummaryBlockquote({ children }: { children?: ReactNode }) {
  const childList = Children.toArray(children);
  const firstChild = childList.find((child) => getTextContent(child).trim().length > 0);
  const firstText = getTextContent(firstChild).trimStart();
  const calloutMatch = firstText.match(calloutPattern);

  if (!calloutMatch) {
    return <blockquote>{children}</blockquote>;
  }

  const [, type, title] = calloutMatch;
  const calloutLabel = type.toLowerCase();
  const calloutTitle = title.trim() || calloutLabel;

  return (
    <blockquote className="summary-callout" data-callout={calloutLabel}>
      <div className="summary-callout-title">{calloutTitle}</div>
      <div className="summary-callout-body">{trimCalloutMarker(children)}</div>
    </blockquote>
  );
}

function SummaryMarkdownRendererComponent({ content }: SummaryMarkdownRendererProps) {
  const normalizedContent = normalizeObsidianMarkdown(content);

  return (
    <div className="summary-markdown">
      <ReactMarkdown
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith(wikiLinkHrefPrefix)) {
              const page = decodeURIComponent(href.slice(wikiLinkHrefPrefix.length));
              return (
                <span className="summary-wikilink" data-page={page}>
                  {children}
                </span>
              );
            }

            return <a href={href}>{children}</a>;
          },
          blockquote: SummaryBlockquote,
          p: SummaryParagraph
        }}
        remarkPlugins={[remarkGfm]}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}

export default memo(SummaryMarkdownRendererComponent);
