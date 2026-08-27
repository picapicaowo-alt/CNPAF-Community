import { sourceKindLabel } from "@/lib/display-labels";

type Locale = "zh" | "en";

type RecordIdentity = {
  id: string;
  sourceKind: string;
  occurredAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

const sourceCodes: Record<string, string> = {
  field_visit: "FV",
  professor_interview: "PI",
  literature: "LR",
  other: "OT",
};

function recordDate(record: Pick<RecordIdentity, "occurredAt" | "updatedAt">) {
  const value = record.occurredAt ?? record.updatedAt;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function recordDateLabel(
  record: Pick<RecordIdentity, "occurredAt" | "updatedAt">,
  locale: Locale,
) {
  return recordDate(record)?.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }) ?? "";
}

export function recordReference(record: RecordIdentity) {
  const date = recordDate(record);
  const datePart = date ? date.toISOString().slice(0, 10).replaceAll("-", "") : "UNDATED";
  const sourcePart = sourceCodes[record.sourceKind] ?? "REC";
  return `${sourcePart}-${datePart}-${record.id.slice(0, 8).toUpperCase()}`;
}

export function recordCitationLabel(record: RecordIdentity, locale: Locale) {
  return [
    sourceKindLabel(record.sourceKind, locale),
    recordDateLabel(record, locale),
    recordReference(record),
  ].filter(Boolean).join(" · ");
}

export function recordDisplayName(
  record: { sourceKind: string; occurredAt?: string | Date | null; updatedAt?: string | Date | null },
  locale: Locale,
  context?: { locationName?: string | null; formName?: string | null },
) {
  const dateLabel = recordDateLabel(record, locale);
  return [
    context?.locationName,
    context?.formName ?? sourceKindLabel(record.sourceKind, locale),
    dateLabel,
  ].filter(Boolean).join(" · ");
}
