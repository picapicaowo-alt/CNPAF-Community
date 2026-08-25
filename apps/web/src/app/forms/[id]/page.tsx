"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  configuredFormControl,
  type FormAnswers,
  type RuntimeFormField,
  type RuntimeFormOption,
  type RuntimeFormSection,
  type RuntimeRegistryItem,
} from "@cnpaf/shared";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  StatusPill,
} from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { DynamicFormSection } from "@/features/forms/runtime/DynamicFormSection";
import {
  archiveOption as archiveTemplateOption,
  deleteField as removeTemplateField,
  deleteSection as removeTemplateSection,
  duplicateField as copyTemplateField,
  duplicateSection as copyTemplateSection,
  reorderFields,
  reorderOptions,
  reorderSections,
  updateField as patchTemplateField,
  updateOption as patchTemplateOption,
  updateSection as patchTemplateSection,
} from "@/features/forms/editor/api";
import { moveId, stableFormKey } from "@/features/forms/editor/model";
import { FieldSettingsPanel } from "@/features/forms/editor/FieldSettingsPanel";
import { SectionSettingsPanel } from "@/features/forms/editor/SectionSettingsPanel";
import { FormBuilderOutline } from "@/features/forms/editor/FormBuilderOutline";
import { FormBuilderPreview } from "@/features/forms/editor/FormBuilderPreview";
import { FormVersionPanel } from "@/features/forms/versioning/FormVersionPanel";
import type {
  FormVersionSummary,
  ReleaseNotes,
} from "@/features/forms/versioning/types";

type Template = {
  id: string;
  key: string;
  templateTypeKey: string;
  currentPublishedVersionId?: string | null;
};
type Version = FormVersionSummary;
type Section = RuntimeFormSection;
type Field = RuntimeFormField;
type Option = RuntimeFormOption;
type RegistryItem = RuntimeRegistryItem;
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
  const [missingReasons, setMissingReasons] = useState<RegistryItem[]>([]);
  const [previewAnswers, setPreviewAnswers] = useState<FormAnswers>({});
  const [permissions, setPermissions] = useState<string[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [selectedFieldId, setSelectedFieldId] = useState("");
  const [settingsTarget, setSettingsTarget] = useState<
    "field" | "section" | null
  >(null);
  const [sectionDraft, setSectionDraft] = useState<Partial<Section> | null>(
    null,
  );
  const [fieldDraft, setFieldDraft] = useState<Partial<Field> | null>(null);
  const [preview, setPreview] = useState(false);
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [showFieldForm, setShowFieldForm] = useState(false);
  const [sectionEn, setSectionEn] = useState("");
  const [sectionZh, setSectionZh] = useState("");
  const [fieldEn, setFieldEn] = useState("");
  const [fieldZh, setFieldZh] = useState("");
  const [fieldType, setFieldType] = useState("");
  const [required, setRequired] = useState(false);
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
    setSelectedFieldId((current) =>
      bundle.fields.some((field) => field.id === current) ? current : "",
    );
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [bundle, me, types, reasons] = await Promise.all([
        apiFetch<{ template: Template; versions: Version[] }>(
          `/api/v1/templates/${id}`,
        ),
        apiFetch<{ permissions: string[] }>("/api/v1/auth/me"),
        apiFetch<{ items: RegistryItem[] }>(
          "/api/v1/config/registries/collection_field_type?status=active",
        ),
        apiFetch<{ items: RegistryItem[] }>(
          "/api/v1/config/registries/missing_reason?status=active",
        ),
      ]);
      setTemplate(bundle.template);
      setVersions(bundle.versions ?? []);
      setPermissions(me.permissions ?? []);
      setFieldTypes(types.items ?? []);
      setMissingReasons(reasons.items ?? []);
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
    (option) =>
      option.templateFieldId === selectedFieldId && option.status !== "archived",
  );
  const selectedControl = configuredFormControl(
    fieldTypes.find((item) => item.key === selectedField?.fieldTypeKey)
      ?.metadata,
  );
  const previewControls = useMemo(
    () =>
      new Map(
        fieldTypes.map((item) => [
          item.key,
          configuredFormControl(item.metadata),
        ]),
      ),
    [fieldTypes],
  );
  const previewSections = useMemo(
    () =>
      sections.map((section) =>
        section.id === selectedSectionId && sectionDraft
          ? { ...section, ...sectionDraft }
          : section,
      ),
    [sectionDraft, sections, selectedSectionId],
  );
  const previewFields = useMemo(
    () =>
      fields.map((field) =>
        field.id === selectedFieldId && fieldDraft
          ? { ...field, ...fieldDraft }
          : field,
      ),
    [fieldDraft, fields, selectedFieldId],
  );
  const previewSelectedSection = previewSections.find(
    (section) => section.id === selectedSectionId,
  );
  const previewSelectedField = previewFields.find(
    (field) => field.id === selectedFieldId,
  );
  const updateSectionPreview = useCallback(
    (body: Partial<Section>) => setSectionDraft(body),
    [],
  );
  const updateFieldPreview = useCallback(
    (body: Partial<Field>) => setFieldDraft(body),
    [],
  );
  const conditionFieldsForSection = useMemo(() => {
    const selectedOrder = sections.findIndex(
      (section) => section.id === selectedSectionId,
    );
    const earlierSectionIds = new Set(
      sections.slice(0, Math.max(0, selectedOrder)).map((section) => section.id),
    );
    return fields.filter((field) => earlierSectionIds.has(field.templateSectionId));
  }, [fields, sections, selectedSectionId]);
  const conditionFieldsForField = useMemo(() => {
    if (!selectedField) return [];
    const selectedSectionIndex = sections.findIndex(
      (section) => section.id === selectedField.templateSectionId,
    );
    return fields.filter((field) => {
      const fieldSectionIndex = sections.findIndex(
        (section) => section.id === field.templateSectionId,
      );
      return (
        fieldSectionIndex < selectedSectionIndex ||
        (fieldSectionIndex === selectedSectionIndex &&
          field.sortOrder < selectedField.sortOrder)
      );
    });
  }, [fields, sections, selectedField]);
  useEffect(() => {
    if (settingsTarget === "field" && !selectedField) setSettingsTarget(null);
    if (settingsTarget === "section" && !selectedSection)
      setSettingsTarget(null);
  }, [selectedField, selectedSection, settingsTarget]);

  function selectBuilderSection(sectionId: string) {
    const closing =
      sectionId === selectedSectionId && settingsTarget === "section";
    if (closing) {
      setSettingsTarget(null);
      return;
    }
    if (sectionId !== selectedSectionId) setSectionDraft(null);
    setFieldDraft(null);
    setSelectedSectionId(sectionId);
    setSelectedFieldId("");
    setSettingsTarget(editable ? "section" : null);
  }

  function selectBuilderField(fieldId: string) {
    const field = fields.find((candidate) => candidate.id === fieldId);
    if (!field) return;
    const closing = fieldId === selectedFieldId && settingsTarget === "field";
    if (closing) {
      setSettingsTarget(null);
      return;
    }
    if (fieldId !== selectedFieldId) setFieldDraft(null);
    if (field.templateSectionId !== selectedSectionId) setSectionDraft(null);
    setSelectedSectionId(field.templateSectionId);
    setSelectedFieldId(fieldId);
    setSettingsTarget(editable ? "field" : null);
  }
  async function selectVersion(target: string) {
    setVersionId(target);
    setSelectedFieldId("");
    setSettingsTarget(null);
    setSectionDraft(null);
    setFieldDraft(null);
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
            key: stableFormKey(sectionEn, `section-${sections.length + 1}`),
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
      setSelectedFieldId("");
      setSettingsTarget("section");
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
            key: stableFormKey(fieldEn, `field-${sectionFields.length + 1}`),
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
      setSettingsTarget("field");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function addOption(body: { labelEn: string; labelZh: string }) {
    if (!selectedField || !body.labelEn.trim() || !body.labelZh.trim())
      return false;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/v1/template-fields/${selectedField.id}/options`, {
        method: "POST",
        body: JSON.stringify({
          key: stableFormKey(body.labelEn, `option-${fieldOptions.length + 1}`),
          labelEn: body.labelEn.trim(),
          labelZh: body.labelZh.trim(),
          status: "active",
          sortOrder: fieldOptions.length,
          configuration: {},
        }),
      });
      await loadVersion(currentVersion!.id);
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function saveSection(body: Partial<Section>) {
    if (!selectedSection || !currentVersion) return;
    setBusy(true);
    setError("");
    try {
      await patchTemplateSection(selectedSection.id, body);
      await loadVersion(currentVersion.id);
      setSectionDraft(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function deleteSection() {
    if (!selectedSection || !currentVersion) return;
    setBusy(true);
    setError("");
    try {
      await removeTemplateSection(selectedSection.id);
      setSelectedSectionId("");
      setSelectedFieldId("");
      setSettingsTarget(null);
      setSectionDraft(null);
      setFieldDraft(null);
      await loadVersion(currentVersion.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function duplicateSection() {
    if (!selectedSection || !currentVersion) return;
    setBusy(true);
    setError("");
    try {
      const result = await copyTemplateSection(selectedSection.id);
      await loadVersion(currentVersion.id);
      setSelectedSectionId(result.section.id);
      setSelectedFieldId("");
      setSettingsTarget("section");
      setSectionDraft(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function moveSection(direction: -1 | 1) {
    if (!selectedSection || !currentVersion) return;
    setBusy(true);
    setError("");
    try {
      await reorderSections(
        currentVersion.id,
        moveId(
          sections.map((section) => section.id),
          selectedSection.id,
          direction,
        ),
      );
      await loadVersion(currentVersion.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function reorderSectionIds(orderedIds: string[]) {
    if (!currentVersion) return;
    setBusy(true);
    setError("");
    try {
      await reorderSections(currentVersion.id, orderedIds);
      await loadVersion(currentVersion.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function saveField(
    body: Partial<Field> & { templateSectionId?: string },
  ) {
    if (!selectedField || !currentVersion) return;
    setBusy(true);
    setError("");
    try {
      const result = await patchTemplateField(selectedField.id, body);
      if (result.field.templateSectionId !== selectedSectionId)
        setSelectedSectionId(result.field.templateSectionId);
      await loadVersion(currentVersion.id);
      setSelectedFieldId(result.field.id);
      setFieldDraft(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function deleteField() {
    if (!selectedField || !currentVersion) return;
    setBusy(true);
    setError("");
    try {
      await removeTemplateField(selectedField.id);
      setSelectedFieldId("");
      setSettingsTarget(null);
      setFieldDraft(null);
      await loadVersion(currentVersion.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function duplicateField() {
    if (!selectedField || !currentVersion) return;
    setBusy(true);
    setError("");
    try {
      const result = await copyTemplateField(selectedField.id);
      await loadVersion(currentVersion.id);
      setSelectedFieldId(result.field.id);
      setSettingsTarget("field");
      setFieldDraft(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function moveField(direction: -1 | 1) {
    if (!selectedField || !currentVersion) return;
    setBusy(true);
    setError("");
    try {
      await reorderFields(
        selectedField.templateSectionId,
        moveId(
          sectionFields.map((field) => field.id),
          selectedField.id,
          direction,
        ),
      );
      await loadVersion(currentVersion.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function reorderFieldIds(sectionId: string, orderedIds: string[]) {
    if (!currentVersion) return;
    setBusy(true);
    setError("");
    try {
      await reorderFields(sectionId, orderedIds);
      await loadVersion(currentVersion.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function saveOption(optionId: string, body: Partial<Option>) {
    if (!currentVersion) return;
    setBusy(true);
    setError("");
    try {
      await patchTemplateOption(optionId, body);
      await loadVersion(currentVersion.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function archiveOption(optionId: string) {
    if (!currentVersion) return;
    setBusy(true);
    setError("");
    try {
      await archiveTemplateOption(optionId);
      await loadVersion(currentVersion.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function moveOption(optionId: string, direction: -1 | 1) {
    if (!selectedField || !currentVersion) return;
    setBusy(true);
    setError("");
    try {
      await reorderOptions(
        selectedField.id,
        moveId(
          fieldOptions.map((option) => option.id),
          optionId,
          direction,
        ),
      );
      await loadVersion(currentVersion.id);
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
  async function unpublish() {
    if (
      !template?.currentPublishedVersionId ||
      !confirm(
        locale === "zh"
          ? "撤回当前发布版本并返回草稿？现有任务和历史记录仍保留原版本。"
          : "Unpublish the current version and return to draft? Existing tasks and records keep their pinned version.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/v1/templates/${id}/unpublish`, { method: "POST" });
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function setQuickCapture(enabled: boolean) {
    if (!currentVersion) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/v1/template-versions/${currentVersion.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          configuration: {
            ...currentVersion.configuration,
            allowQuickCapture: enabled,
          },
        }),
      });
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function saveReleaseNotes(notes: ReleaseNotes) {
    if (!currentVersion) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/v1/template-versions/${currentVersion.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          configuration: {
            ...currentVersion.configuration,
            releaseNotes: notes,
          },
        }),
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
    <div className="stack form-editor-page">
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
              onClick={() => {
                setPreview((value) => !value);
                setShowFieldForm(false);
                setShowSectionForm(false);
              }}
              type="button"
            >
              {preview
                ? locale === "zh"
                  ? "返回编辑"
                  : "Back to editor"
                : locale === "zh"
                  ? "完整预览"
                  : "Full preview"}
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
            {!editable &&
            currentVersion?.id === template?.currentPublishedVersionId &&
            permissions.includes("templates.publish") &&
            permissions.includes("templates.edit") ? (
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={unpublish}
                type="button"
              >
                <AppIcon name="unpublish" />
                {locale === "zh" ? "撤回发布" : "Unpublish"}
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
              ? "当前是只读的已发布版本。你可以创建并行草稿，或撤回发布后继续修改。"
              : "This published version is read-only. Create a parallel draft, or unpublish it before continuing."}
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
      {template && currentVersion ? (
        <FormVersionPanel
          busy={busy}
          currentVersion={currentVersion}
          editable={editable}
          locale={locale}
          onSaveReleaseNotes={saveReleaseNotes}
          templateId={template.id}
          versions={versions}
        />
      ) : null}
      {preview ? (
        <section className="card stack builder-full-preview">
          <div className="progress-label">
            <span>{locale === "zh" ? "完整表单预览" : "Full form preview"}</span>
            <span>
              {sections.length} {locale === "zh" ? "个章节" : "sections"}
            </span>
          </div>
          {previewSections.map((section) => (
            <DynamicFormSection
              answers={previewAnswers}
              controls={previewControls}
              fields={previewFields}
              key={section.id}
              locale={locale}
              missingReasons={missingReasons}
              onChange={(fieldId, answer) =>
                setPreviewAnswers((current) => ({
                  ...current,
                  [fieldId]: answer,
                }))
              }
              options={options}
              section={section}
              sections={previewSections}
            />
          ))}
        </section>
      ) : (
        <div
          className={`editor-layout builder-layout${settingsTarget && editable ? " has-inspector" : ""}`}
        >
          <aside className="editor-sidebar">
            <section className="card stack-sm builder-sidebar-card">
              <div className="builder-version-row">
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
                <StatusPill
                  tone={
                    currentVersion?.status === "published" ? "green" : "amber"
                  }
                >
                  {currentVersion?.status ?? "—"}
                </StatusPill>
              </div>
              {editable ? (
                <label className="choice builder-quick-capture">
                  <input
                    checked={
                      currentVersion?.configuration.allowQuickCapture === true
                    }
                    disabled={busy}
                    onChange={(event) =>
                      void setQuickCapture(event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>
                    {locale === "zh" ? "允许快速采集" : "Allow quick capture"}
                  </span>
                </label>
              ) : null}
              <FormBuilderOutline
                busy={busy}
                editable={editable}
                fields={previewFields}
                locale={locale}
                onReorderFields={reorderFieldIds}
                onReorderSections={reorderSectionIds}
                onSelectField={selectBuilderField}
                onSelectSection={selectBuilderSection}
                sections={previewSections}
                selectedFieldId={selectedFieldId}
                selectedSectionId={selectedSectionId}
                settingsTarget={settingsTarget}
              />
              {editable ? (
                <button
                  className="button button-secondary button-wide button-small"
                  onClick={() => setShowSectionForm((value) => !value)}
                  type="button"
                >
                  <AppIcon name={showSectionForm ? "close" : "plus"} />
                  {showSectionForm
                    ? locale === "zh"
                      ? "取消添加"
                      : "Cancel"
                    : locale === "zh"
                      ? "添加章节"
                      : "Add section"}
                </button>
              ) : null}
              {showSectionForm ? (
                <div className="stack-sm builder-inline-create">
                  <label>
                    中文标题
                    <input
                      onChange={(event) => setSectionZh(event.target.value)}
                      value={sectionZh}
                    />
                  </label>
                  <label>
                    English title
                    <input
                      onChange={(event) => setSectionEn(event.target.value)}
                      value={sectionEn}
                    />
                  </label>
                  <button
                    className="button button-small button-wide"
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
            <section className="card builder-preview-panel">
              <div className="builder-canvas-toolbar">
                <div>
                  <div className="row builder-live-label">
                    <span className="builder-live-dot" />
                    <strong>
                      {locale === "zh" ? "实时预览" : "Live preview"}
                    </strong>
                  </div>
                  <p className="caption">
                    {locale === "zh"
                      ? "填写、切换条件并直接查看采集端效果"
                      : "Test inputs and conditional behavior as you build"}
                  </p>
                </div>
                {editable && selectedSection ? (
                  <button
                    className="button button-secondary button-small"
                    onClick={() => setShowFieldForm((value) => !value)}
                    type="button"
                  >
                    <AppIcon name={showFieldForm ? "close" : "plus"} />
                    {showFieldForm
                      ? locale === "zh"
                        ? "收起"
                        : "Close"
                      : locale === "zh"
                        ? "添加题目"
                        : "Add field"}
                  </button>
                ) : null}
              </div>
              {showFieldForm && selectedSection ? (
                <div className="builder-inline-create builder-field-create">
                  <div className="form-grid">
                    <label>
                      中文题目
                      <input
                        onChange={(event) => setFieldZh(event.target.value)}
                        value={fieldZh}
                      />
                    </label>
                    <label>
                      English question
                      <input
                        onChange={(event) => setFieldEn(event.target.value)}
                        value={fieldEn}
                      />
                    </label>
                    <label>
                      {locale === "zh" ? "题型" : "Field type"}
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
                    <label className="choice builder-create-required">
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
                    {locale === "zh" ? "添加并编辑" : "Add and edit"}
                  </button>
                </div>
              ) : null}
              {previewSelectedSection ? (
                <FormBuilderPreview
                  answers={previewAnswers}
                  busy={busy}
                  controls={previewControls}
                  editable={editable}
                  fields={previewFields}
                  locale={locale}
                  missingReasons={missingReasons}
                  onChange={(fieldId, answer) =>
                    setPreviewAnswers((current) => ({
                      ...current,
                      [fieldId]: answer,
                    }))
                  }
                  onReorderFields={(orderedIds) =>
                    reorderFieldIds(selectedSectionId, orderedIds)
                  }
                  onSelectField={selectBuilderField}
                  options={options}
                  section={previewSelectedSection}
                  sections={previewSections}
                  selectedFieldId={selectedFieldId}
                />
              ) : (
                <div className="empty-state builder-no-section">
                  <span className="empty-icon">
                    <AppIcon name="forms" />
                  </span>
                  <h2>
                    {locale === "zh" ? "先添加一个章节" : "Add a section first"}
                  </h2>
                  <p>
                    {locale === "zh"
                      ? "章节会成为采集表单中的步骤。"
                      : "Sections become steps in the collection form."}
                  </p>
                </div>
              )}
            </section>
          </main>
          {settingsTarget && editable ? (
            <aside className="editor-inspector">
              {settingsTarget === "section" && previewSelectedSection ? (
                <SectionSettingsPanel
                  availableFields={conditionFieldsForSection}
                  busy={busy}
                  controls={previewControls}
                  fieldCount={sectionFields.length}
                  index={sections.findIndex(
                    (section) => section.id === selectedSectionId,
                  )}
                  key={previewSelectedSection.id}
                  locale={locale}
                  onClose={() => setSettingsTarget(null)}
                  onDelete={deleteSection}
                  onDuplicate={duplicateSection}
                  onMove={moveSection}
                  onPreviewChange={updateSectionPreview}
                  onSave={saveSection}
                  options={options}
                  section={previewSelectedSection}
                  total={sections.length}
                />
              ) : null}
              {settingsTarget === "field" && previewSelectedField ? (
                  <FieldSettingsPanel
                    allFields={conditionFieldsForField}
                    allOptions={options}
                    busy={busy}
                    control={selectedControl}
                    controls={previewControls}
                    field={previewSelectedField}
                    fieldTypes={fieldTypes}
                    index={sectionFields.findIndex(
                      (field) => field.id === selectedFieldId,
                    )}
                    key={previewSelectedField.id}
                    locale={locale}
                    onAddOption={addOption}
                    onArchiveOption={archiveOption}
                    onClose={() => setSettingsTarget(null)}
                    onDelete={deleteField}
                    onDuplicate={duplicateField}
                    onMove={moveField}
                    onMoveOption={moveOption}
                    onPreviewChange={updateFieldPreview}
                    onSave={saveField}
                    onSaveOption={saveOption}
                    options={fieldOptions}
                    sections={sections}
                    total={sectionFields.length}
                  />
              ) : null}
            </aside>
          ) : null}
        </div>
      )}
    </div>
  );
}
