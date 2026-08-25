"use client";

import { useMemo, useRef, useState } from "react";
import type {
  DatasetBuilderOptions,
  DatasetFilterDraft,
  DatasetOption,
} from "../types";
import {
  activeDatasetFilterCount,
  labelForOption,
  optionsForOrganization,
} from "../model";

function FilterMultiSelect({
  label,
  locale,
  onChange,
  options,
  placeholder,
  values,
}: {
  label: string;
  locale: "zh" | "en";
  onChange: (values: string[]) => void;
  options: DatasetOption[];
  placeholder: string;
  values: string[];
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(values), [values]);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return options.filter((option) =>
      !normalized ||
      labelForOption(option, locale).toLocaleLowerCase().includes(normalized) ||
      option.description?.toLocaleLowerCase().includes(normalized),
    );
  }, [locale, options, query]);
  const summary = values.length
    ? locale === "zh"
      ? `已选择 ${values.length} 项`
      : `${values.length} selected`
    : placeholder;
  function toggle(value: string) {
    onChange(
      selected.has(value)
        ? values.filter((candidate) => candidate !== value)
        : [...values, value],
    );
  }
  return (
    <div className="field">
      <span>{label}</span>
      <details className="multi-select-dropdown" ref={detailsRef}>
        <summary>
          <span>{summary}</span>
          <span aria-hidden="true">⌄</span>
        </summary>
        <div className="multi-select-panel">
          <input
            aria-label={`${label} ${locale === "zh" ? "搜索" : "search"}`}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={locale === "zh" ? "搜索…" : "Search…"}
            value={query}
          />
          <div className="multi-select-options">
            {visible.length ? (
              visible.map((option) => (
                <label className="multi-select-option" key={option.value}>
                  <input
                    checked={selected.has(option.value)}
                    onChange={() => toggle(option.value)}
                    type="checkbox"
                  />
                  <span>
                    <strong>{labelForOption(option, locale)}</strong>
                    {option.description ? (
                      <span className="caption">{option.description}</span>
                    ) : null}
                  </span>
                </label>
              ))
            ) : (
              <p className="muted">
                {locale === "zh" ? "没有可用选项" : "No options available"}
              </p>
            )}
          </div>
          <div className="row-between">
            <button
              className="button button-ghost button-small"
              disabled={!values.length}
              onClick={() => onChange([])}
              type="button"
            >
              {locale === "zh" ? "清空" : "Clear"}
            </button>
            <button
              className="button button-secondary button-small"
              onClick={() => detailsRef.current?.removeAttribute("open")}
              type="button"
            >
              {locale === "zh" ? "完成" : "Done"}
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}

export function DatasetFiltersPanel({
  locale,
  onChange,
  options,
  organizationId,
  showHeader = true,
  value,
}: {
  locale: "zh" | "en";
  onChange: (value: DatasetFilterDraft) => void;
  options: DatasetBuilderOptions;
  organizationId: string;
  showHeader?: boolean;
  value: DatasetFilterDraft;
}) {
  const scopedPrograms = optionsForOrganization(options.programs, organizationId);
  const scopedLocations = optionsForOrganization(options.locations, organizationId);
  const scopedForms = optionsForOrganization(options.forms, organizationId);
  const advancedCount =
    value.serviceTypeKeys.length +
    value.populationKeys.length +
    value.sourceOrigins.length +
    value.findingTypes.length +
    value.themeOrConcernIds.length;
  const set = <Key extends keyof DatasetFilterDraft>(
    key: Key,
    nextValue: DatasetFilterDraft[Key],
  ) => onChange({ ...value, [key]: nextValue });
  return (
    <div className="stack-sm dataset-filters">
      {showHeader ? (
        <div className="row-between">
          <div>
            <strong>{locale === "zh" ? "筛选条件" : "Filter criteria"}</strong>
            <div className="caption">
              {locale === "zh"
                ? `已设置 ${activeDatasetFilterCount(value)} 个条件`
                : `${activeDatasetFilterCount(value)} criteria set`}
            </div>
          </div>
          <button
            className="button button-ghost button-small"
            disabled={!activeDatasetFilterCount(value)}
            onClick={() =>
              onChange({
                dateFrom: "",
                dateTo: "",
                programIds: [],
                locationIds: [],
                serviceTypeKeys: [],
                populationKeys: [],
                sourceOrigins: [],
                formVersionIds: [],
                collectorIds: [],
                reviewStatuses: [],
                researchUseStatuses: [],
                findingTypes: [],
                themeOrConcernIds: [],
              })
            }
            type="button"
          >
            {locale === "zh" ? "清除筛选" : "Clear filters"}
          </button>
        </div>
      ) : null}
      <div className="dataset-filter-grid">
        <FilterMultiSelect
          label={locale === "zh" ? "项目" : "Programs"}
          locale={locale}
          onChange={(values) => set("programIds", values)}
          options={scopedPrograms}
          placeholder={locale === "zh" ? "全部项目" : "All programs"}
          values={value.programIds}
        />
        <FilterMultiSelect
          label={locale === "zh" ? "表单版本" : "Form versions"}
          locale={locale}
          onChange={(values) => set("formVersionIds", values)}
          options={scopedForms}
          placeholder={locale === "zh" ? "全部表单" : "All forms"}
          values={value.formVersionIds}
        />
        <FilterMultiSelect
          label={locale === "zh" ? "地点" : "Locations"}
          locale={locale}
          onChange={(values) => set("locationIds", values)}
          options={scopedLocations}
          placeholder={locale === "zh" ? "全部地点" : "All locations"}
          values={value.locationIds}
        />
        <FilterMultiSelect
          label={locale === "zh" ? "采集人" : "Collectors"}
          locale={locale}
          onChange={(values) => set("collectorIds", values)}
          options={options.collectors}
          placeholder={locale === "zh" ? "全部采集人" : "All collectors"}
          values={value.collectorIds}
        />
        <label>
          {locale === "zh" ? "记录日期从" : "Record date from"}
          <input
            max={value.dateTo || undefined}
            onChange={(event) => set("dateFrom", event.target.value)}
            type="date"
            value={value.dateFrom}
          />
        </label>
        <label>
          {locale === "zh" ? "记录日期到" : "Record date to"}
          <input
            min={value.dateFrom || undefined}
            onChange={(event) => set("dateTo", event.target.value)}
            type="date"
            value={value.dateTo}
          />
        </label>
        <FilterMultiSelect
          label={locale === "zh" ? "审核状态" : "Review status"}
          locale={locale}
          onChange={(values) => set("reviewStatuses", values)}
          options={options.reviewStatuses}
          placeholder={locale === "zh" ? "全部状态" : "All statuses"}
          values={value.reviewStatuses}
        />
        <FilterMultiSelect
          label={locale === "zh" ? "研究使用" : "Research use"}
          locale={locale}
          onChange={(values) => set("researchUseStatuses", values)}
          options={options.researchUseStatuses}
          placeholder={locale === "zh" ? "全部状态" : "All statuses"}
          values={value.researchUseStatuses}
        />
      </div>
      <details className="dataset-advanced-filters">
        <summary>
          {locale === "zh" ? "更多筛选" : "More filters"}
          {advancedCount ? ` (${advancedCount})` : ""}
        </summary>
        <div className="dataset-filter-grid">
          <FilterMultiSelect
            label={locale === "zh" ? "服务 / 来源" : "Service / source"}
            locale={locale}
            onChange={(values) => set("serviceTypeKeys", values)}
            options={options.services}
            placeholder={locale === "zh" ? "全部来源" : "All sources"}
            values={value.serviceTypeKeys}
          />
          <FilterMultiSelect
            label={locale === "zh" ? "人群" : "Population"}
            locale={locale}
            onChange={(values) => set("populationKeys", values)}
            options={options.populations}
            placeholder={locale === "zh" ? "全部人群" : "All populations"}
            values={value.populationKeys}
          />
          <FilterMultiSelect
            label={locale === "zh" ? "发现类型" : "Finding type"}
            locale={locale}
            onChange={(values) => set("findingTypes", values)}
            options={options.findingTypes}
            placeholder={locale === "zh" ? "全部类型" : "All finding types"}
            values={value.findingTypes}
          />
          <FilterMultiSelect
            label={locale === "zh" ? "主题 / 关注点" : "Theme / concern"}
            locale={locale}
            onChange={(values) => set("themeOrConcernIds", values)}
            options={options.themes}
            placeholder={locale === "zh" ? "全部主题" : "All themes"}
            values={value.themeOrConcernIds}
          />
          <FilterMultiSelect
            label={locale === "zh" ? "来源属性" : "Source origin"}
            locale={locale}
            onChange={(values) => set("sourceOrigins", values)}
            options={options.sourceOrigins}
            placeholder={locale === "zh" ? "全部属性" : "All origins"}
            values={value.sourceOrigins}
          />
        </div>
      </details>
    </div>
  );
}
