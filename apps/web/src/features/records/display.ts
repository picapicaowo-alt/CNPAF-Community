import { sourceKindLabel } from "@/lib/display-labels";

type Locale = "zh" | "en";

const sourceCodes: Record<string, string> = {
  field_visit: "FV",
  professor_interview: "PI",
  literature: "LR",
  other: "OT",
};

export function recordReference(record: {
  id: string;
  sourceKind: string;
  occurredAt?: string | Date | null;
  updatedAt?: string | Date | null;
}) {
  const date = new Date(record.occurredAt ?? record.updatedAt ?? Date.now());
  const datePart = Number.isNaN(date.getTime())
    ? "UNDATED"
    : date.toISOString().slice(0, 10).replaceAll("-", "");
  const sourcePart = sourceCodes[record.sourceKind] ?? "REC";
  return `${sourcePart}-${datePart}-${record.id.slice(0, 8).toUpperCase()}`;
}

export function recordDisplayName(
  record: { sourceKind: string; occurredAt?: string | Date | null; updatedAt?: string | Date | null },
  locale: Locale,
  context?: { locationName?: string | null; formName?: string | null },
) {
  const date = new Date(record.occurredAt ?? record.updatedAt ?? Date.now());
  const dateLabel = Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
  return [
    context?.locationName,
    context?.formName ?? sourceKindLabel(record.sourceKind, locale),
    dateLabel,
  ].filter(Boolean).join(" · ");
}
