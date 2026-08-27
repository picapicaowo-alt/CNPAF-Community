"use client";

import Link from "next/link";
import { useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { useI18n } from "@/components/LocaleProvider";
import { apiFetch, errorMessage } from "@/lib/api-client";

export default function ForgotPasswordPage() {
  const { locale } = useI18n();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await apiFetch("/api/v1/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSubmitted(true);
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
          <h1>{locale === "zh" ? "安全恢复你的账号。" : "Recover your account securely."}</h1>
          <p>{locale === "zh" ? "我们只会向账号已登记的邮箱发送一次性链接。" : "We only send a one-time link to the email registered on the account."}</p>
        </div>
        <span className="auth-footnote">CNPAF Community</span>
      </section>
      <section className="auth-form-panel">
        <div className="auth-product-name">CNPAF Community</div>
        <form className="card auth-card stack" onSubmit={submit}>
          <div>
            <h1>{locale === "zh" ? "忘记密码" : "Forgot password"}</h1>
            <p className="muted">
              {locale === "zh" ? "输入你的 CNPAF 邮箱，我们会发送重置链接。" : "Enter your CNPAF email and we’ll send a reset link."}
            </p>
          </div>
          {submitted ? (
            <div className="feedback feedback-success" role="status">
              {locale === "zh"
                ? "如果该邮箱对应一个有效账号，重置邮件会很快送达。"
                : "If that email matches an active account, a reset message will arrive shortly."}
            </div>
          ) : (
            <>
              <label>
                {locale === "zh" ? "邮箱" : "Email"}
                <input autoComplete="email" inputMode="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
              </label>
              {error ? <div className="feedback feedback-error" role="alert">{error}</div> : null}
              <button className="button button-wide" disabled={submitting} type="submit">
                {submitting
                  ? locale === "zh" ? "正在发送…" : "Sending…"
                  : locale === "zh" ? "发送重置链接" : "Send reset link"}
              </button>
            </>
          )}
          <Link className="inline-link" href="/login" style={{ textAlign: "center" }}>
            {locale === "zh" ? "返回登录" : "Back to sign in"}
          </Link>
        </form>
      </section>
    </div>
  );
}
