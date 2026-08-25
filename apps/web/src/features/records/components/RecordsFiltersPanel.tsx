"use client";

import { useState, type ReactNode } from "react";
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
  const [expanded, setExpanded] = useState(false);
  return (
    <section className={`card records-filter-card ${expanded ? "expanded" : "collapsed"}`}>
      <button
        aria-expanded={expanded}
        className="records-filter-toggle"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <span className="records-filter-toggle-icon"><AppIcon name="filter" /></span>
        <span className="records-filter-toggle-copy">
          <strong>{locale === "zh" ? "筛选" : "Filters"}</strong>
          <span aria-live="polite">
            {loading
              ? locale === "zh" ? "正在更新…" : "Updating…"
              : locale === "zh" ? `${matchedCount} 条记录` : `${matchedCount} records`}
          </span>
        </span>
        {activeCount ? (
          <span className="records-filter-count">
            {locale === "zh" ? `${activeCount} 个条件` : `${activeCount} active`}
          </span>
        ) : null}
        <span className="records-filter-toggle-action">
          {expanded
            ? locale === "zh" ? "收起" : "Collapse"
            : locale === "zh" ? "展开" : "Expand"}
          <span aria-hidden="true">⌄</span>
        </span>
      </button>
      {expanded ? (
        <div className="records-filter-content stack">
          <div className="row-between mobile-stack">
            <div>
              <h2>{locale === "zh" ? "筛选记录" : "Filter records"}</h2>
              <div className="caption">
                {locale === "zh"
                  ? "只设置当前任务需要的条件。"
                  : "Set only the criteria needed for this task."}
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
        </div>
      ) : null}
    </section>
  );
}
