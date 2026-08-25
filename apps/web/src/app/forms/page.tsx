"use client";

import { FORM_PRESETS } from "@cnpaf/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusPill,
} from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { FormPreviewPopover } from "@/features/forms/components/FormPreviewPopover";
import {
  TemplateLaunchModal,
  type TemplateChoice,
} from "@/features/forms/components/TemplateLaunchModal";

type Template = {
  id: string;
  key: string;
  templateTypeKey: string;
  status: string;
  currentPublishedVersionId?: string | null;
  updatedAt?: string;
};
type Version = {
  id: string;
  version: number;
  nameEn: string;
  nameZh: string;
  descriptionEn?: string | null;
  descriptionZh?: string | null;
  status: string;
  usageCount?: number;
  sectionCount?: number;
  fieldCount?: number;
  configuration?: Record<string, unknown>;
  updatedAt?: string;
};
type FormCard = { template: Template; versions: Version[] };
type StatusFilter = "all" | "draft" | "published";

export default function FormsPage() {
  const { locale } = useI18n();
  const router = useRouter();
  const [forms, setForms] = useState<FormCard[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [workingId, setWorkingId] = useState("");
  const [showTemplateLauncher, setShowTemplateLauncher] = useState(false);
  const [quickIds, setQuickIds] = useState<string[]>(
    FORM_PRESETS.slice(0, 3).map((preset) => `preset:${preset.key}`),
  );
  const [quickReady, setQuickReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [me, list] = await Promise.all([
        apiFetch<{ permissions: string[] }>("/api/v1/auth/me"),
        apiFetch<{ templates: Template[] }>("/api/v1/templates"),
      ]);
      setPermissions(me.permissions ?? []);
      setForms(
        await Promise.all(
          (list.templates ?? []).map((template) =>
            apiFetch<FormCard>(`/api/v1/templates/${template.id}`),
          ),
        ),
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("cnpaf-form-quick-add");
      if (saved) {
        const parsed = JSON.parse(saved);
        const ids = Array.isArray(parsed) ? parsed : parsed?.version === 1 ? parsed.ids : null;
        if (Array.isArray(ids) && ids.every((value) => typeof value === "string")) {
          setQuickIds(ids);
        }
      }
    } catch {
      // Keep the default Quick Add choices if local storage is unavailable.
    } finally {
      setQuickReady(true);
    }
  }, []);

  useEffect(() => {
    if (!quickReady) return;
    try {
      window.localStorage.setItem(
        "cnpaf-form-quick-add",
        JSON.stringify({ version: 1, ids: quickIds }),
      );
    } catch {
      // Quick Add remains usable for this session without persistence.
    }
  }, [quickIds, quickReady]);

  const reusableForms = useMemo(
    () =>
      forms.filter(({ versions }) =>
        versions.some(
          (version) => version.configuration?.savedAsReusableTemplate === true,
        ),
      ),
    [forms],
  );
  const managedForms = useMemo(
    () =>
      forms.filter(({ versions }) =>
        versions.every(
          (version) => version.configuration?.savedAsReusableTemplate !== true,
        ),
      ),
    [forms],
  );

  const templateChoices = useMemo<TemplateChoice[]>(() => {
    const presetChoices: TemplateChoice[] = FORM_PRESETS.map((preset) => ({
      id: `preset:${preset.key}`,
      kind: "preset",
      sourceId: preset.key,
      title: locale === "zh" ? preset.nameZh : preset.nameEn,
      description: locale === "zh" ? preset.descriptionZh : preset.descriptionEn,
      meta: `${locale === "zh" ? preset.useCaseZh : preset.useCaseEn} · ${preset.estimatedMinutes} ${locale === "zh" ? "分钟" : "min"}`,
      recommended: preset.recommended,
    }));
    const libraryChoices: TemplateChoice[] = reusableForms.flatMap((card) => {
      const version = card.versions.find(
        (item) => item.configuration?.savedAsReusableTemplate === true,
      );
      if (!version) return [];
      return [{
        id: `library:${card.template.id}`,
        kind: "library" as const,
        sourceId: card.template.id,
        title: locale === "zh" ? version.nameZh : version.nameEn,
        description:
          (locale === "zh" ? version.descriptionZh : version.descriptionEn) ||
          (locale === "zh" ? "团队保存的可复用表单结构。" : "A reusable form structure saved by your team."),
        meta: `${version.sectionCount ?? 0} ${locale === "zh" ? "个章节" : "sections"} · ${version.fieldCount ?? 0} ${locale === "zh" ? "个问题" : "questions"}`,
      }];
    });
    return [...libraryChoices, ...presetChoices];
  }, [locale, reusableForms]);

  const quickChoices = useMemo(
    () =>
      quickIds
        .map((id) => templateChoices.find((choice) => choice.id === id))
        .filter((choice): choice is TemplateChoice => Boolean(choice))
        .slice(0, 4),
    [quickIds, templateChoices],
  );

  const visible = useMemo(
    () =>
      managedForms.filter(({ template, versions }) => {
        const hasDraft = versions.some((version) => version.status === "draft");
        const hasPublished = Boolean(template.currentPublishedVersionId);
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "draft" && hasDraft) ||
          (statusFilter === "published" && hasPublished);
        const value = query.trim().toLocaleLowerCase();
        return (
          matchesStatus &&
          (!value ||
            [
              template.key,
              template.templateTypeKey,
              ...versions.flatMap((version) => [version.nameEn, version.nameZh]),
            ].some((part) => part?.toLocaleLowerCase().includes(value)))
        );
      }),
    [managedForms, query, statusFilter],
  );

  const summary = useMemo(
    () => ({
      published: managedForms.filter(({ template }) => template.currentPublishedVersionId).length,
      drafts: managedForms.filter(({ versions }) =>
        versions.some((version) => version.status === "draft"),
      ).length,
    }),
    [managedForms],
  );

  function chooseTemplate(choice: TemplateChoice) {
    if (choice.kind === "preset") {
      router.push(`/forms/new?preset=${encodeURIComponent(choice.sourceId)}`);
      return;
    }
    const card = reusableForms.find(
      (item) => item.template.id === choice.sourceId,
    );
    if (card) void duplicateForm(card, "form");
  }

  function toggleQuick(choiceId: string) {
    setQuickIds((current) =>
      current.includes(choiceId)
        ? current.filter((id) => id !== choiceId)
        : [...current, choiceId],
    );
  }

  async function deleteReusableTemplate(choice: TemplateChoice) {
    const card = reusableForms.find(
      (item) => item.template.id === choice.sourceId,
    );
    if (!card) return;
    if (await removeForm(card, choice.title, "template")) {
      setQuickIds((current) => current.filter((id) => id !== choice.id));
    }
  }

  async function editForm(card: FormCard) {
    const draft = card.versions.find((version) => version.status === "draft");
    if (draft) {
      router.push(`/forms/${card.template.id}`);
      return;
    }
    const published = card.versions.find(
      (version) => version.id === card.template.currentPublishedVersionId,
    );
    if (!published) {
      router.push(`/forms/${card.template.id}`);
      return;
    }
    setWorkingId(card.template.id);
    setError("");
    try {
      await apiFetch(`/api/v1/templates/${card.template.id}/versions`, {
        method: "POST",
        body: JSON.stringify({ fromVersionId: published.id }),
      });
      router.push(`/forms/${card.template.id}`);
    } catch (caught) {
      setError(errorMessage(caught));
      setWorkingId("");
    }
  }

  async function removeForm(
    card: FormCard,
    name: string,
    itemKind: "form" | "template" = "form",
  ) {
    const confirmed = window.confirm(
      itemKind === "template"
        ? locale === "zh"
          ? `删除模板“${name}”？使用它创建的表单和历史记录不会受影响。`
          : `Delete the template “${name}”? Forms created from it and historical records will not be affected.`
        : locale === "zh"
          ? `从表单列表删除“${name}”？已发布版本、历史任务和记录会继续保留。`
          : `Remove “${name}” from the form list? Published versions, historical tasks, and records will remain available.`,
    );
    if (!confirmed) return false;
    setWorkingId(card.template.id);
    setError("");
    try {
      await apiFetch(`/api/v1/templates/${card.template.id}`, { method: "DELETE" });
      setForms((current) =>
        current.filter((item) => item.template.id !== card.template.id),
      );
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      return false;
    } finally {
      setWorkingId("");
    }
  }

  async function unpublishForm(card: FormCard, name: string) {
    if (
      !window.confirm(
        locale === "zh"
          ? `撤回“${name}”并返回草稿状态？现有任务与历史记录仍保留原发布版本。`
          : `Unpublish “${name}” and return it to draft? Existing tasks and records keep their pinned version.`,
      )
    )
      return;
    setWorkingId(card.template.id);
    setError("");
    try {
      await apiFetch(`/api/v1/templates/${card.template.id}/unpublish`, {
        method: "POST",
      });
      router.push(`/forms/${card.template.id}`);
    } catch (caught) {
      setError(errorMessage(caught));
      setWorkingId("");
    }
  }

  async function duplicateForm(
    card: FormCard,
    purpose: "form" | "template",
  ) {
    setWorkingId(card.template.id);
    setError("");
    try {
      const result = await apiFetch<{ template: { id: string } }>(
        `/api/v1/templates/${card.template.id}/duplicate`,
        {
          method: "POST",
          body: JSON.stringify({ purpose }),
        },
      );
      router.push(`/forms/${result.template.id}`);
    } catch (caught) {
      setError(errorMessage(caught));
      setWorkingId("");
    }
  }

  const canCreate = permissions.includes("templates.create");
  const canEdit = permissions.includes("templates.edit");
  const canArchive = permissions.includes("templates.archive");
  const canPublish = permissions.includes("templates.publish");

  return (
    <div className="stack forms-manage-page">
      <PageHeader
        title={locale === "zh" ? "表单" : "Forms"}
        description={
          locale === "zh"
            ? "集中管理草稿和已发布表单；历史版本始终保留。"
            : "Manage drafts and published forms in one place while preserving history."
        }
        actions={
          canCreate ? (
            <button className="button" onClick={() => setShowTemplateLauncher(true)} type="button">
              <AppIcon name="plus" />
              {locale === "zh" ? "新建表单" : "New form"}
            </button>
          ) : undefined
        }
      />
      {canCreate ? (
        <section className="form-quick-add" aria-label="Quick Add">
          <div className="form-quick-add-label">
            <span className="eyebrow">Quick Add</span>
            <span>{locale === "zh" ? "常用模板" : "Favorite templates"}</span>
          </div>
          <div className="form-quick-add-items">
            {quickChoices.map((choice) => (
              <button
                disabled={workingId === choice.sourceId}
                key={choice.id}
                onClick={() => chooseTemplate(choice)}
                type="button"
              >
                <AppIcon name={choice.kind === "library" ? "template" : "plus"} />
                <span>{choice.title}</span>
              </button>
            ))}
            <button className="form-quick-add-manage" onClick={() => setShowTemplateLauncher(true)} type="button">
              <AppIcon name="settings" />
              <span>{locale === "zh" ? "设置" : "Customize"}</span>
            </button>
          </div>
        </section>
      ) : null}
      {!loading ? (
        <div className="form-summary-strip">
          <div><strong>{managedForms.length}</strong><span>{locale === "zh" ? "全部表单" : "All forms"}</span></div>
          <div><strong>{summary.published}</strong><span>{locale === "zh" ? "已发布" : "Published"}</span></div>
          <div><strong>{summary.drafts}</strong><span>{locale === "zh" ? "待完成草稿" : "Drafts to finish"}</span></div>
        </div>
      ) : null}
      {error ? <ErrorState message={error} retry={load} /> : null}
      <div className="form-list-toolbar">
        <div className="search-control">
          <AppIcon name="search" />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              locale === "zh"
                ? "按名称或类型搜索…"
                : "Search by name or type…"
            }
            value={query}
          />
        </div>
        <div
          aria-label={locale === "zh" ? "状态筛选" : "Status filter"}
          className="segmented-control"
          role="group"
        >
          {(["all", "published", "draft"] as const).map((value) => (
            <button
              aria-pressed={statusFilter === value}
              className={statusFilter === value ? "active" : ""}
              key={value}
              onClick={() => setStatusFilter(value)}
              type="button"
            >
              {locale === "zh"
                ? { all: "全部", published: "已发布", draft: "草稿" }[value]
                : { all: "All", published: "Published", draft: "Drafts" }[value]}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <LoadingState rows={5} />
      ) : visible.length ? (
        <div className="grid-3 form-card-grid">
          {visible.map((card) => {
            const { template, versions } = card;
            const draft = versions.find((version) => version.status === "draft");
            const published = versions.find(
              (version) => version.id === template.currentPublishedVersionId,
            );
            const display = draft ?? published ?? versions[0];
            const name = display
              ? locale === "zh"
                ? display.nameZh
                : display.nameEn
              : template.key;
            const description = display
              ? locale === "zh"
                ? display.descriptionZh
                : display.descriptionEn
              : null;
            return (
              <article className="card form-manage-card" key={template.id}>
                <div className="form-card-heading">
                  <span className="form-icon-tile">
                    <AppIcon name="forms" />
                  </span>
                  <div className="form-card-heading-copy">
                    <span className="form-card-type">{template.templateTypeKey}</span>
                    <h2>{name}</h2>
                  </div>
                  <div className="row form-status-group">
                    {published ? (
                      <StatusPill tone="green">
                        {locale === "zh" ? "已发布" : "Published"}
                      </StatusPill>
                    ) : null}
                    {draft ? (
                      <StatusPill tone="amber">
                        {locale === "zh" ? "有草稿" : "Draft"}
                      </StatusPill>
                    ) : null}
                  </div>
                </div>
                <div className="form-card-copy">
                  <p className="muted">
                    {description ||
                      (locale === "zh" ? "尚未添加表单说明。" : "No description yet.")}
                  </p>
                </div>
                <div className="form-card-meta">
                  <span>
                    <AppIcon name="forms" />
                    {display?.fieldCount ?? 0} {locale === "zh" ? "个问题" : "questions"}
                  </span>
                  {published?.usageCount ? (
                    <span>
                      <AppIcon name="tasks" />
                      {published.usageCount} {locale === "zh" ? "个任务使用" : "tasks using it"}
                    </span>
                  ) : null}
                  <span>
                    <AppIcon name="clock" />
                    v{display?.version ?? "—"}
                  </span>
                </div>
                <div className="form-card-actions">
                  {canEdit ? (
                    <button
                      className="button"
                      disabled={workingId === template.id}
                      onClick={() => void editForm(card)}
                      type="button"
                    >
                      {workingId === template.id
                        ? locale === "zh"
                          ? "正在准备…"
                          : "Preparing…"
                        : locale === "zh"
                          ? draft
                            ? "继续编辑"
                            : "编辑"
                          : draft
                            ? "Continue editing"
                            : "Edit"}
                    </button>
                  ) : null}
                  {display ? (
                    <FormPreviewPopover
                      description={description ?? null}
                      formId={template.id}
                      locale={locale}
                      name={name}
                      versionId={display.id}
                    />
                  ) : null}
                  <details className="action-menu">
                    <summary
                      aria-label={locale === "zh" ? "更多表单操作" : "More form actions"}
                      title={locale === "zh" ? "更多操作" : "More actions"}
                    >
                      <AppIcon name="more" />
                      <span className="sr-only">
                        {locale === "zh" ? "更多操作" : "More actions"}
                      </span>
                    </summary>
                    <div className="action-menu-panel">
                      {published && canEdit && canPublish ? (
                        <button
                          disabled={workingId === template.id}
                          onClick={() => void unpublishForm(card, name)}
                          type="button"
                        >
                          <AppIcon name="unpublish" />
                          <span>
                            <strong>{locale === "zh" ? "撤回发布" : "Unpublish"}</strong>
                            <small>
                              {locale === "zh" ? "返回草稿继续修改" : "Return to an editable draft"}
                            </small>
                          </span>
                        </button>
                      ) : null}
                      {canCreate ? (
                        <>
                          <button
                            disabled={workingId === template.id}
                            onClick={() => void duplicateForm(card, "form")}
                            type="button"
                          >
                            <AppIcon name="copy" />
                            <span>
                              <strong>{locale === "zh" ? "复制表单" : "Duplicate form"}</strong>
                              <small>{locale === "zh" ? "创建独立草稿副本" : "Create a separate draft copy"}</small>
                            </span>
                          </button>
                          <button
                            disabled={workingId === template.id}
                            onClick={() => void duplicateForm(card, "template")}
                            type="button"
                          >
                            <AppIcon name="template" />
                            <span>
                              <strong>{locale === "zh" ? "另存为模板" : "Save as template"}</strong>
                              <small>{locale === "zh" ? "创建可复用起点" : "Create a reusable starting point"}</small>
                            </span>
                          </button>
                        </>
                      ) : null}
                      {canArchive ? (
                        <button
                          className="danger"
                          disabled={workingId === template.id}
                          onClick={() => void removeForm(card, name)}
                          type="button"
                        >
                          <AppIcon name="trash" />
                          <span>
                            <strong>{locale === "zh" ? "删除表单" : "Delete form"}</strong>
                            <small>{locale === "zh" ? "历史数据仍会保留" : "Historical data remains available"}</small>
                          </span>
                        </button>
                      ) : null}
                    </div>
                  </details>
                </div>
                {published ? (
                  <p className="caption form-version-note">
                    {locale === "zh"
                      ? "编辑会创建新草稿；撤回发布后，现有任务仍保留原版本。"
                      : "Editing creates a draft; unpublishing keeps existing tasks pinned to their version."}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          action={
            canCreate ? (
              <button className="button" onClick={() => setShowTemplateLauncher(true)} type="button">
                {locale === "zh" ? "新建表单" : "New form"}
              </button>
            ) : undefined
          }
          icon="forms"
          title={locale === "zh" ? "没有匹配表单" : "No matching forms"}
          description={
            locale === "zh"
              ? "调整搜索或筛选条件，或从业务模板快速新建。"
              : "Change the search or filter, or start from a common workflow."
          }
        />
      )}
      {showTemplateLauncher ? (
        <TemplateLaunchModal
          choices={templateChoices}
          locale={locale}
          onChoose={chooseTemplate}
          onClose={() => setShowTemplateLauncher(false)}
          onDelete={deleteReusableTemplate}
          onStartBlank={() => router.push("/forms/new?blank=1")}
          onToggleQuick={toggleQuick}
          quickIds={quickIds}
          workingId={workingId}
        />
      ) : null}
    </div>
  );
}
