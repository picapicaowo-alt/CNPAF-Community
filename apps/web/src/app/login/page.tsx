"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";
import { apiFetch, errorMessage } from "@/lib/api-client";

export default function LoginPage() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await apiFetch("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.push("/dashboard");
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-brand-panel">
        <div className="auth-brand-lockup">
          <span className="brand-mark">C</span>CNPAF Collect
        </div>
        <div>
          <h1>
            {locale === "zh"
              ? "让每一份社区声音都有清晰去向。"
              : "Give every community voice a clear path forward."}
          </h1>
          <p>
            {locale === "zh"
              ? "安全采集、协作审核，并把已批准的证据转化为可信洞察。"
              : "Collect safely, review together, and turn approved evidence into trusted insight."}
          </p>
        </div>
        <span className="auth-footnote">
          Community Needs & Programs Assessment Framework
        </span>
      </section>
      <section className="auth-form-panel">
        <form className="card auth-card stack" onSubmit={onSubmit}>
          <div className="row-between">
            <div>
              <div className="eyebrow">CNPAF</div>
              <h1>{t.login}</h1>
            </div>
            <button
              className="button button-ghost button-small"
              onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
              type="button"
            >
              {locale === "zh" ? "EN" : "中文"}
            </button>
          </div>
          <label>
            {t.email}
            <input
              autoComplete="username"
              inputMode="email"
              onChange={(e) => setEmail(e.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            {t.password}
            <input
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error ? (
            <div className="feedback feedback-error" role="alert">
              <span>{error}</span>
            </div>
          ) : null}
          <button
            className="button button-wide"
            disabled={submitting}
            type="submit"
          >
            {submitting
              ? locale === "zh"
                ? "正在登录…"
                : "Signing in…"
              : t.signIn}
          </button>
          <p className="caption" style={{ textAlign: "center", margin: 0 }}>
            {locale === "zh"
              ? "仅限已授权的 CNPAF 成员"
              : "For authorized CNPAF members only"}
          </p>
        </form>
      </section>
    </div>
  );
}
