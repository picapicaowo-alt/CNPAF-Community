import { AppIcon } from "@/components/AppIcon";
import { StatusPill } from "@/components/ui";

export type ReviewAiSuggestion = {
  id: string;
  kind: string;
  statement: string;
  confidence?: string | null;
  evidence?: unknown;
};

type Props = {
  findings: ReviewAiSuggestion[];
  locale: "zh" | "en";
  selectedFindingIds: string[];
  onSelectionChange: (findingId: string, selected: boolean) => void;
};

const KIND_LABELS: Record<string, { zh: string; en: string }> = {
  summary: { zh: "摘要", en: "Summary" },
  theme: { zh: "主题", en: "Theme" },
  concern: { zh: "关注点", en: "Concern" },
  safety_suspect: { zh: "安全提示", en: "Safety prompt" },
};

function kindLabel(kind: string, locale: "zh" | "en") {
  return KIND_LABELS[kind]?.[locale] ?? kind.replaceAll("_", " ");
}

function confidenceLabel(
  confidence: string | null | undefined,
  locale: "zh" | "en",
) {
  const value = Number(confidence);
  if (!Number.isFinite(value)) return null;
  return locale === "zh"
    ? `置信度 ${Math.round(value * 100)}%`
    : `${Math.round(value * 100)}% confidence`;
}

function evidenceText(evidence: unknown) {
  if (!Array.isArray(evidence)) return [];
  return evidence.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const text = (item as { text?: unknown }).text;
    return typeof text === "string" && text.trim() ? [text.trim()] : [];
  });
}

export function AiSuggestionsPanel({
  findings,
  locale,
  selectedFindingIds,
  onSelectionChange,
}: Props) {
  if (!findings.length) return null;

  return (
    <section className="card stack ai-review-suggestions">
      <div className="ai-review-suggestions-heading">
        <span className="card-section-icon ai-icon">
          <AppIcon name="sparkles" />
        </span>
        <div>
          <h2>{locale === "zh" ? "此记录的 AI 建议" : "AI suggestions for this record"}</h2>
          <p>
            {locale === "zh"
              ? "建议只对应上方这条记录，默认不采纳。勾选后会在批准时一并提交，未勾选的建议将记为不采纳。"
              : "These suggestions belong only to the record above. Selected suggestions are submitted with approval; unselected suggestions are recorded as not accepted."}
          </p>
        </div>
        <StatusPill tone="blue">
          {locale === "zh" ? `${findings.length} 条` : findings.length}
        </StatusPill>
      </div>
      <div className="ai-review-suggestion-list">
        {findings.map((finding) => {
          const excerpts = evidenceText(finding.evidence);
          const confidence = confidenceLabel(finding.confidence, locale);
          return (
            <label className="ai-review-suggestion" key={finding.id}>
              <input
                checked={selectedFindingIds.includes(finding.id)}
                onChange={(event) =>
                  onSelectionChange(finding.id, event.target.checked)
                }
                type="checkbox"
              />
              <span className="ai-review-suggestion-copy">
                <span className="ai-review-suggestion-meta">
                  <strong>{kindLabel(finding.kind, locale)}</strong>
                  {confidence ? <span>{confidence}</span> : null}
                </span>
                <span className="ai-review-suggestion-statement">
                  {finding.statement}
                </span>
                {excerpts.length ? (
                  <span className="ai-review-suggestion-evidence">
                    {locale === "zh" ? "依据：" : "Evidence: "}
                    {excerpts.join(" · ")}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
