"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import { ErrorState, PageHeader } from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";

export default function AccountPage() {
  const { locale } = useI18n();
  const [exported, setExported] = useState("");
  const [me, setMe] = useState<{
    user: { name: string; email: string; locale: string };
    roles: Array<{ nameEn: string; nameZh: string }>;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch<typeof me>("/api/v1/auth/me")
      .then(setMe)
      .catch((caught) => setError(errorMessage(caught)));
  }, []);
  async function exp() {
    try {
      setExported(JSON.stringify(await apiFetch("/api/v1/account"), null, 2));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }
  async function del() {
    if (
      !confirm(
        locale === "zh"
          ? "确定删除此账号？此操作无法撤销。"
          : "Delete this account? This cannot be undone.",
      )
    )
      return;
    await apiFetch("/api/v1/account", { method: "DELETE" });
    window.location.href = "/login";
  }
  return (
    <div className="stack">
      <PageHeader
        title={locale === "zh" ? "账号" : "Account"}
        description={
          locale === "zh"
            ? "管理个人资料、隐私和数据副本。"
            : "Manage your profile, privacy, and personal data copy."
        }
      />
      {error ? <ErrorState message={error} /> : null}
      <div className="detail-grid">
        <section className="card">
          <h2>{locale === "zh" ? "个人资料" : "Profile"}</h2>
          <dl className="definition-list">
            <div className="definition-row">
              <dt>{locale === "zh" ? "姓名" : "Name"}</dt>
              <dd>{me?.user.name ?? "—"}</dd>
            </div>
            <div className="definition-row">
              <dt>{locale === "zh" ? "邮箱" : "Email"}</dt>
              <dd>{me?.user.email ?? "—"}</dd>
            </div>
            <div className="definition-row">
              <dt>{locale === "zh" ? "角色" : "Role"}</dt>
              <dd>
                {me?.roles
                  .map((role) => (locale === "zh" ? role.nameZh : role.nameEn))
                  .join(", ") || "—"}
              </dd>
            </div>
          </dl>
        </section>
        <aside className="stack-sm">
          <Link
            className="card card-compact card-interactive row-between"
            href="/privacy"
          >
            <span>
              <strong>{locale === "zh" ? "隐私政策" : "Privacy policy"}</strong>
              <span className="caption" style={{ display: "block" }}>
                {locale === "zh" ? "了解数据处理方式" : "How data is handled"}
              </span>
            </span>
            <AppIcon name="arrow" style={{ width: 18 }} />
          </Link>
          <button
            className="button button-secondary button-wide"
            onClick={exp}
            type="button"
          >
            <AppIcon name="download" />
            {locale === "zh" ? "导出我的数据" : "Export my data"}
          </button>
          <button
            className="button button-danger button-wide"
            onClick={del}
            type="button"
          >
            {locale === "zh" ? "删除账号" : "Delete account"}
          </button>
        </aside>
      </div>
      {exported ? (
        <section className="card stack-sm">
          <div className="row-between">
            <h2>{locale === "zh" ? "数据副本" : "Data copy"}</h2>
            <button
              className="button button-ghost button-small"
              onClick={() => setExported("")}
              type="button"
            >
              {locale === "zh" ? "关闭" : "Close"}
            </button>
          </div>
          <pre className="code-preview">{exported}</pre>
        </section>
      ) : null}
    </div>
  );
}
