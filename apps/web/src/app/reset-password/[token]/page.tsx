"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { useI18n } from "@/components/LocaleProvider";
import { PasswordField } from "@/components/PasswordField";
import { apiFetch, errorMessage } from "@/lib/api-client";

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>();
  const { locale } = useI18n();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError(locale === "zh" ? "两次输入的密码不一致。" : "The passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/api/v1/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: params.token, newPassword: password }),
      });
      setCompleted(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-brand-panel">
        <div className="auth-story">
          <BrandLogo className="auth-brand-logo" label="Chinese Psychological Assistance Foundation" priority />
          <h1>{locale === "zh" ? "设置你的安全密码。" : "Set your secure password."}</h1>
          <p>{locale === "zh" ? "链接只能使用一次，并会在 24 小时后过期。" : "This link can be used once and expires after 24 hours."}</p>
        </div>
        <span className="auth-footnote">CNPAF Community</span>
      </section>
      <section className="auth-form-panel">
        <div className="auth-product-name">CNPAF Community</div>
        <form className="card auth-card stack" onSubmit={submit}>
          <div>
            <h1>{locale === "zh" ? "设置新密码" : "Set a new password"}</h1>
          </div>
          {completed ? (
            <>
              <div className="feedback feedback-success" role="status">
                {locale === "zh" ? "密码已更新，现在可以登录。" : "Your password is updated. You can now sign in."}
              </div>
              <Link className="button button-wide" href="/login">
                {locale === "zh" ? "前往登录" : "Continue to sign in"}
              </Link>
            </>
          ) : (
            <>
              <PasswordField
                autoComplete="new-password"
                hint={locale === "zh" ? "至少 12 个字符" : "At least 12 characters"}
                label={locale === "zh" ? "新密码" : "New password"}
                minLength={12}
                onChange={(event) => setPassword(event.target.value)}
                required
                value={password}
              />
              <PasswordField
                autoComplete="new-password"
                label={locale === "zh" ? "确认新密码" : "Confirm new password"}
                minLength={12}
                onChange={(event) => setConfirmation(event.target.value)}
                required
                value={confirmation}
              />
              {error ? <div className="feedback feedback-error" role="alert">{error}</div> : null}
              <button className="button button-wide" disabled={submitting} type="submit">
                {submitting
                  ? locale === "zh" ? "正在保存…" : "Saving…"
                  : locale === "zh" ? "保存新密码" : "Save new password"}
              </button>
            </>
          )}
        </form>
      </section>
    </div>
  );
}
