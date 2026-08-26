"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizeMarkdownForDisplay } from "@/lib/markdown";

export function MarkdownMessage({ children }: { children: string }) {
  return (
    <div className="markdown-message">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {normalizeMarkdownForDisplay(children)}
      </ReactMarkdown>
    </div>
  );
}
