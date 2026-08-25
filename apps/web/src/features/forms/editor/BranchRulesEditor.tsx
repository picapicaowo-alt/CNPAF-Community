"use client";

import type {
  FormBranchAction,
  FormBranchRule,
  FormControlKind,
  FormVisibilityCondition,
  FormVisibilityOperator,
  RuntimeFormField,
  RuntimeFormOption,
  RuntimeFormSection,
} from "@cnpaf/shared";
import { ConditionValueInput } from "./VisibilityRulesEditor";

type Props = {
  control: FormControlKind;
  field: RuntimeFormField;
  laterSections: RuntimeFormSection[];
  locale: "zh" | "en";
  onChange: (rules: FormBranchRule[]) => void;
  options: RuntimeFormOption[];
  rules: FormBranchRule[];
  showIntro?: boolean;
};

const operators: Array<{
  key: FormVisibilityOperator;
  en: string;
  zh: string;
}> = [
  { key: "equals", en: "equals", zh: "等于" },
  { key: "not_equals", en: "does not equal", zh: "不等于" },
  { key: "includes", en: "contains", zh: "包含" },
  { key: "not_includes", en: "does not contain", zh: "不包含" },
  { key: "answered", en: "is answered", zh: "已回答" },
  { key: "not_answered", en: "is not answered", zh: "未回答" },
];

export function BranchRulesEditor({
  control,
  field,
  laterSections,
  locale,
  onChange,
  options,
  rules,
  showIntro = true,
}: Props) {
  function update(index: number, patch: Partial<FormBranchRule>) {
    onChange(
      rules.map((rule, currentIndex) =>
        currentIndex === index ? { ...rule, ...patch } : rule,
      ),
    );
  }

  function add() {
    const target = laterSections[0];
    onChange([
      ...rules,
      target
        ? {
            operator: "answered",
            action: "go_to_section",
            targetSectionKey: target.key,
          }
        : { operator: "answered", action: "end_form" },
    ]);
  }

  if (control === "display") return null;

  return (
    <div className="stack-sm form-fieldset">
      <div className={`row-between mobile-stack${showIntro ? "" : " builder-rule-actions"}`}>
        {showIntro ? (
          <div>
            <h3>{locale === "zh" ? "回答后跳转" : "Branch after answer"}</h3>
            <p className="caption">
              {locale === "zh"
                ? "作答后按顺序判断；首条命中规则会跳到后续章节，或直接进入提交检查。"
                : "Checked after answering. The first match jumps forward or opens review."}
            </p>
          </div>
        ) : <span />}
        <button
          className="button button-secondary button-small"
          onClick={add}
          type="button"
        >
          {locale === "zh" ? "添加跳转规则" : "Add branch rule"}
        </button>
      </div>
      {rules.map((rule, index) => {
        const needsValue = !["answered", "not_answered"].includes(
          rule.operator,
        );
        const condition: FormVisibilityCondition = {
          fieldKey: field.key,
          operator: rule.operator,
          value: rule.value,
        };
        return (
          <div className="form-grid" key={`${rule.action}-${index}`}>
            <label>
              {locale === "zh" ? "当前答案" : "Current answer"}
              <select
                onChange={(event) =>
                  update(index, {
                    operator: event.target.value as FormVisibilityOperator,
                    value: undefined,
                  })
                }
                value={rule.operator}
              >
                {operators.map((operator) => (
                  <option key={operator.key} value={operator.key}>
                    {locale === "zh" ? operator.zh : operator.en}
                  </option>
                ))}
              </select>
            </label>
            {needsValue ? (
              <ConditionValueInput
                condition={condition}
                control={control}
                locale={locale}
                onChange={(value) => update(index, { value })}
                options={options}
              />
            ) : (
              <div />
            )}
            <label>
              {locale === "zh" ? "执行" : "Action"}
              <select
                onChange={(event) => {
                  const action = event.target.value as FormBranchAction;
                  update(
                    index,
                    action === "go_to_section"
                      ? {
                          action,
                          targetSectionKey: laterSections[0]?.key,
                        }
                      : { action, targetSectionKey: undefined },
                  );
                }}
                value={rule.action}
              >
                <option disabled={!laterSections.length} value="go_to_section">
                  {locale === "zh" ? "跳到后续章节" : "Go to a later section"}
                </option>
                <option value="end_form">
                  {locale === "zh" ? "结束并检查提交" : "End and review"}
                </option>
              </select>
            </label>
            {rule.action === "go_to_section" ? (
              <label>
                {locale === "zh" ? "目标章节" : "Target section"}
                <select
                  onChange={(event) =>
                    update(index, { targetSectionKey: event.target.value })
                  }
                  value={rule.targetSectionKey ?? ""}
                >
                  {laterSections.map((section) => (
                    <option key={section.id} value={section.key}>
                      {locale === "zh" ? section.labelZh : section.labelEn}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div />
            )}
            <div className="field-full">
              <button
                className="button button-danger button-small"
                onClick={() =>
                  onChange(
                    rules.filter((_, currentIndex) => currentIndex !== index),
                  )
                }
                type="button"
              >
                {locale === "zh" ? "移除规则" : "Remove rule"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
