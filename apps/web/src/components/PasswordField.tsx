"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { AppIcon } from "./AppIcon";
import { useI18n } from "./LocaleProvider";

type PasswordFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  label: ReactNode;
  hint?: ReactNode;
};

export function PasswordField({
  label,
  hint,
  id: providedId,
  "aria-describedby": describedBy,
  ...inputProps
}: PasswordFieldProps) {
  const { locale } = useI18n();
  const generatedId = useId();
  const inputId = providedId ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const [isVisible, setIsVisible] = useState(false);
  const toggleLabel = isVisible
    ? locale === "zh"
      ? "隐藏密码"
      : "Hide password"
    : locale === "zh"
      ? "显示密码"
      : "Show password";

  return (
    <div className="field password-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="password-input-shell">
        <input
          {...inputProps}
          aria-describedby={
            [describedBy, hintId].filter(Boolean).join(" ") || undefined
          }
          id={inputId}
          type={isVisible ? "text" : "password"}
        />
        <button
          aria-controls={inputId}
          aria-label={toggleLabel}
          aria-pressed={isVisible}
          className="password-visibility-toggle"
          onClick={() => setIsVisible((current) => !current)}
          title={toggleLabel}
          type="button"
        >
          <AppIcon name={isVisible ? "eye-off" : "eye"} />
        </button>
      </div>
      {hint ? (
        <span className="caption" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
