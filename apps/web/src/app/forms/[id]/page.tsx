"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  StatusPill,
} from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";

type Template = {
  id: string;
  key: string;
  templateTypeKey: string;
  currentPublishedVersionId?: string | null;
};
type Version = {
  id: string;
  version: number;
  nameEn: string;
  nameZh: string;
  descriptionEn?: string | null;
  descriptionZh?: string | null;
  status: string;
};
type Section = {
  id: string;
  key: string;
  labelEn: string;
  labelZh: string;
  helpTextEn?: string | null;
  helpTextZh?: string | null;
  sortOrder: number;
};
type Field = {
  id: string;
  templateSectionId: string;
  key: string;
  fieldTypeKey: string;
  labelEn: string;
  labelZh: string;
  helpTextEn?: string | null;
  helpTextZh?: string | null;
  required: boolean;
  allowMissingReason: boolean;
  allowCustomEntry: boolean;
  sortOrder: number;
};
type Option = {
  id: string;
  templateFieldId: string;
  key: string;
  labelEn: string;
  labelZh: string;
  status: string;
  sortOrder: number;
};
type RegistryItem = {
  key: string;
  labelEn: string;
  labelZh: string;
  metadata?: { control?: string };
};
function stableKey(value: string, fallback: string) {
  return (
    value
      .normalize("NFKD")
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 150) || fallback
  );
}

export default function FormEditorPage() {
  const { locale } = useI18n();
  const { id } = useParams<{ id: string }>();
  const [template, setTemplate] = useState<Template | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [versionId, setVersionId] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [fieldTypes, setFieldTypes] = useState<RegistryItem[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [selectedFieldId, setSelectedFieldId] = useState("");
  const [preview, setPreview] = useState(false);
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [showFieldForm, setShowFieldForm] = useState(false);
  const [sectionEn, setSectionEn] = useState("");
  const [sectionZh, setSectionZh] = useState("");
  const [fieldEn, setFieldEn] = useState("");
  const [fieldZh, setFieldZh] = useState("");
  const [fieldType, setFieldType] = useState("");
  const [required, setRequired] = useState(false);
  const [optionEn, setOptionEn] = useState("");
  const [optionZh, setOptionZh] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadVersion = useCallback(async (targetId: string) => {
    const bundle = await apiFetch<{
      version: Version;
      sections: Section[];
      fields: Field[];
      options: Option[];
    }>(`/api/v1/template-versions/${targetId}`);
    setSections(bundle.sections ?? []);
    setFields(bundle.fields ?? []);
    setOptions(bundle.options ?? []);
    setSelectedSectionId((current) =>
      bundle.sections.some((section) => section.id === current)
        ? current
        : (bundle.sections[0]?.id ?? ""),
    );
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [bundle, me, types] = await Promise.all([
        apiFetch<{ template: Template; versions: Version[] }>(
          `/api/v1/templates/${id}`,
        ),
        apiFetch<{ permissions: string[] }>("/api/v1/auth/me"),
        apiFetch<{ items: RegistryItem[] }>(
          "/api/v1/config/registries/collection_field_type?status=active",
        ),
      ]);
      setTemplate(bundle.template);
      setVersions(bundle.versions ?? []);
      setPermissions(me.permissions ?? []);
      setFieldTypes(types.items ?? []);
      setFieldType((current) => current || types.items?.[0]?.key || "");
      const target =
        bundle.versions.find((version) => version.status === "draft") ??
        bundle.versions.find(
          (version) => version.id === bundle.template.currentPublishedVersionId,
        ) ??
        bundle.versions[0];
      if (target) {
        setVersionId(target.id);
        await loadVersion(target.id);
      }
      if (typeof window !== "undefined")
        setPreview(
          new URLSearchParams(window.location.search).get("preview") === "1",
        );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [id, loadVersion]);
  useEffect(() => {
    void load();
  }, [load]);
  const currentVersion = versions.find((version) => version.id === versionId);
  const editable = Boolean(
    currentVersion?.status === "draft" &&
      permissions.includes("templates.edit"),
  );
  const selectedSection = sections.find(
    (section) => section.id === selectedSectionId,
  );
  const sectionFields = useMemo(
    () =>
      fields.filter((field) => field.templateSectionId === selectedSectionId),
    [fields, selectedSectionId],
  );
  const selectedField = fields.find((field) => field.id === selectedFieldId);
  const fieldOptions = options.filter(
    (option) => option.templateFieldId === selectedFieldId,
  );
  const selectedControl = fieldTypes.find(
    (item) => item.key === selectedField?.fieldTypeKey,
  )?.metadata?.control;
  const selectedFieldAllowsOptions =
    selectedControl === "single" || selectedControl === "multi";
  async function selectVersion(target: string) {
    setVersionId(target);
    setSelectedFieldId("");
    setLoading(true);
    try {
      await loadVersion(target);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }
  async function newDraft() {
    if (!currentVersion) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<{ version: Version }>(
        `/api/v1/templates/${id}/versions`,
        {
          method: "POST",
          body: JSON.stringify({ fromVersionId: currentVersion.id }),
        },
      );
      await load();
      await selectVersion(result.version.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function addSection() {
    if (!currentVersion || !sectionEn.trim() || !sectionZh.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<{ section: Section }>(
        `/api/v1/template-versions/${currentVersion.id}/sections`,
        {
          method: "POST",
          body: JSON.stringify({
            key: stableKey(sectionEn, `section-${sections.length + 1}`),
            labelEn: sectionEn.trim(),
            labelZh: sectionZh.trim(),
            sortOrder: sections.length,
            configuration: {},
          }),
        },
      );
      setSectionEn("");
      setSectionZh("");
      setShowSectionForm(false);
      await loadVersion(currentVersion.id);
      setSelectedSectionId(result.section.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function addField() {
    if (!selectedSection || !fieldEn.trim() || !fieldZh.trim() || !fieldType)
      return;
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<{ field: Field }>(
        `/api/v1/template-sections/${selectedSection.id}/fields`,
        {
          method: "POST",
          body: JSON.stringify({
            key: stableKey(fieldEn, `field-${sectionFields.length + 1}`),
            fieldTypeKey: fieldType,
            labelEn: fieldEn.trim(),
            labelZh: fieldZh.trim(),
            required,
            allowMissingReason: false,
            allowCustomEntry: false,
            sortOrder: sectionFields.length,
            validation: {},
            visibilityConditions: [],
            branchingLogic: [],
            canonicalMapping: {},
            configuration: {},
          }),
        },
      );
      setFieldEn("");
      setFieldZh("");
      setRequired(false);
      setShowFieldForm(false);
      await loadVersion(currentVersion!.id);
      setSelectedFieldId(result.field.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function addOption() {
    if (!selectedField || !optionEn.trim() || !optionZh.trim()) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/v1/template-fields/${selectedField.id}/options`, {
        method: "POST",
        body: JSON.stringify({
          key: stableKey(optionEn, `option-${fieldOptions.length + 1}`),
          labelEn: optionEn.trim(),
          labelZh: optionZh.trim(),
          status: "active",
          sortOrder: fieldOptions.length,
          configuration: {},
        }),
      });
      setOptionEn("");
      setOptionZh("");
      await loadVersion(currentVersion!.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (
      !currentVersion ||
      !confirm(
        locale === "zh"
          ? "发布此表单版本？已发布结构将不可修改。"
          : "Publish this form version? Its structure becomes immutable.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/v1/template-versions/${currentVersion.id}/publish`, {
        method: "POST",
      });
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  if (loading && !template)
    return (
      <>
        <PageHeader title={locale === "zh" ? "表单编辑器" : "Form editor"} />
        <LoadingState rows={6} />
      </>
    );
  return (
    <div className="stack">
      <PageHeader
        eyebrow={`${template?.key ?? ""} · ${template?.templateTypeKey ?? ""}`}
        title={
          currentVersion
            ? locale === "zh"
              ? currentVersion.nameZh
              : currentVersion.nameEn
            : locale === "zh"
              ? "表单"
              : "Form"
        }
        description={
          currentVersion
            ? `${locale === "zh" ? "版本" : "Version"} ${currentVersion.version} · ${currentVersion.status}`
            : undefined
        }
        actions={
          <>
            <Link className="button button-secondary" href="/forms">
              <AppIcon name="back" />
              {locale === "zh" ? "返回" : "Back"}
            </Link>
            <button
              className="button button-secondary"
              onClick={() => setPreview((value) => !value)}
              type="button"
            >
              {preview
                ? locale === "zh"
                  ? "编辑"
                  : "Edit"
                : locale === "zh"
                  ? "预览"
                  : "Preview"}
            </button>
            {editable && permissions.includes("templates.publish") ? (
              <button
                className="button"
                disabled={busy || !sections.length || !fields.length}
                onClick={publish}
                type="button"
              >
                <AppIcon name="check" />
                {locale === "zh" ? "发布" : "Publish"}
              </button>
            ) : null}
          </>
        }
      />
      {error ? <ErrorState message={error} retry={load} /> : null}
      {!editable && currentVersion ? (
        <div className="feedback feedback-info">
          <span>
            {locale === "zh"
              ? "当前是只读的已发布版本。"
              : "This published version is read-only."}
          </span>
          {permissions.includes("templates.edit") ? (
            <button
              className="button button-secondary button-small"
              disabled={busy}
              onClick={newDraft}
              type="button"
            >
              {locale === "zh" ? "复制为新草稿" : "Clone to new draft"}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="editor-layout">
        <aside className="editor-sidebar">
          <section className="card stack-sm">
            <label>
              {locale === "zh" ? "版本" : "Version"}
              <select
                onChange={(event) => void selectVersion(event.target.value)}
                value={versionId}
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    v{version.version} · {version.status}
                  </option>
                ))}
              </select>
            </label>
            <div className="row-between">
              <h2>{locale === "zh" ? "章节" : "Sections"}</h2>
              <StatusPill
                tone={
                  currentVersion?.status === "published" ? "green" : "amber"
                }
              >
                {currentVersion?.status ?? "—"}
              </StatusPill>
            </div>
            <div className="section-picker">
              {sections.map((section, index) => (
                <button
                  className={section.id === selectedSectionId ? "active" : ""}
                  key={section.id}
                  onClick={() => {
                    setSelectedSectionId(section.id);
                    setSelectedFieldId("");
                  }}
                  type="button"
                >
                  <span>
                    {index + 1}.{" "}
                    {locale === "zh" ? section.labelZh : section.labelEn}
                  </span>
                  <span className="caption">
                    {
                      fields.filter(
                        (field) => field.templateSectionId === section.id,
                      ).length
                    }
                  </span>
                </button>
              ))}
            </div>
            {editable ? (
              <button
                className="button button-secondary button-wide button-small"
                onClick={() => setShowSectionForm((value) => !value)}
                type="button"
              >
                <AppIcon name="plus" />
                {locale === "zh" ? "添加章节" : "Add section"}
              </button>
            ) : null}
            {showSectionForm ? (
              <div className="stack-sm">
                <label>
                  中文
                  <input
                    onChange={(event) => setSectionZh(event.target.value)}
                    value={sectionZh}
                  />
                </label>
                <label>
                  English
                  <input
                    onChange={(event) => setSectionEn(event.target.value)}
                    value={sectionEn}
                  />
                </label>
                <button
                  className="button button-small"
                  disabled={busy || !sectionZh.trim() || !sectionEn.trim()}
                  onClick={addSection}
                  type="button"
                >
                  {locale === "zh" ? "保存章节" : "Save section"}
                </button>
              </div>
            ) : null}
          </section>
        </aside>
        <main className="editor-canvas">
          {preview ? (
            <section className="card stack">
              <div className="progress-label">
                <span>{locale === "zh" ? "表单预览" : "Form preview"}</span>
                <span>
                  {sections.length} {locale === "zh" ? "节" : "sections"}
                </span>
              </div>
              {sections.map((section) => (
                <div className="editor-section" key={section.id}>
                  <div>
                    <h2>
                      {locale === "zh" ? section.labelZh : section.labelEn}
                    </h2>
                    <p className="muted">
                      {locale === "zh"
                        ? section.helpTextZh
                        : section.helpTextEn}
                    </p>
                  </div>
                  {fields
                    .filter((field) => field.templateSectionId === section.id)
                    .map((field) => (
                      <label key={field.id}>
                        {locale === "zh" ? field.labelZh : field.labelEn}
                        {field.required ? " *" : ""}
                        {fieldOptionsFor(field.id, options).length ? (
                          <select disabled>
                            <option>
                              {locale === "zh" ? "请选择…" : "Select…"}
                            </option>
                            {fieldOptionsFor(field.id, options).map(
                              (option) => (
                                <option key={option.id}>
                                  {locale === "zh"
                                    ? option.labelZh
                                    : option.labelEn}
                                </option>
                              ),
                            )}
                          </select>
                        ) : (
                          <input disabled placeholder={field.fieldTypeKey} />
                        )}
                      </label>
                    ))}
                </div>
              ))}
            </section>
          ) : selectedSection ? (
            <section className="card stack">
              <div className="editor-toolbar">
                <div>
                  <div className="eyebrow">{selectedSection.key}</div>
                  <h2>
                    {locale === "zh"
                      ? selectedSection.labelZh
                      : selectedSection.labelEn}
                  </h2>
                </div>
                {editable ? (
                  <button
                    className="button button-secondary button-small"
                    onClick={() => setShowFieldForm((value) => !value)}
                    type="button"
                  >
                    <AppIcon name="plus" />
                    {locale === "zh" ? "添加字段" : "Add field"}
                  </button>
                ) : null}
              </div>
              {showFieldForm ? (
                <div className="editor-field">
                  <div className="form-grid">
                    <label>
                      中文标签
                      <input
                        onChange={(event) => setFieldZh(event.target.value)}
                        value={fieldZh}
                      />
                    </label>
                    <label>
                      English label
                      <input
                        onChange={(event) => setFieldEn(event.target.value)}
                        value={fieldEn}
                      />
                    </label>
                    <label>
                      {locale === "zh" ? "字段类型" : "Field type"}
                      <select
                        onChange={(event) => setFieldType(event.target.value)}
                        value={fieldType}
                      >
                        {fieldTypes.map((item) => (
                          <option key={item.key} value={item.key}>
                            {locale === "zh" ? item.labelZh : item.labelEn}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="choice" style={{ alignSelf: "end" }}>
                      <input
                        checked={required}
                        onChange={(event) => setRequired(event.target.checked)}
                        type="checkbox"
                      />
                      <span>{locale === "zh" ? "必填" : "Required"}</span>
                    </label>
                  </div>
                  <button
                    className="button button-small"
                    disabled={
                      busy || !fieldZh.trim() || !fieldEn.trim() || !fieldType
                    }
                    onClick={addField}
                    type="button"
                  >
                    {locale === "zh" ? "添加字段" : "Add field"}
                  </button>
                </div>
              ) : null}
              {sectionFields.length ? (
                sectionFields.map((field, index) => (
                  <button
                    className={`editor-field${selectedFieldId === field.id ? " selected-row" : ""}`}
                    key={field.id}
                    onClick={() => setSelectedFieldId(field.id)}
                    style={{
                      width: "100%",
                      color: "inherit",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                    type="button"
                  >
                    <span className="editor-field-title">
                      <span>
                        <span className="caption">
                          {index + 1} · {field.fieldTypeKey}
                        </span>
                        <h3>
                          {locale === "zh" ? field.labelZh : field.labelEn}
                          {field.required ? " *" : ""}
                        </h3>
                      </span>
                      <StatusPill tone="blue">
                        {fieldOptionsFor(field.id, options).length}{" "}
                        {locale === "zh" ? "选项" : "options"}
                      </StatusPill>
                    </span>
                  </button>
                ))
              ) : (
                <div className="empty-state" style={{ minHeight: 220 }}>
                  <span className="empty-icon">
                    <AppIcon name="forms" />
                  </span>
                  <h2>
                    {locale === "zh"
                      ? "此章节暂无字段"
                      : "No fields in this section"}
                  </h2>
                </div>
              )}
              {selectedField && editable && selectedFieldAllowsOptions ? (
                <div className="card card-soft stack-sm">
                  <h3>{locale === "zh" ? "添加选项" : "Add option"}</h3>
                  <div className="form-grid">
                    <label>
                      中文
                      <input
                        onChange={(event) => setOptionZh(event.target.value)}
                        value={optionZh}
                      />
                    </label>
                    <label>
                      English
                      <input
                        onChange={(event) => setOptionEn(event.target.value)}
                        value={optionEn}
                      />
                    </label>
                  </div>
                  {fieldOptions.length ? (
                    <div className="row">
                      {fieldOptions.map((option) => (
                        <StatusPill key={option.id}>
                          {locale === "zh" ? option.labelZh : option.labelEn}
                        </StatusPill>
                      ))}
                    </div>
                  ) : null}
                  <button
                    className="button button-secondary button-small"
                    disabled={busy || !optionZh.trim() || !optionEn.trim()}
                    onClick={addOption}
                    type="button"
                  >
                    {locale === "zh" ? "保存选项" : "Save option"}
                  </button>
                </div>
              ) : null}
            </section>
          ) : (
            <section className="card">
              <p className="muted">
                {locale === "zh"
                  ? "添加或选择一个章节。"
                  : "Add or select a section."}
              </p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function fieldOptionsFor(fieldId: string, options: Option[]) {
  return options.filter(
    (option) =>
      option.templateFieldId === fieldId && option.status !== "archived",
  );
}
