"use client";

import { useEffect, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { errorMessage } from "@/lib/api-client";
import { createDataset } from "../api";
import {
  emptyDatasetFilterDraft,
  labelForOption,
  toDatasetFilters,
} from "../model";
import type {
  DatasetBuilderOptions,
  DatasetFieldKey,
  DatasetFilterDraft,
  DatasetSummary,
} from "../types";
import { DatasetFiltersPanel } from "./DatasetFiltersPanel";

const fieldOptions: Array<{
  key: DatasetFieldKey;
  en: string;
  zh: string;
}> = [
  { key: "structured_answers", en: "Structured answers", zh: "结构化答案" },
  { key: "approved_findings", en: "Approved findings", zh: "已批准发现" },
  { key: "evidence_excerpts", en: "Evidence excerpts", zh: "证据摘录" },
  { key: "collector_notes", en: "Collector notes", zh: "采集人备注" },
  {
    key: "form_version_information",
    en: "Form and version information",
    zh: "表单与版本信息",
  },
  { key: "audit_metadata", en: "Audit metadata", zh: "审计元数据" },
  { key: "media_attachments", en: "Media attachments", zh: "图片、音频、视频与文件" },
];

export function DatasetBuilder({
  initialFilters,
  initialMode,
  initialOrganizationId,
  initialRecordIds = [],
  locale,
  onCancel,
  onCreated,
  options,
}: {
  initialFilters?: DatasetFilterDraft;
  initialMode?: "filters" | "records";
  initialOrganizationId?: string;
  initialRecordIds?: string[];
  locale: "zh" | "en";
  onCancel?: () => void;
  onCreated: (dataset: DatasetSummary) => void | Promise<void>;
  options: DatasetBuilderOptions;
}) {
  const allowedClassifications = options.classifications.filter((option) =>
    ["approved_evidence", "restricted_pii"].includes(option.value),
  );
  const inferredOrganizationId =
    initialOrganizationId ??
    options.programs.find((program) =>
      initialFilters?.programIds.includes(program.value),
    )?.organizationId ??
    options.locations.find((location) =>
      initialFilters?.locationIds.includes(location.value),
    )?.organizationId ??
    options.forms.find((form) =>
      initialFilters?.formVersionIds.includes(form.value),
    )?.organizationId ??
    options.organizations[0]?.value ??
    "";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [organizationId, setOrganizationId] = useState(
    inferredOrganizationId,
  );
  const [classification, setClassification] = useState(
    allowedClassifications.find((option) => option.value === "approved_evidence")
      ?.value ?? allowedClassifications[0]?.value ?? "",
  );
  const [mode, setMode] = useState<"filters" | "records">(
    initialMode ?? (initialRecordIds.length ? "records" : "filters"),
  );
  const [filters, setFilters] = useState<DatasetFilterDraft>(
    initialFilters ?? emptyDatasetFilterDraft(),
  );
  const [fields, setFields] = useState<DatasetFieldKey[]>([
    "structured_answers",
    "approved_findings",
    "evidence_excerpts",
    "media_attachments",
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedProgramId =
    filters.programIds.length === 1 ? filters.programIds[0] : null;

  useEffect(() => {
    if (!onCancel) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onCancel]);

  async function submit() {
    if (
      !name.trim() ||
      !organizationId ||
      !classification ||
      (mode === "records" && !initialRecordIds.length)
    )
      return;
    setBusy(true);
    setError("");
    try {
      const result = await createDataset({
        organizationId,
        programId: selectedProgramId,
        name: name.trim(),
        description: description.trim() || null,
        dataClassification: classification,
        selection:
          mode === "records"
            ? { recordIds: initialRecordIds }
            : { filters: toDatasetFilters(filters) },
        fieldPolicy: { include: fields, exclude: [] },
      });
      await onCreated({
        ...result.dataset,
        headVersionId: result.version.id,
        headVersion: result.version,
      });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop dataset-builder-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && onCancel && !busy) onCancel();
      }}
      role="presentation"
    >
    <section
      aria-label={locale === "zh" ? "新建数据集" : "Create dataset"}
      aria-modal="true"
      className="modal-card stack dataset-builder"
      role="dialog"
    >
      <div className="row-between">
        <div>
          <div className="eyebrow">
            {locale === "zh" ? "已选记录成组" : "Group selected records"}
          </div>
          <h2>
            {locale === "zh" ? "新建数据集" : "Create a dataset"}
          </h2>
          <p className="muted">
            {locale === "zh"
              ? initialRecordIds.length
                ? `将已勾选的 ${initialRecordIds.length} 条记录组成一个数据集，用于 AI 分析和初步报告。`
                : "将筛选结果保存为可重复使用的数据集。"
              : initialRecordIds.length
                ? `Group ${initialRecordIds.length} selected records for AI analysis and initial reporting.`
                : "Save filtered results as a reusable dataset."}
          </p>
        </div>
        {onCancel ? (
          <button
            aria-label={locale === "zh" ? "关闭构建器" : "Close builder"}
            className="icon-button"
            onClick={onCancel}
            type="button"
          >
            <AppIcon name="close" />
          </button>
        ) : null}
      </div>
      {error ? (
        <div className="feedback feedback-error" role="alert">
          <strong>{locale === "zh" ? "无法创建数据集" : "Dataset could not be created"}</strong>
          <p>{error}</p>
        </div>
      ) : null}
      <div className="form-grid">
        <label>
          {locale === "zh" ? "数据集名称" : "Dataset name"}
          <input
            maxLength={500}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            placeholder={locale === "zh" ? "例如：9 月份养老院数据采集" : "e.g. September nursing home collection"}
            value={name}
          />
        </label>
        <label>
          {locale === "zh" ? "组织" : "Organization"}
          <select
            disabled={Boolean(initialOrganizationId)}
            onChange={(event) => {
              const nextOrganizationId = event.target.value;
              setOrganizationId(nextOrganizationId);
              setFilters((current) => ({
                ...current,
                programIds: current.programIds.filter((id) =>
                  options.programs.some(
                    (program) =>
                      program.value === id &&
                      program.organizationId === nextOrganizationId,
                  ),
                ),
                locationIds: current.locationIds.filter((id) =>
                  options.locations.some(
                    (location) =>
                      location.value === id &&
                      (!location.organizationId ||
                        location.organizationId === nextOrganizationId),
                  ),
                ),
                formVersionIds: current.formVersionIds.filter((id) =>
                  options.forms.some(
                    (form) =>
                      form.value === id &&
                      (!form.organizationId ||
                        form.organizationId === nextOrganizationId),
                  ),
                ),
              }));
            }}
            value={organizationId}
          >
            {options.organizations.map((organization) => (
              <option key={organization.value} value={organization.value}>
                {labelForOption(organization, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className="field-full">
          {locale === "zh" ? "说明（可选）" : "Description (optional)"}
          <textarea
            maxLength={10_000}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={
              locale === "zh"
                ? "说明这批记录的时间、地点或分析目的"
                : "Describe the period, locations, or analysis goal"
            }
            rows={3}
            value={description}
          />
        </label>
        <label className="dataset-classification-field">
          {locale === "zh" ? "数据分类" : "Data classification"}
          <select
            onChange={(event) => setClassification(event.target.value)}
            value={classification}
          >
            {allowedClassifications.map((item) => (
              <option key={item.value} value={item.value}>
                {labelForOption(item, locale)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {initialRecordIds.length ? (
        <div className="dataset-selection-summary">
          <span className="dataset-selection-icon"><AppIcon name="check" /></span>
          <span>
            <strong>
              {locale === "zh"
                ? `已选择 ${initialRecordIds.length} 条记录`
                : `${initialRecordIds.length} records selected`}
            </strong>
            <span className="caption">
              {locale === "zh"
                ? "创建后可在数据集中查看记录、询问 AI 并生成初步报告。"
                : "Open the dataset to review records, ask AI, and generate an initial report."}
            </span>
          </span>
        </div>
      ) : null}
      {classification === "restricted_pii" ? (
        <div className="feedback feedback-warning">
          <strong>{locale === "zh" ? "受限数据" : "Restricted data"}</strong>
          <p>
            {locale === "zh"
              ? "仅在拥有明确 PII 权限时才能创建和下载。"
              : "Creation and download require explicit restricted-PII permission."}
          </p>
        </div>
      ) : null}
      {!initialRecordIds.length ? <fieldset className="form-fieldset">
        <legend>{locale === "zh" ? "记录范围" : "Record scope"}</legend>
        <div className="dataset-scope-options">
          <label className="choice">
            <input
              checked={mode === "filters"}
              name="dataset-selection-mode"
              onChange={() => setMode("filters")}
              type="radio"
            />
            <span>
              <strong>
                {locale === "zh" ? "使用筛选条件" : "Use filter criteria"}
              </strong>
              <span className="caption">
                {locale === "zh"
                  ? "刷新 Dataset 时会重新运行这些筛选条件。"
                  : "Refresh reruns these filters into a new version."}
              </span>
            </span>
          </label>
        </div>
      </fieldset> : null}
      {mode === "filters" ? (
        <DatasetFiltersPanel
          locale={locale}
          onChange={setFilters}
          options={options}
          organizationId={organizationId}
          value={filters}
        />
      ) : null}
      <details className="advanced-panel dataset-field-policy">
        <summary>{locale === "zh" ? "高级设置：包含字段" : "Advanced: included fields"}</summary>
      <fieldset className="form-fieldset">
        <legend>{locale === "zh" ? "包含字段" : "Included fields"}</legend>
        <div className="grid-3">
          {fieldOptions.map((field) => (
            <label className="choice" key={field.key}>
              <input
                checked={fields.includes(field.key)}
                onChange={(event) =>
                  setFields((current) =>
                    event.target.checked
                      ? [...current, field.key]
                      : current.filter((value) => value !== field.key),
                  )
                }
                type="checkbox"
              />
              <span>{locale === "zh" ? field.zh : field.en}</span>
            </label>
          ))}
        </div>
        <p className="caption">
          {locale === "zh"
            ? "默认排除受限 PII；媒体附件会随记录版本冻结，下载时不能扩大字段范围。"
            : "Restricted PII is excluded by default; media is frozen with the record version and downloads cannot expand the field policy."}
        </p>
      </fieldset>
      </details>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        {onCancel ? (
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            {locale === "zh" ? "取消" : "Cancel"}
          </button>
        ) : null}
        <button
          className="button"
          disabled={
            busy ||
            !name.trim() ||
            !organizationId ||
            !classification ||
            !fields.length ||
            (mode === "records" && !initialRecordIds.length)
          }
          onClick={submit}
          type="button"
        >
          {busy
            ? locale === "zh"
              ? "正在冻结记录…"
              : "Freezing records…"
            : locale === "zh"
              ? "创建并打开数据集"
              : "Create and open dataset"}
        </button>
      </div>
    </section>
    </div>
  );
}
