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
import { fetchDatasets } from "@/features/datasets/api";
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
    const value = query.trim().toLocaleLowerCase();
    if (!value) return datasets;
    return datasets.filter((dataset) =>
      [dataset.name, dataset.description, dataset.dataClassification].some(
        (part) => part?.toLocaleLowerCase().includes(value),
      ),
    );
  }, [datasets, query]);
  const canCreate = permissions.includes("datasets.create");
  const totalRecords = datasets.reduce(
    (sum, dataset) => sum + (dataset.headVersion?.recordCount ?? 0),
    0,
  );

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
      {!loading && datasets.length ? (
        <div className="dataset-library-toolbar">
          <label className="search-control dataset-search">
            <AppIcon name="search" />
            <input
              aria-label={locale === "zh" ? "搜索数据集" : "Search datasets"}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={locale === "zh" ? "搜索数据集名称或说明" : "Search name or description"}
              type="search"
              value={query}
            />
          </label>
          <span className="caption">
            {locale === "zh"
              ? `${datasets.length} 个数据集 · ${totalRecords} 条记录`
              : `${datasets.length} datasets · ${totalRecords} records`}
          </span>
        </div>
      ) : null}

      {loading ? (
        <LoadingState rows={5} />
      ) : visible.length ? (
        <div className="dataset-card-grid">
          {visible.map((dataset) => (
            <article className="card dataset-library-card" key={dataset.id}>
              <div className="dataset-card-heading">
                <span className="dataset-card-icon"><AppIcon name="data" /></span>
                <StatusPill tone={dataset.status === "active" ? "green" : "neutral"}>
                  {dataset.status === "active"
                    ? locale === "zh" ? "可用" : "Active"
                    : dataset.status}
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
                <Link className="button button-secondary button-small" href={`/data/${dataset.id}`}>
                  <AppIcon name="sparkles" />
                  {dataset.status === "active"
                    ? locale === "zh" ? "打开并分析" : "Open and analyze"
                    : locale === "zh" ? "打开数据集" : "Open dataset"}
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          action={
            canCreate ? (
              <Link className="button" href="/records">
                {locale === "zh" ? "去记录中勾选" : "Select records"}
              </Link>
            ) : undefined
          }
          icon="data"
          title={
            query
              ? locale === "zh" ? "没有匹配的数据集" : "No matching datasets"
              : locale === "zh" ? "还没有数据集" : "No datasets yet"
          }
          description={
            locale === "zh"
              ? "在记录页筛选并勾选多条数据，即可组成数据集。"
              : "Filter and select multiple records, then group them into a dataset."
          }
        />
      )}
    </div>
  );
}
