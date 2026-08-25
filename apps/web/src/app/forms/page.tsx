"use client";

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

  const visible = useMemo(
    () =>
      forms.filter(({ template, versions }) => {
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
    [forms, query, statusFilter],
  );

  const summary = useMemo(
    () => ({
      published: forms.filter(({ template }) => template.currentPublishedVersionId).length,
      drafts: forms.filter(({ versions }) =>
        versions.some((version) => version.status === "draft"),
      ).length,
    }),
    [forms],
  );

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

  async function removeForm(card: FormCard, name: string) {
    const confirmed = window.confirm(
      locale === "zh"
        ? `从表单列表删除“${name}”？已发布版本、历史任务和记录会继续保留。`
        : `Remove “${name}” from the form list? Published versions, historical tasks, and records will remain available.`,
    );
    if (!confirmed) return;
    setWorkingId(card.template.id);
    setError("");
    try {
      await apiFetch(`/api/v1/templates/${card.template.id}`, { method: "DELETE" });
      setForms((current) =>
        current.filter((item) => item.template.id !== card.template.id),
      );
    } catch (caught) {
      setError(errorMessage(caught));
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
            <Link className="button" href="/forms/new">
              <AppIcon name="plus" />
              {locale === "zh" ? "新建表单" : "New form"}
            </Link>
          ) : undefined
        }
      />
      {!loading ? (
        <div className="form-summary-strip">
          <div><strong>{forms.length}</strong><span>{locale === "zh" ? "全部表单" : "All forms"}</span></div>
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
              <Link className="button" href="/forms/new">
                {locale === "zh" ? "新建表单" : "New form"}
              </Link>
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
    </div>
  );
}
