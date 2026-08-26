import { AppIcon } from "@/components/AppIcon";

type Props = {
  locale: "zh" | "en";
  value: unknown;
};

type EvidenceRow = { label: string; value: string };

export function hasStructuredEvidence(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return String(value).trim().length > 0;
}

export function StructuredEvidencePanel({ locale, value }: Props) {
  if (!hasStructuredEvidence(value)) return null;
  const rows = evidenceRows(value, locale);
  if (!rows.length) return null;

  return (
    <section className="card stack-sm structured-evidence-card">
      <div className="card-section-heading">
        <span className="card-section-icon">
          <AppIcon name="data" />
        </span>
        <div>
          <span className="eyebrow">
            {locale === "zh" ? "可筛选的数据" : "Filterable data"}
          </span>
          <h2>{locale === "zh" ? "结构化证据" : "Structured evidence"}</h2>
        </div>
      </div>
      <p className="muted">
        {locale === "zh"
          ? "这些是按字段保存的标准化值，可用于筛选、图表、数据集导出和 AI 交叉核验；它们不是 AI 生成的结论。"
          : "These normalized field values support filters, charts, Dataset exports, and AI cross-checking. They are not AI-generated conclusions."}
      </p>
      <dl className="definition-list">
        {rows.map((row) => (
          <div className="definition-row" key={row.label}>
            <dt>{readableLabel(row.label, locale)}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function evidenceRows(value: unknown, locale: "zh" | "en", prefix = ""): EvidenceRow[] {
  if (Array.isArray(value)) {
    return [{ label: prefix || "value", value: value.map((entry) => displayValue(entry, locale)).join(", ") }];
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) => {
      const label = prefix ? `${prefix}.${key}` : key;
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        return evidenceRows(entry, locale, label);
      }
      return [{ label, value: displayValue(entry, locale) }];
    });
  }
  return prefix ? [{ label: prefix, value: displayValue(value, locale) }] : [];
}

function displayValue(value: unknown, locale: "zh" | "en"): string {
  if (Array.isArray(value)) return value.map((entry) => displayValue(entry, locale)).join(", ");
  if (value === true) return locale === "zh" ? "是" : "Yes";
  if (value === false) return locale === "zh" ? "否" : "No";
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

const EVIDENCE_LABELS: Record<string, { zh: string; en: string }> = {
  attendance: { zh: "参与人数", en: "Participants" },
  sessionDurationMinutes: { zh: "活动时长（分钟）", en: "Session duration (minutes)" },
  attentionChangeMinute: { zh: "注意力变化时间（分钟）", en: "Attention change (minute)" },
  earlyDepartures: { zh: "提前离场人数", en: "Early departures" },
  engagementRating: { zh: "参与投入度", en: "Engagement rating" },
  lonelinessMentions: { zh: "孤独相关表达次数", en: "Loneliness-related mentions" },
};

function readableLabel(value: string, locale: "zh" | "en") {
  if (EVIDENCE_LABELS[value]) return EVIDENCE_LABELS[value][locale];
  return value
    .replaceAll(".", " › ")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
