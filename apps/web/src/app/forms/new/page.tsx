"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FORM_PRESETS, getFormPreset } from "@cnpaf/shared";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import { ErrorState, PageHeader, StatusPill } from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";

type RegistryItem = { key: string; labelEn: string; labelZh: string };
type LibraryTemplate = {
  templateId: string;
  versionId: string;
  nameEn: string;
  nameZh: string;
  descriptionEn?: string | null;
  descriptionZh?: string | null;
  fieldCount?: number;
  sectionCount?: number;
};

function keyFrom(value: string) {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140);
}

export default function NewFormPage() {
  const { locale } = useI18n();
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [types, setTypes] = useState<RegistryItem[]>([]);
  const [libraryTemplates, setLibraryTemplates] = useState<LibraryTemplate[]>([]);
  const [step, setStep] = useState<"choose" | "name">("choose");
  const [presetKey, setPresetKey] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [type, setType] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [nameZh, setNameZh] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [descriptionZh, setDescriptionZh] = useState("");
  const [allowQuickCapture, setAllowQuickCapture] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      apiFetch<{ user: { organizationId?: string | null } }>("/api/v1/auth/me"),
      apiFetch<{ items: RegistryItem[] }>(
        "/api/v1/config/registries/template_type?status=active",
      ),
      apiFetch<{ templates: { id: string }[] }>("/api/v1/templates"),
    ])
      .then(async ([me, result, templateResult]) => {
        setOrganizationId(me.user.organizationId ?? null);
        setTypes(result.items ?? []);
        setType(result.items?.[0]?.key ?? "");
        const bundles = await Promise.all(
          (templateResult.templates ?? []).map((template) =>
            apiFetch<{
              versions: Array<{
                id: string;
                nameEn: string;
                nameZh: string;
                descriptionEn?: string | null;
                descriptionZh?: string | null;
                configuration?: Record<string, unknown>;
                fieldCount?: number;
                sectionCount?: number;
              }>;
            }>(`/api/v1/templates/${template.id}`)
              .then((bundle) => ({ templateId: template.id, ...bundle }))
              .catch(() => ({ templateId: template.id, versions: [] })),
          ),
        );
        setLibraryTemplates(
          bundles.flatMap(({ templateId, versions }) =>
            versions
              .filter(
                (version) =>
                  version.configuration?.savedAsReusableTemplate === true,
              )
              .slice(0, 1)
              .map((version) => ({
                templateId,
                versionId: version.id,
                nameEn: version.nameEn,
                nameZh: version.nameZh,
                descriptionEn: version.descriptionEn,
                descriptionZh: version.descriptionZh,
                fieldCount: version.fieldCount,
                sectionCount: version.sectionCount,
              })),
          ),
        );
        const search = new URLSearchParams(window.location.search);
        const initialPreset = getFormPreset(search.get("preset"));
        if (initialPreset) {
          setPresetKey(initialPreset.key);
          setNameEn(initialPreset.nameEn);
          setNameZh(initialPreset.nameZh);
          setDescriptionEn(initialPreset.descriptionEn);
          setDescriptionZh(initialPreset.descriptionZh);
          setType(initialPreset.templateTypeKey);
          setKey(`${initialPreset.key}-${Date.now().toString(36)}`);
          setStep("name");
        } else if (search.get("blank") === "1") {
          setStep("name");
        }
      })
      .catch((caught) => setError(errorMessage(caught)));
  }, []);

  const selectedPreset = useMemo(() => getFormPreset(presetKey), [presetKey]);

  function choosePreset(nextPresetKey: string | null) {
    const preset = getFormPreset(nextPresetKey);
    setPresetKey(nextPresetKey);
    if (preset) {
      setNameEn(preset.nameEn);
      setNameZh(preset.nameZh);
      setDescriptionEn(preset.descriptionEn);
      setDescriptionZh(preset.descriptionZh);
      setType(preset.templateTypeKey);
      setKey(`${preset.key}-${Date.now().toString(36)}`);
    } else {
      setNameEn("");
      setNameZh("");
      setDescriptionEn("");
      setDescriptionZh("");
      setKey("");
      setType(types[0]?.key ?? "");
    }
    setStep("name");
  }

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
            presetKey,
            configuration: { allowQuickCapture },
          }),
        },
      );
      router.replace(`/forms/${result.template.id}`);
    } catch (caught) {
      setError(errorMessage(caught));
      setSaving(false);
    }
  }

  async function useLibraryTemplate(templateId: string) {
    setSaving(true);
    setError("");
    try {
      const result = await apiFetch<{ template: { id: string } }>(
        `/api/v1/templates/${templateId}/duplicate`,
        {
          method: "POST",
          body: JSON.stringify({ purpose: "form" }),
        },
      );
      router.replace(`/forms/${result.template.id}`);
    } catch (caught) {
      setError(errorMessage(caught));
      setSaving(false);
    }
  }

  return (
    <div className="stack form-create-page">
      <PageHeader
        eyebrow={locale === "zh" ? "表单" : "Forms"}
        title={locale === "zh" ? "新建表单" : "New form"}
        description={
          locale === "zh"
            ? "先选一个贴近业务的起点，几分钟内即可得到可编辑草稿。"
            : "Start from a common workflow and get an editable draft in minutes."
        }
      />
      {error ? <ErrorState message={error} /> : null}

      <div className="form-create-steps" aria-label="Progress">
        <span className={step === "choose" ? "active" : "complete"}>
          <b>1</b> {locale === "zh" ? "选择起点" : "Choose a starting point"}
        </span>
        <span className={step === "name" ? "active" : ""}>
          <b>2</b> {locale === "zh" ? "确认并创建" : "Review and create"}
        </span>
      </div>

      {step === "choose" ? (
        <section className="stack">
          {libraryTemplates.length ? (
            <div className="stack-sm form-library-section">
              <div className="section-title">
                <div>
                  <h2>{locale === "zh" ? "我的模板" : "My templates"}</h2>
                  <p className="muted">
                    {locale === "zh"
                      ? "从团队保存的表单结构创建独立草稿。"
                      : "Create an independent draft from a form your team saved."}
                  </p>
                </div>
              </div>
              <div className="preset-grid preset-grid-library">
                {libraryTemplates.map((template) => (
                  <button
                    className="preset-card preset-card-library"
                    disabled={saving}
                    key={template.versionId}
                    onClick={() => void useLibraryTemplate(template.templateId)}
                    type="button"
                  >
                    <div className="row-between">
                      <span className="empty-icon"><AppIcon name="template" /></span>
                      <StatusPill tone="violet">
                        {locale === "zh" ? "团队模板" : "Team template"}
                      </StatusPill>
                    </div>
                    <span className="preset-card-title">
                      {locale === "zh" ? template.nameZh : template.nameEn}
                    </span>
                    <span className="muted">
                      {(locale === "zh"
                        ? template.descriptionZh
                        : template.descriptionEn) ||
                        (locale === "zh" ? "无模板说明" : "No template description")}
                    </span>
                    <span className="caption">
                      {template.sectionCount ?? 0} {locale === "zh" ? "个章节" : "sections"} · {template.fieldCount ?? 0}{" "}
                      {locale === "zh" ? "个问题" : "questions"}
                    </span>
                    <span className="inline-link">
                      {locale === "zh" ? "使用这个模板" : "Use this template"}
                      <AppIcon name="arrow" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="section-title">
            <div>
              <h2>{locale === "zh" ? "常用业务模板" : "Common workflows"}</h2>
              <p className="muted">
                {locale === "zh"
                  ? "题目和选项已预设，创建后仍可全部修改。"
                  : "Questions and options are prefilled and remain fully editable."}
              </p>
            </div>
          </div>
          <div className="preset-grid">
            {FORM_PRESETS.map((preset) => {
              const fieldCount = preset.sections.reduce(
                (total, section) => total + section.fields.length,
                0,
              );
              return (
                <button
                  className="preset-card"
                  key={preset.key}
                  onClick={() => choosePreset(preset.key)}
                  type="button"
                >
                  <div className="row-between">
                    <span className="empty-icon"><AppIcon name="forms" /></span>
                    {preset.recommended ? (
                      <StatusPill tone="green">
                        {locale === "zh" ? "推荐" : "Recommended"}
                      </StatusPill>
                    ) : null}
                  </div>
                  <span className="preset-card-title">
                    {locale === "zh" ? preset.nameZh : preset.nameEn}
                  </span>
                  <span className="muted">
                    {locale === "zh" ? preset.useCaseZh : preset.useCaseEn}
                  </span>
                  <span className="caption">
                    {locale === "zh"
                      ? `约 ${preset.estimatedMinutes} 分钟 · ${fieldCount} 个问题`
                      : `About ${preset.estimatedMinutes} min · ${fieldCount} questions`}
                  </span>
                  <span className="inline-link">
                    {locale === "zh" ? "使用这个模板" : "Use this workflow"}
                    <AppIcon name="arrow" />
                  </span>
                </button>
              );
            })}
            <button
              className="preset-card preset-card-blank"
              onClick={() => choosePreset(null)}
              type="button"
            >
              <span className="empty-icon"><AppIcon name="plus" /></span>
              <span className="preset-card-title">
                {locale === "zh" ? "从空白开始" : "Start from blank"}
              </span>
              <span className="muted">
                {locale === "zh"
                  ? "适合没有匹配模板的特殊流程。"
                  : "For a workflow that does not match a preset."}
              </span>
            </button>
          </div>
        </section>
      ) : (
        <section className="card form-create-review stack">
          <div className="row-between mobile-stack">
            <div>
              <div className="eyebrow">
                {selectedPreset
                  ? locale === "zh"
                    ? "已选择业务模板"
                    : "Selected workflow"
                  : locale === "zh"
                    ? "空白表单"
                    : "Blank form"}
              </div>
              <h2>
                {selectedPreset
                  ? locale === "zh"
                    ? selectedPreset.nameZh
                    : selectedPreset.nameEn
                  : locale === "zh"
                    ? "设置基本信息"
                    : "Set the basics"}
              </h2>
              <p className="muted">
                {locale === "zh"
                  ? "先确认名称即可创建，其他内容可稍后在编辑器中调整。"
                  : "Confirm the names now; everything else can be changed in the editor."}
              </p>
            </div>
            <button
              className="button button-secondary button-small"
              onClick={() => setStep("choose")}
              type="button"
            >
              {locale === "zh" ? "更换模板" : "Change workflow"}
            </button>
          </div>
          <div className="form-grid">
            <label>
              {locale === "zh" ? "中文名称" : "Chinese name"}
              <input
                autoFocus
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
          </div>
          <details className="advanced-panel">
            <summary>
              {locale === "zh" ? "更多设置（可选）" : "More settings (optional)"}
            </summary>
            <div className="form-grid">
              <label>
                {locale === "zh" ? "表单类型" : "Form type"}
                <select
                  disabled={Boolean(selectedPreset)}
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
                {locale === "zh" ? "系统标识" : "System key"}
                <input
                  onChange={(event) => setKey(keyFrom(event.target.value))}
                  value={key}
                />
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
              <label className="choice field-full">
                <input
                  checked={allowQuickCapture}
                  onChange={(event) => setAllowQuickCapture(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  {locale === "zh"
                    ? "允许不经过任务直接快速采集"
                    : "Allow quick capture without an assigned task"}
                </span>
              </label>
            </div>
          </details>
          <div className="form-create-submit">
            <p className="caption">
              {locale === "zh"
                ? "创建后会进入草稿编辑器；发布前不会影响采集员。"
                : "This opens a draft editor and will not affect collectors until published."}
            </p>
            <button
              className="button"
              disabled={saving || !key || !type || !nameEn.trim() || !nameZh.trim()}
              onClick={() => void create()}
              type="button"
            >
              {saving
                ? locale === "zh"
                  ? "正在创建…"
                  : "Creating…"
                : locale === "zh"
                  ? "创建草稿并继续"
                  : "Create draft and continue"}
              {!saving ? <AppIcon name="arrow" /> : null}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
