import type { RecordFieldAnswer } from "./types";
import { AppIcon } from "@/components/AppIcon";

type Props = {
  answers: RecordFieldAnswer[];
  locale: "zh" | "en";
  title?: string;
  selectedFieldIds?: string[];
  onFieldSelectionChange?: (fieldId: string, selected: boolean) => void;
};

export function FieldAnswersPanel({
  answers,
  locale,
  title,
  selectedFieldIds = [],
  onFieldSelectionChange,
}: Props) {
  const sortedAnswers = answers.toSorted(
    (left, right) =>
      left.sectionSortOrder - right.sectionSortOrder ||
      left.fieldSortOrder - right.fieldSortOrder,
  );
  const sections = sortedAnswers.reduce((groups, answer) => {
    const key = `${answer.sectionSortOrder}:${answer.sectionKey}`;
    const group = groups.get(key) ?? [];
    group.push(answer);
    groups.set(key, group);
    return groups;
  }, new Map<string, RecordFieldAnswer[]>());

  if (!answers.length) return null;

  return (
    <section className="card stack field-answers-card">
      <div className="card-section-heading">
        <span className="card-section-icon">
          <AppIcon name="forms" />
        </span>
        <div>
          <span className="eyebrow">
            {locale === "zh" ? "原始提交" : "Original submission"}
          </span>
          <h2>{title ?? (locale === "zh" ? "表单回答" : "Form answers")}</h2>
        </div>
      </div>
      {[...sections.entries()].map(([sectionKey, sectionAnswers]) => {
        const section = sectionAnswers[0];
        return (
          <div className="stack-sm" key={sectionKey}>
            <h3>
              {locale === "zh" ? section.sectionLabelZh : section.sectionLabelEn}
            </h3>
            <dl className="definition-list">
              {sectionAnswers.map((answer) => (
                <div className="definition-row" key={answer.id}>
                  <dt>
                    {onFieldSelectionChange ? (
                      <label className="choice choice-inline">
                        <input
                          checked={selectedFieldIds.includes(answer.templateFieldId)}
                          onChange={(event) =>
                            onFieldSelectionChange(
                              answer.templateFieldId,
                              event.target.checked,
                            )
                          }
                          type="checkbox"
                        />
                        <span>{locale === "zh" ? answer.labelZh : answer.labelEn}</span>
                      </label>
                    ) : locale === "zh" ? (
                      answer.labelZh
                    ) : (
                      answer.labelEn
                    )}
                    <span className="caption" style={{ display: "block" }}>
                      {answer.fieldKey} · {answer.fieldTypeKey}
                    </span>
                  </dt>
                  <dd>{answerDisplay(answer, locale)}</dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </section>
  );
}

function answerDisplay(answer: RecordFieldAnswer, locale: "zh" | "en") {
  const parts: string[] = [];
  if (answer.missingReasonKey) {
    parts.push(
      `${locale === "zh" ? "未记录" : "Missing"}: ${answer.missingReasonKey}`,
    );
  }
  if (answer.value !== null && answer.value !== undefined) {
    parts.push(
      Array.isArray(answer.value)
        ? answer.value.join(", ")
        : typeof answer.value === "boolean"
          ? answer.value
            ? locale === "zh"
              ? "是"
              : "Yes"
            : locale === "zh"
              ? "否"
              : "No"
          : String(answer.value),
    );
  }
  if (answer.customText) {
    parts.push(`${locale === "zh" ? "其他" : "Other"}: ${answer.customText}`);
  }
  return parts.join(" · ") || "—";
}
