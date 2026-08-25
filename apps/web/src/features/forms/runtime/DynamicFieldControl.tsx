"use client";

import type {
  FormAnswer,
  FormControlKind,
  RuntimeFormField,
  RuntimeFormOption,
  RuntimeRegistryItem,
} from "@cnpaf/shared";
import { formRatingValues } from "@cnpaf/shared";

type Props = {
  answer?: FormAnswer;
  control: FormControlKind;
  disabled?: boolean;
  field: RuntimeFormField;
  locale: "zh" | "en";
  missingReasons?: RuntimeRegistryItem[];
  onChange: (fieldId: string, answer: FormAnswer) => void;
  options: RuntimeFormOption[];
};

export function DynamicFieldControl({
  answer = {},
  control,
  disabled = false,
  field,
  locale,
  missingReasons = [],
  onChange,
  options,
}: Props) {
  const label = locale === "zh" ? field.labelZh : field.labelEn;
  const help = locale === "zh" ? field.helpTextZh : field.helpTextEn;
  const placeholder =
    locale === "zh" ? field.placeholderZh : field.placeholderEn;
  const limits = field.validation ?? {};
  const min = typeof limits.min === "number" ? limits.min : undefined;
  const max = typeof limits.max === "number" ? limits.max : undefined;
  const minLength =
    typeof limits.minLength === "number" ? limits.minLength : undefined;
  const maxLength =
    typeof limits.maxLength === "number" ? limits.maxLength : undefined;
  const missing = Boolean(answer.missingReasonKey);

  if (control === "display") {
    return (
      <div className="feedback feedback-info">
        <div>
          <strong>{label}</strong>
          {help ? <p>{help}</p> : null}
        </div>
      </div>
    );
  }

  function updateValue(value: FormAnswer["value"]) {
    onChange(field.id, {
      ...answer,
      value,
      missingReasonKey: undefined,
    });
  }

  const controlElement = renderControl({
    answer,
    control,
    disabled: disabled || missing,
    field,
    locale,
    max,
    maxLength,
    min,
    minLength,
    onChange,
    options,
    placeholder,
    updateValue,
  });

  return (
    <div className="stack-sm">
      {controlElement}
      {field.allowCustomEntry && (control === "single" || control === "multi" || control === "dropdown") && !missing ? (
        <label>
          {locale === "zh" ? "其他（请说明）" : "Other (please specify)"}
          <input
            disabled={disabled}
            onChange={(event) =>
              onChange(field.id, {
                ...answer,
                customText: event.target.value,
                missingReasonKey: undefined,
              })
            }
            placeholder={locale === "zh" ? "输入自定义答案" : "Enter another answer"}
            value={answer.customText ?? ""}
          />
        </label>
      ) : null}
      {field.allowMissingReason && missingReasons.length ? (
        <label>
          {locale === "zh" ? "未记录原因" : "Missing reason"}
          <select
            disabled={disabled}
            onChange={(event) =>
              onChange(
                field.id,
                event.target.value
                  ? {
                      missingReasonKey: event.target.value,
                      customText: answer.customText,
                    }
                  : { ...answer, missingReasonKey: undefined },
              )
            }
            value={answer.missingReasonKey ?? ""}
          >
            <option value="">
              {locale === "zh" ? "已记录答案" : "Answer recorded"}
            </option>
            {missingReasons.map((reason) => (
              <option key={reason.key} value={reason.key}>
                {locale === "zh" ? reason.labelZh : reason.labelEn}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}

function renderControl({
  answer,
  control,
  disabled,
  field,
  locale,
  max,
  maxLength,
  min,
  minLength,
  onChange,
  options,
  placeholder,
  updateValue,
}: {
  answer: FormAnswer;
  control: FormControlKind;
  disabled: boolean;
  field: RuntimeFormField;
  locale: "zh" | "en";
  max?: number;
  maxLength?: number;
  min?: number;
  minLength?: number;
  onChange: Props["onChange"];
  options: RuntimeFormOption[];
  placeholder?: string | null;
  updateValue: (value: FormAnswer["value"]) => void;
}) {
  const label = locale === "zh" ? field.labelZh : field.labelEn;
  const help = locale === "zh" ? field.helpTextZh : field.helpTextEn;
  const value = answer.value;

  if (control === "dropdown") {
    return (
      <label>
        {label}
        {field.required ? " *" : ""}
        {help ? <span className="caption">{help}</span> : null}
        <select
          disabled={disabled}
          onChange={(event) => updateValue(event.target.value)}
          value={typeof value === "string" ? value : ""}
        >
          <option value="">
            {locale === "zh" ? "请选择" : "Select an option"}
          </option>
          {options.map((option) => (
            <option key={option.id} value={option.key}>
              {locale === "zh" ? option.labelZh : option.labelEn}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (control === "single" || control === "multi") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset className="form-fieldset">
        <legend>
          {label}
          {field.required ? " *" : ""}
        </legend>
        {help ? <p className="muted">{help}</p> : null}
        <div className="choice-list">
          {options.map((option) => {
            const checked =
              control === "multi"
                ? selected.includes(option.key)
                : value === option.key;
            return (
              <label className="choice" key={option.id}>
                <input
                  checked={checked}
                  disabled={disabled}
                  name={field.id}
                  onChange={(event) => {
                    if (control === "single") {
                      onChange(field.id, { value: option.key });
                      return;
                    }
                    updateValue(
                      event.target.checked
                        ? [...selected, option.key]
                        : selected.filter((key) => key !== option.key),
                    );
                  }}
                  type={control === "single" ? "radio" : "checkbox"}
                />
                <span>{locale === "zh" ? option.labelZh : option.labelEn}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (control === "boolean") {
    return (
      <fieldset className="form-fieldset">
        <legend>
          {label}
          {field.required ? " *" : ""}
        </legend>
        {help ? <p className="muted">{help}</p> : null}
        <div className="grid-2">
          {[true, false].map((choice) => (
            <label className="choice" key={String(choice)}>
              <input
                checked={value === choice}
                disabled={disabled}
                name={field.id}
                onChange={() => updateValue(choice)}
                type="radio"
              />
              <span>
                {choice
                  ? locale === "zh"
                    ? "是"
                    : "Yes"
                  : locale === "zh"
                    ? "否"
                    : "No"}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (control === "rating") {
    const ratings = formRatingValues(field.validation);
    return (
      <fieldset className="form-fieldset">
        <legend>
          {label}
          {field.required ? " *" : ""}
        </legend>
        {help ? <p className="muted">{help}</p> : null}
        <div className="choice-list">
          {ratings.map((rating) => (
            <label className="choice" key={rating}>
              <input
                checked={value === rating}
                disabled={disabled}
                name={field.id}
                onChange={() => updateValue(rating)}
                type="radio"
              />
              <span>{rating}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (control === "textarea") {
    return (
      <label>
        {label}
        {field.required ? " *" : ""}
        {help ? <span className="caption">{help}</span> : null}
        <textarea
          disabled={disabled}
          maxLength={maxLength}
          minLength={minLength}
          onChange={(event) => updateValue(event.target.value)}
          placeholder={placeholder ?? ""}
          value={typeof value === "string" ? value : ""}
        />
      </label>
    );
  }

  return (
    <label>
      {label}
      {field.required ? " *" : ""}
      {help ? <span className="caption">{help}</span> : null}
      <input
        disabled={disabled}
        max={max}
        maxLength={maxLength}
        min={min}
        minLength={minLength}
        onChange={(event) =>
          updateValue(
            control === "number"
              ? event.target.value === ""
                ? ""
                : Number(event.target.value)
              : event.target.value,
          )
        }
        placeholder={placeholder ?? ""}
        step={limitsInteger(field.validation) ? 1 : undefined}
        type={
          control === "number"
            ? "number"
            : control === "date"
              ? "datetime-local"
              : "text"
        }
        value={
          typeof value === "string" || typeof value === "number" ? value : ""
        }
      />
    </label>
  );
}

function limitsInteger(validation: Record<string, unknown>) {
  return validation.integer === true;
}
