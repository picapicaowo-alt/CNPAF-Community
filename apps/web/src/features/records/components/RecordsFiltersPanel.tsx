"use client";

import type { ReactNode } from "react";
import { AppIcon } from "@/components/AppIcon";
import { DatasetFiltersPanel } from "@/features/datasets/components/DatasetFiltersPanel";
import { activeDatasetFilterCount } from "@/features/datasets/model";
import type {
  DatasetBuilderOptions,
  DatasetFilterDraft,
} from "@/features/datasets/types";

export function RecordsFiltersPanel({
  actions,
  filters,
  loading,
  locale,
  matchedCount,
  onFiltersChange,
  onQueryChange,
  onReset,
  options,
  query,
}: {
  actions?: ReactNode;
  filters: DatasetFilterDraft;
  loading: boolean;
  locale: "zh" | "en";
  matchedCount: number;
  onFiltersChange: (value: DatasetFilterDraft) => void;
  onQueryChange: (value: string) => void;
  onReset: () => void;
  options: DatasetBuilderOptions | null;
  query: string;
}) {
  const activeCount = activeDatasetFilterCount(filters) + Number(Boolean(query));
  return (
    <section className="card stack records-filter-card">
      <div className="row-between mobile-stack">
        <div>
          <h2>{locale === "zh" ? "筛选记录" : "Filter records"}</h2>
          <div className="caption" aria-live="polite">
            {loading
              ? locale === "zh"
                ? "正在更新筛选结果…"
                : "Updating filtered results…"
              : locale === "zh"
                ? `显示 ${matchedCount} 条记录`
                : `Showing ${matchedCount} records`}
          </div>
        </div>
        <button
          className="button button-secondary button-small"
          disabled={!activeCount}
          onClick={onReset}
          type="button"
        >
          {locale === "zh" ? "重置筛选" : "Reset filters"}
        </button>
      </div>
      <label className="field record-search-field">
        {locale === "zh" ? "搜索" : "Search"}
        <span className="search-control">
          <AppIcon name="search" />
          <input
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={
              locale === "zh"
                ? "记录、地点、项目、表单或采集人"
                : "Record, location, program, form, or collector"
            }
            type="search"
            value={query}
          />
        </span>
      </label>
      {options ? (
        <DatasetFiltersPanel
          locale={locale}
          onChange={onFiltersChange}
          options={options}
          organizationId={
            options.organizations.length === 1
              ? (options.organizations[0]?.value ?? "")
              : ""
          }
          showHeader={false}
          value={filters}
        />
      ) : null}
      {actions ? <div className="records-filter-actions">{actions}</div> : null}
    </section>
  );
}
