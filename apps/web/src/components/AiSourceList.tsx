"use client";

export type AiDisplaySource = {
  id: string;
  sourceType?: string | null;
  citationLabel?: string | null;
  excerpt?: string | null;
  metadata?: unknown;
};

type Props = {
  locale: "zh" | "en";
  sources: AiDisplaySource[];
};

function externalSource(source: AiDisplaySource) {
  if (source.sourceType !== "external_web" || !source.metadata || typeof source.metadata !== "object" || Array.isArray(source.metadata)) return null;
  const metadata = source.metadata as { title?: unknown; url?: unknown };
  if (typeof metadata.url !== "string") return null;
  try {
    const url = new URL(metadata.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return {
      title: typeof metadata.title === "string" && metadata.title.trim()
        ? metadata.title.trim()
        : source.excerpt || url.hostname,
      url: url.toString(),
      hostname: url.hostname.replace(/^www\./, ""),
    };
  } catch {
    return null;
  }
}

export function AiSourceList({ locale, sources }: Props) {
  const visibleSources = sources.flatMap((source) => {
    const external = externalSource(source);
    if (source.sourceType === "external_web" && !external) return [];
    return [{ source, external }];
  });
  const externalCount = visibleSources.filter((item) => item.external).length;
  const internalCount = visibleSources.length - externalCount;
  const summary = [
    internalCount ? (locale === "zh" ? `${internalCount} 个内部证据` : `${internalCount} internal ${internalCount === 1 ? "source" : "sources"}`) : "",
    externalCount ? (locale === "zh" ? `${externalCount} 个外部参考` : `${externalCount} external ${externalCount === 1 ? "source" : "sources"}`) : "",
  ].filter(Boolean).join(" · ");

  if (!visibleSources.length) return null;

  return (
    <details className="dataset-chat-sources ai-source-list">
      <summary>{summary}</summary>
      {visibleSources.map(({ source, external }) => external ? (
        <div className="evidence ai-external-source" key={source.id}>
          <span className="ai-source-kind">{locale === "zh" ? "外部来源" : "External source"}</span>
          <a href={external.url} rel="noopener noreferrer" target="_blank">
            <strong>{external.title}</strong>
            <span>{external.hostname}</span>
          </a>
        </div>
      ) : (
        <div className="evidence" key={source.id}>
          <span className="ai-source-kind">{locale === "zh" ? "内部证据" : "Internal evidence"}</span>
          <strong>{source.citationLabel ?? (locale === "zh" ? "来源" : "Source")}</strong>
          {source.excerpt ? <p>{source.excerpt}</p> : null}
        </div>
      ))}
    </details>
  );
}
