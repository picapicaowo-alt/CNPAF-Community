"use client";

import Link from "next/link";
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
import {
  deleteDataset,
  fetchDatasets,
  restoreDataset,
} from "@/features/datasets/api";
import type { DatasetSummary } from "@/features/datasets/types";
import { apiFetch, errorMessage } from "@/lib/api-client";

function classificationLabel(value: string, locale: "zh" | "en") {
  if (value === "approved_evidence")
    return locale === "zh" ? "已批准证据" : "Approved evidence";
  if (value === "restricted_pii")
    return locale === "zh" ? "受限数据" : "Restricted data";
  return value;
}

export default function DataPage() {
  const { locale } = useI18n();
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"active" | "archived">("active");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [me, datasetRows] = await Promise.all([
        apiFetch<{ permissions: string[] }>("/api/v1/auth/me"),
        fetchDatasets(),
      ]);
      setPermissions(me.permissions ?? []);
      setDatasets(datasetRows);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const categorized = datasets.filter((dataset) => dataset.status === view);
    const value = query.trim().toLocaleLowerCase();
    if (!value) return categorized;
    return categorized.filter((dataset) =>
      [dataset.name, dataset.description, dataset.dataClassification].some(
        (part) => part?.toLocaleLowerCase().includes(value),
      ),
    );
  }, [datasets, query, view]);
  const canCreate = permissions.includes("datasets.create");
  const canManageArchive = permissions.includes("datasets.archive");
  const activeCount = datasets.filter((dataset) => dataset.status === "active").length;
  const archivedCount = datasets.filter((dataset) => dataset.status === "archived").length;
  const totalRecords = visible.reduce(
    (sum, dataset) => sum + (dataset.headVersion?.recordCount ?? 0),
    0,
  );

  async function restore(dataset: DatasetSummary) {
    setBusy(`restore:${dataset.id}`);
    setError("");
    setNotice("");
    try {
      const result = await restoreDataset(dataset.id);
      setDatasets((current) =>
        current.map((item) => item.id === dataset.id
          ? { ...item, ...result.dataset, headVersion: item.headVersion }
          : item),
      );
      setNotice(locale === "zh" ? `“${dataset.name}”已恢复为正常数据集。` : `“${dataset.name}” was restored.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  async function remove(dataset: DatasetSummary) {
    const confirmed = confirm(
      locale === "zh"
        ? `永久删除“${dataset.name}”？此操作无法撤销；若数据集已被报告或导出引用，系统会阻止删除。`
        : `Permanently delete “${dataset.name}”? This cannot be undone. Deletion is blocked if a report or export still references it.`,
    );
    if (!confirmed) return;
    setBusy(`delete:${dataset.id}`);
    setError("");
    setNotice("");
    try {
      await deleteDataset(dataset.id);
      setDatasets((current) => current.filter((item) => item.id !== dataset.id));
      setNotice(locale === "zh" ? `“${dataset.name}”已永久删除。` : `“${dataset.name}” was permanently deleted.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="stack data-page dataset-library-page">
      <PageHeader
        eyebrow={locale === "zh" ? "分析工作区" : "Analysis workspace"}
        title={locale === "zh" ? "数据集" : "Datasets"}
        description={
          locale === "zh"
            ? "数据集是从现有记录中勾选成组的一批数据，可以打开与 AI 互动并生成初步报告。"
            : "A dataset is a group of existing records that can be opened for AI analysis and initial reporting."
        }
        actions={
          canCreate ? (
            <Link className="button" href="/records">
              <AppIcon name="plus" />
              {locale === "zh" ? "从记录中创建" : "Create from records"}
            </Link>
          ) : undefined
        }
      />

      <div
        aria-label={locale === "zh" ? "数据集流程" : "Dataset workflow"}
        className="dataset-flow-strip"
      >
        <div><span>1</span><strong>{locale === "zh" ? "筛选记录" : "Filter records"}</strong></div>
        <AppIcon name="arrow" />
        <div><span>2</span><strong>{locale === "zh" ? "勾选并成组" : "Select and group"}</strong></div>
        <AppIcon name="arrow" />
        <div><span>3</span><strong>{locale === "zh" ? "AI 分析与报告" : "AI analysis and report"}</strong></div>
      </div>

      {error ? <ErrorState message={error} retry={load} /> : null}
      {notice ? <p className="dataset-action-notice" role="status">{notice}</p> : null}
      {!loading ? (
        <div className="dataset-library-controls">
          <div aria-label={locale === "zh" ? "数据集分类" : "Dataset categories"} className="dataset-library-tabs" role="tablist">
            <button
              aria-controls="dataset-library-panel"
              aria-selected={view === "active"}
              onClick={() => setView("active")}
              role="tab"
              type="button"
            >
              {locale === "zh" ? "正常" : "Active"}
              <span>{activeCount}</span>
            </button>
            <button
              aria-controls="dataset-library-panel"
              aria-selected={view === "archived"}
              onClick={() => setView("archived")}
              role="tab"
              type="button"
            >
              {locale === "zh" ? "已归档" : "Archived"}
              <span>{archivedCount}</span>
            </button>
          </div>
          <div className="dataset-library-toolbar">
            <label className="search-control dataset-search">
              <AppIcon name="search" />
              <input
                aria-label={locale === "zh" ? "搜索数据集" : "Search datasets"}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={locale === "zh" ? "搜索数据集名称或说明…" : "Search name or description…"}
                type="search"
                value={query}
              />
            </label>
            <span className="caption">
              {locale === "zh"
                ? `${visible.length} 个数据集 · ${totalRecords} 条记录`
                : `${visible.length} datasets · ${totalRecords} records`}
            </span>
          </div>
        </div>
      ) : null}

      <div id="dataset-library-panel" role="tabpanel">
        {loading ? (
          <LoadingState rows={5} />
        ) : visible.length ? (
          <div className="dataset-card-grid">
          {visible.map((dataset) => (
            <article className={`card dataset-library-card ${dataset.status === "archived" ? "archived" : ""}`} key={dataset.id}>
              <div className="dataset-card-heading">
                <span className="dataset-card-icon"><AppIcon name="data" /></span>
                <StatusPill tone={dataset.status === "active" ? "green" : "neutral"}>
                  {dataset.status === "active"
                    ? locale === "zh" ? "可用" : "Active"
                    : locale === "zh" ? "已归档" : "Archived"}
                </StatusPill>
              </div>
              <div className="dataset-card-copy">
                <Link href={`/data/${dataset.id}`}><h2>{dataset.name}</h2></Link>
                <p className="muted">
                  {dataset.description ||
                    (locale === "zh" ? "由现有记录组成的数据集" : "A dataset grouped from existing records")}
                </p>
              </div>
              <div className="dataset-card-metrics">
                <span><strong>{dataset.headVersion?.recordCount ?? 0}</strong>{locale === "zh" ? "条记录" : "records"}</span>
                <span><strong>v{dataset.headVersion?.versionNumber ?? 1}</strong>{locale === "zh" ? "当前版本" : "current version"}</span>
                <span><strong>{new Date(dataset.updatedAt).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" })}</strong>{locale === "zh" ? "最近更新" : "updated"}</span>
              </div>
              <div className="dataset-card-footer">
                <span className="caption">{classificationLabel(dataset.dataClassification, locale)}</span>
                <div className="dataset-card-actions">
                  <Link className="button button-secondary button-small" href={`/data/${dataset.id}`}>
                    <AppIcon name={dataset.status === "active" ? "sparkles" : "data"} />
                    {dataset.status === "active"
                      ? locale === "zh" ? "打开并分析" : "Open and analyze"
                      : locale === "zh" ? "查看" : "View"}
                  </Link>
                  {dataset.status === "archived" && canManageArchive ? (
                    <>
                      <button
                        className="button button-secondary button-small"
                        disabled={Boolean(busy)}
                        onClick={() => void restore(dataset)}
                        type="button"
                      >
                        {busy === `restore:${dataset.id}`
                          ? locale === "zh" ? "恢复中…" : "Restoring…"
                          : locale === "zh" ? "恢复" : "Restore"}
                      </button>
                      <button
                        className="button button-danger button-small"
                        disabled={Boolean(busy)}
                        onClick={() => void remove(dataset)}
                        type="button"
                      >
                        {busy === `delete:${dataset.id}`
                          ? locale === "zh" ? "删除中…" : "Deleting…"
                          : locale === "zh" ? "删除" : "Delete"}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
          </div>
        ) : (
          <EmptyState
            action={
              canCreate && view === "active" ? (
                <Link className="button" href="/records">
                  {locale === "zh" ? "去记录中勾选" : "Select records"}
                </Link>
              ) : undefined
            }
          icon="data"
          title={
            query
              ? locale === "zh" ? "没有匹配的数据集" : "No matching datasets"
              : view === "archived"
                ? locale === "zh" ? "没有已归档的数据集" : "No archived datasets"
                : locale === "zh" ? "还没有数据集" : "No datasets yet"
          }
          description={
            view === "archived"
              ? locale === "zh"
                ? "归档的数据集会显示在这里，可恢复或永久删除。"
                : "Archived datasets appear here and can be restored or permanently deleted."
              : locale === "zh"
                ? "在记录页筛选并勾选多条数据，即可组成数据集。"
                : "Filter and select multiple records, then group them into a dataset."
          }
          />
        )}
      </div>
    </div>
  );
}
