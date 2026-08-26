"use client";

import { aiSourceCitation, type AiDisplaySource } from "@/components/AiSourceList";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { displayAskCitationLabels } from "@/lib/ask-citation-display";

type AskRenderableSource = AiDisplaySource & { sourceId: string };

export function AskMarkdownMessage({
  content,
  locale,
  sources,
}: {
  content: string;
  locale: "zh" | "en";
  sources: AskRenderableSource[];
}) {
  const citations = sources.flatMap((source) => {
    if (!source.citationLabel) return [];
    const citation = aiSourceCitation(source, locale);
    return [{
      id: source.sourceId,
      label: source.citationLabel,
      displayLabel: citation.label,
      href: citation.href,
    }];
  });
  return (
    <MarkdownMessage>
      {displayAskCitationLabels(content, citations)}
    </MarkdownMessage>
  );
}
