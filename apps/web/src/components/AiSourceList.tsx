"use client";

import Link from "next/link";
import { recordReference } from "@/features/records/display";
import { sourceKindLabel } from "@/lib/display-labels";

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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function internalRecordSource(source: AiDisplaySource, locale: "zh" | "en") {
  if (!source.metadata || typeof source.metadata !== "object" || Array.isArray(source.metadata)) return null;
  const metadata = source.metadata as {
    recordId?: unknown;
    recordReference?: unknown;
    sourceKind?: unknown;
    occurredAt?: unknown;
    snapshotMode?: unknown;
  };
  if (
    typeof metadata.recordId !== "string" ||
    !uuidPattern.test(metadata.recordId) ||
    typeof metadata.sourceKind !== "string"
  ) return null;
  const occurredAt = typeof metadata.occurredAt === "string" ? metadata.occurredAt : null;
  const occurredDate = occurredAt ? new Date(occurredAt) : null;
  const dateLabel = occurredDate && !Number.isNaN(occurredDate.getTime())
    ? occurredDate.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;
  const reference = typeof metadata.recordReference === "string" && metadata.recordReference.trim()
    ? metadata.recordReference.trim()
    : recordReference({
        id: metadata.recordId,
        sourceKind: metadata.sourceKind,
        occurredAt,
      });
  return {
    href: `/records/${metadata.recordId}`,
    reference,
    label: [sourceKindLabel(metadata.sourceKind, locale), dateLabel, reference].filter(Boolean).join(" · "),
    snapshotMode: metadata.snapshotMode === "dataset" ? "dataset" as const : "live" as const,
  };
}

export function aiSourceCitation(
  source: AiDisplaySource,
  locale: "zh" | "en",
): { label: string; href?: string } {
  const record = internalRecordSource(source, locale);
  return record
    ? { label: record.label, href: record.href }
    : { label: source.citationLabel ?? (locale === "zh" ? "来源" : "Source") };
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
      ) : (() => {
        const record = internalRecordSource(source, locale);
        return (
          <div className="evidence" key={source.id}>
            <span className="ai-source-kind">
              {record?.snapshotMode === "dataset"
                ? (locale === "zh" ? "Dataset 固定快照" : "Pinned Dataset snapshot")
                : (locale === "zh" ? "实时内部证据" : "Live internal evidence")}
            </span>
            {record ? (
              <Link className="ai-internal-record-source" href={record.href}>
                <strong>{record.label}</strong>
                <span>{locale === "zh" ? `记录编号 ${record.reference} · 打开原记录` : `Record ${record.reference} · Open record`}</span>
              </Link>
            ) : <strong>{source.citationLabel ?? (locale === "zh" ? "来源" : "Source")}</strong>}
            {source.excerpt ? <p>{source.excerpt}</p> : null}
          </div>
        );
      })())}
    </details>
  );
}
