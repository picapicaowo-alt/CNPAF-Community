import type { RecordFieldAnswer } from "./types";
import { AppIcon } from "@/components/AppIcon";

type Props = {
  answers: RecordFieldAnswer[];
  locale: "zh" | "en";
  title?: string;
  selectedFieldIds?: string[];
  onFieldSelectionChange?: (fieldId: string, selected: boolean) => void;
  selectionDescription?: string;
};

export function FieldAnswersPanel({
  answers,
  locale,
  title,
  selectedFieldIds = [],
  onFieldSelectionChange,
  selectionDescription,
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
      {onFieldSelectionChange && selectionDescription ? (
        <p className="feedback feedback-info field-selection-help">
          <AppIcon name="info" />
          <span>{selectionDescription}</span>
        </p>
      ) : null}
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
                      {fieldTypeLabel(answer.fieldTypeKey, locale)}
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

const FIELD_TYPE_LABELS: Record<string, { zh: string; en: string }> = {
  boolean: { zh: "是／否", en: "Yes / no" },
  date: { zh: "日期", en: "Date" },
  long_text: { zh: "长文本", en: "Long text" },
  multi_select: { zh: "多选", en: "Multiple choice" },
  number: { zh: "数字", en: "Number" },
  rating_scale: { zh: "评分量表", en: "Rating scale" },
  select: { zh: "单选", en: "Single choice" },
  single_select: { zh: "单选", en: "Single choice" },
  short_text: { zh: "短文本", en: "Short text" },
};

function fieldTypeLabel(fieldTypeKey: string, locale: "zh" | "en") {
  return FIELD_TYPE_LABELS[fieldTypeKey]?.[locale]
    ?? (locale === "zh" ? "结构化回答" : "Structured answer");
}

function answerDisplay(answer: RecordFieldAnswer, locale: "zh" | "en") {
  const parts: string[] = [];
  if (answer.missingReasonKey) {
    parts.push(
      `${locale === "zh" ? "未记录" : "Missing"}: ${localizedAnswerValue(answer.fieldKey, answer.missingReasonKey, locale)}`,
    );
  }
  if (answer.value !== null && answer.value !== undefined) {
    parts.push(
      Array.isArray(answer.value)
        ? answer.value.map((value) => localizedAnswerValue(answer.fieldKey, value, locale)).join(", ")
        : typeof answer.value === "boolean"
          ? answer.value
            ? locale === "zh"
              ? "是"
              : "Yes"
            : locale === "zh"
              ? "否"
              : "No"
          : localizedAnswerValue(answer.fieldKey, answer.value, locale),
    );
  }
  if (answer.customText) {
    parts.push(`${locale === "zh" ? "其他" : "Other"}: ${answer.customText}`);
  }
  return parts.join(" · ") || "—";
}

const ANSWER_VALUE_LABELS: Record<string, Record<string, { zh: string; en: string }>> = {
  "activity-type": {
    creative: { zh: "创作活动", en: "Creative activity" },
    exercise: { zh: "运动或锻炼", en: "Movement or exercise" },
    music: { zh: "音乐活动", en: "Music activity" },
    discussion: { zh: "讨论或讲故事", en: "Discussion or storytelling" },
    quiet: { zh: "安静的个人活动", en: "Quiet individual activity" },
  },
  "language-access": {
    mandarin: { zh: "普通话", en: "Mandarin" },
    cantonese: { zh: "粤语", en: "Cantonese" },
    english: { zh: "英语", en: "English" },
    spanish: { zh: "西班牙语", en: "Spanish" },
    vietnamese: { zh: "越南语", en: "Vietnamese" },
  },
  "alternative-explanations": {
    activity_design: { zh: "活动设计", en: "Activity design" },
    fatigue: { zh: "疲劳或时段", en: "Fatigue or time of day" },
    hearing_access: { zh: "听力或感官可及性", en: "Hearing or sensory access" },
    social_connection: { zh: "社会连接需求", en: "Social connection need" },
    grief: { zh: "失落或哀伤", en: "Loss or grief" },
    cognitive_change: { zh: "可能的认知变化", en: "Possible cognitive change" },
  },
  "attention-change-minute": {
    not_observed: { zh: "本次未观察到", en: "Not observed in this session" },
  },
};

function localizedAnswerValue(fieldKey: string, value: unknown, locale: "zh" | "en") {
  const key = String(value);
  return ANSWER_VALUE_LABELS[fieldKey]?.[key]?.[locale] ?? key;
}
