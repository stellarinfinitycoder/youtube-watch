import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type SummaryMarkdownRendererProps = {
  content: string;
};

function SummaryMarkdownRendererComponent({ content }: SummaryMarkdownRendererProps) {
  return (
    <div className="summary-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

export default memo(SummaryMarkdownRendererComponent);
