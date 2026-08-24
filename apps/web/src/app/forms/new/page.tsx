"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import { ErrorState, PageHeader } from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";

type RegistryItem = { key: string; labelEn: string; labelZh: string };
function keyFrom(value: string) {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 150);
}

export default function NewFormPage() {
  const { locale } = useI18n();
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [types, setTypes] = useState<RegistryItem[]>([]);
  const [key, setKey] = useState("");
  const [type, setType] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [nameZh, setNameZh] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [descriptionZh, setDescriptionZh] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      apiFetch<{ user: { organizationId?: string | null } }>("/api/v1/auth/me"),
      apiFetch<{ items: RegistryItem[] }>(
        "/api/v1/config/registries/template_type?status=active",
      ),
    ])
      .then(([me, result]) => {
        setOrganizationId(me.user.organizationId ?? null);
        setTypes(result.items ?? []);
        setType(result.items?.[0]?.key ?? "");
      })
      .catch((caught) => setError(errorMessage(caught)));
  }, []);
  async function create() {
    if (!key || !type || !nameEn.trim() || !nameZh.trim()) return;
    setSaving(true);
    setError("");
    try {
      const result = await apiFetch<{ template: { id: string } }>(
        "/api/v1/templates",
        {
          method: "POST",
          body: JSON.stringify({
            key,
            templateTypeKey: type,
            organizationId,
            nameEn: nameEn.trim(),
            nameZh: nameZh.trim(),
            descriptionEn: descriptionEn.trim() || null,
            descriptionZh: descriptionZh.trim() || null,
            configuration: {},
          }),
        },
      );
      router.replace(`/forms/${result.template.id}`);
    } catch (caught) {
      setError(errorMessage(caught));
      setSaving(false);
    }
  }
  return (
    <div className="stack">
      <PageHeader
        eyebrow={locale === "zh" ? "表单" : "Forms"}
        title={locale === "zh" ? "新建表单" : "New form"}
        description={
          locale === "zh"
            ? "表单结构会按版本保存；已发布版本不可直接修改。"
            : "Form structure is versioned; published versions cannot be edited in place."
        }
        actions={
          <Link className="button button-secondary" href="/forms">
            <AppIcon name="back" />
            {locale === "zh" ? "返回" : "Back"}
          </Link>
        }
      />
      {error ? <ErrorState message={error} /> : null}
      <div className="content-aside">
        <section className="card stack">
          <h2>{locale === "zh" ? "表单信息" : "Form information"}</h2>
          <div className="form-grid">
            <label>
              {locale === "zh" ? "中文名称" : "Chinese name"}
              <input
                onChange={(event) => {
                  setNameZh(event.target.value);
                  if (!key) setKey(keyFrom(event.target.value));
                }}
                value={nameZh}
              />
            </label>
            <label>
              {locale === "zh" ? "英文名称" : "English name"}
              <input
                onChange={(event) => {
                  setNameEn(event.target.value);
                  if (!key) setKey(keyFrom(event.target.value));
                }}
                value={nameEn}
              />
            </label>
            <label>
              {locale === "zh" ? "稳定标识" : "Stable key"}
              <input
                onChange={(event) => setKey(keyFrom(event.target.value))}
                placeholder="community-interview"
                value={key}
              />
            </label>
            <label>
              {locale === "zh" ? "表单类型" : "Form type"}
              <select
                onChange={(event) => setType(event.target.value)}
                value={type}
              >
                {types.map((item) => (
                  <option key={item.key} value={item.key}>
                    {locale === "zh" ? item.labelZh : item.labelEn}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {locale === "zh" ? "中文说明" : "Chinese description"}
              <textarea
                onChange={(event) => setDescriptionZh(event.target.value)}
                value={descriptionZh}
              />
            </label>
            <label>
              {locale === "zh" ? "英文说明" : "English description"}
              <textarea
                onChange={(event) => setDescriptionEn(event.target.value)}
                value={descriptionEn}
              />
            </label>
          </div>
          <button
            className="button"
            disabled={
              saving || !key || !type || !nameEn.trim() || !nameZh.trim()
            }
            onClick={create}
            type="button"
          >
            {saving
              ? locale === "zh"
                ? "正在创建…"
                : "Creating…"
              : locale === "zh"
                ? "创建并编辑"
                : "Create and edit"}
          </button>
        </section>
        <aside className="card stack-sm">
          <h2>{locale === "zh" ? "版本规则" : "Version rules"}</h2>
          <p className="muted">
            {locale === "zh"
              ? "发布前可添加章节、字段和选项。发布后若需调整，请复制为新草稿版本，避免正在进行的任务发生结构漂移。"
              : "Add sections, fields, and options before publishing. For later changes, clone a new draft so active tasks never drift in structure."}
          </p>
        </aside>
      </div>
    </div>
  );
}
