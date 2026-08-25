"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { useI18n } from "@/components/LocaleProvider";
import { apiFetch, errorMessage } from "@/lib/api-client";

export default function InvitePage() {
  const { t, locale } = useI18n();
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiFetch("/api/v1/invites", {
        method: "PUT",
        body: JSON.stringify({ token: params.token, name, password }),
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
        <div className="auth-story">
          <BrandLogo
            className="auth-brand-logo"
            label="Chinese Psychological Assistance Foundation"
            priority
          />
          <h1>
            {locale === "zh"
              ? "欢迎加入社区证据协作。"
              : "Welcome to community evidence work."}
          </h1>
          <p>
            {locale === "zh"
              ? "完成账号设置后，你将看到与角色和项目范围匹配的工作区。"
              : "After setup, your workspace will match your role and program scope."}
          </p>
        </div>
        <span className="auth-footnote">Secure · Scoped · Auditable</span>
      </section>
      <section className="auth-form-panel">
        <div className="auth-product-name">CNPAF Community</div>
        <form className="card auth-card stack" onSubmit={onSubmit}>
          <div>
            <h1>{t.invite}</h1>
          </div>
          <label>
            {locale === "zh" ? "姓名" : "Name"}
            <input
              autoComplete="name"
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </label>
          <label>
            {t.password}
            <input
              autoComplete="new-password"
              minLength={12}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            <span className="caption">
              {locale === "zh" ? "至少 12 个字符" : "At least 12 characters"}
            </span>
          </label>
          {error ? (
            <div className="feedback feedback-error" role="alert">
              {error}
            </div>
          ) : null}
          <button
            className="button button-wide"
            disabled={submitting}
            type="submit"
          >
            {submitting
              ? locale === "zh"
                ? "正在设置…"
                : "Setting up…"
              : locale === "zh"
                ? "完成设置"
                : "Complete setup"}
          </button>
        </form>
      </section>
    </div>
  );
}
