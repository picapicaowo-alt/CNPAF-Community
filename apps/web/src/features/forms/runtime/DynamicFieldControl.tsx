"use client";

import { useEffect, useRef, useState } from "react";
import type {
  FormAnswer,
  FormControlKind,
  RuntimeFormField,
  RuntimeFormOption,
  RuntimeRegistryItem,
} from "@cnpaf/shared";
import { formAnswerTriggersSafetyAlert, formRatingValues } from "@cnpaf/shared";
import { AppIcon } from "@/components/AppIcon";

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
  const [safetyAlertOpen, setSafetyAlertOpen] = useState(false);
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
    if (formAnswerTriggersSafetyAlert(value, field.configuration))
      setSafetyAlertOpen(true);
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
      {safetyAlertOpen ? (
        <SafetyAlertDialog
          locale={locale}
          onAcknowledge={() => setSafetyAlertOpen(false)}
        />
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
                      updateValue(option.key);
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

function SafetyAlertDialog({
  locale,
  onAcknowledge,
}: {
  locale: "zh" | "en";
  onAcknowledge: () => void;
}) {
  const acknowledgeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    acknowledgeRef.current?.focus();
  }, []);
  return (
    <div className="modal-backdrop safety-alert-backdrop" role="presentation">
      <section
        aria-describedby="safety-alert-description"
        aria-labelledby="safety-alert-title"
        aria-modal="true"
        className="modal-card safety-alert-dialog"
        role="alertdialog"
      >
        <div className="safety-alert-icon">
          <AppIcon name="warning" size={28} weight="fill" />
        </div>
        <div className="stack-sm">
          <h2 id="safety-alert-title">
            {locale === "zh" ? "安全提醒" : "Safety Alert"}
          </h2>
          <p id="safety-alert-description">
            {locale === "zh"
              ? "如果你或他人可能正处于危险中，请立即联系身边的工作人员或当地警方/紧急服务。如有紧急危险，请立即拨打 911。请优先确保自己和他人的安全。"
              : "If you or someone else may be in immediate danger, please contact a nearby staff member, local police, or emergency services immediately. If there is an immediate emergency, call 911. Prioritize your own safety and the safety of others."}
          </p>
        </div>
        <button
          className="button button-wide safety-alert-action"
          onClick={onAcknowledge}
          ref={acknowledgeRef}
          type="button"
        >
          {locale === "zh" ? "我知道了" : "I Understand"}
        </button>
      </section>
    </div>
  );
}

function limitsInteger(validation: Record<string, unknown>) {
  return validation.integer === true;
}
