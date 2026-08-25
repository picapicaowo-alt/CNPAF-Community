"use client";

import type {
  FormControlKind,
  FormScalarAnswer,
  FormVisibilityCondition,
  FormVisibilityOperator,
  RuntimeFormField,
  RuntimeFormOption,
} from "@cnpaf/shared";

type Props = {
  availableFields: RuntimeFormField[];
  conditions: FormVisibilityCondition[];
  controls: Map<string, FormControlKind>;
  locale: "zh" | "en";
  onChange: (conditions: FormVisibilityCondition[]) => void;
  options: RuntimeFormOption[];
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

export function VisibilityRulesEditor({
  availableFields,
  conditions,
  controls,
  locale,
  onChange,
  options,
  showIntro = true,
}: Props) {
  function update(index: number, patch: Partial<FormVisibilityCondition>) {
    onChange(
      conditions.map((condition, currentIndex) =>
        currentIndex === index ? { ...condition, ...patch } : condition,
      ),
    );
  }

  function add() {
    const source = availableFields[0];
    if (!source) return;
    onChange([
      ...conditions,
      { fieldKey: source.key, operator: "answered" },
    ]);
  }

  return (
    <div className="stack-sm form-fieldset">
      <div className={`row-between mobile-stack${showIntro ? "" : " builder-rule-actions"}`}>
        {showIntro ? (
          <div>
            <h3>{locale === "zh" ? "显示条件" : "Visibility rules"}</h3>
            <p className="caption">
              {locale === "zh"
                ? "作答前判断：仅当前面题目的答案同时满足全部条件时显示。"
                : "Checked before answering. Every condition based on earlier answers must pass."}
            </p>
          </div>
        ) : <span />}
        <button
          className="button button-secondary button-small"
          disabled={!availableFields.length}
          onClick={add}
          type="button"
        >
          {locale === "zh" ? "添加条件" : "Add condition"}
        </button>
      </div>
      {!availableFields.length ? (
        <p className="muted">
          {locale === "zh"
            ? "前面还没有可作为条件的题目。"
            : "There are no earlier fields available as a condition."}
        </p>
      ) : null}
      {conditions.map((condition, index) => {
        const source =
          availableFields.find((field) => field.key === condition.fieldKey) ??
          availableFields[0];
        const control = controls.get(source?.fieldTypeKey ?? "") ?? "text";
        const sourceOptions = options
          .filter(
            (option) =>
              option.templateFieldId === source?.id &&
              option.status !== "archived",
          )
          .toSorted((left, right) => left.sortOrder - right.sortOrder);
        const needsValue = !["answered", "not_answered"].includes(
          condition.operator,
        );
        return (
          <div className="form-grid" key={`${condition.fieldKey}-${index}`}>
            <label>
              {locale === "zh" ? "条件题目" : "Condition field"}
              <select
                onChange={(event) =>
                  update(index, {
                    fieldKey: event.target.value,
                    value: undefined,
                  })
                }
                value={source?.key ?? ""}
              >
                {availableFields.map((field) => (
                  <option key={field.id} value={field.key}>
                    {locale === "zh" ? field.labelZh : field.labelEn}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {locale === "zh" ? "判断" : "Operator"}
              <select
                onChange={(event) =>
                  update(index, {
                    operator: event.target.value as FormVisibilityOperator,
                    value: undefined,
                  })
                }
                value={condition.operator}
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
                options={sourceOptions}
              />
            ) : null}
            <div className={needsValue ? "" : "field-full"}>
              <button
                className="button button-danger button-small"
                onClick={() =>
                  onChange(
                    conditions.filter(
                      (_, currentIndex) => currentIndex !== index,
                    ),
                  )
                }
                type="button"
              >
                {locale === "zh" ? "移除" : "Remove"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ConditionValueInput({
  condition,
  control,
  locale,
  onChange,
  options,
}: {
  condition: FormVisibilityCondition;
  control: FormControlKind;
  locale: "zh" | "en";
  onChange: (value: FormScalarAnswer | undefined) => void;
  options: RuntimeFormOption[];
}) {
  const label = locale === "zh" ? "比较值" : "Value";
  if (options.length)
    return (
      <label>
        {label}
        <select
          onChange={(event) => onChange(event.target.value)}
          value={typeof condition.value === "string" ? condition.value : ""}
        >
          <option value="">{locale === "zh" ? "选择选项" : "Select option"}</option>
          {options.map((option) => (
            <option key={option.id} value={option.key}>
              {locale === "zh" ? option.labelZh : option.labelEn}
            </option>
          ))}
        </select>
      </label>
    );
  if (control === "boolean")
    return (
      <label>
        {label}
        <select
          onChange={(event) => onChange(event.target.value === "true")}
          value={String(condition.value ?? true)}
        >
          <option value="true">{locale === "zh" ? "是" : "Yes"}</option>
          <option value="false">{locale === "zh" ? "否" : "No"}</option>
        </select>
      </label>
    );
  return (
    <label>
      {label}
      <input
        onChange={(event) =>
          onChange(
            control === "number" || control === "rating"
              ? event.target.value === ""
                ? undefined
                : Number(event.target.value)
              : event.target.value,
          )
        }
        type={control === "number" || control === "rating" ? "number" : control === "date" ? "date" : "text"}
        value={
          typeof condition.value === "string" ||
          typeof condition.value === "number"
            ? condition.value
            : ""
        }
      />
    </label>
  );
}
