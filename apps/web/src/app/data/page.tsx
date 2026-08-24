"use client";

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

type Dataset = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  dataClassification: string;
  updatedAt: string;
  headVersionId?: string | null;
  organizationId: string;
  programId?: string | null;
};
type Program = {
  id: string;
  organizationId: string;
  nameEn: string;
  nameZh: string;
  status: string;
};
type RegistryItem = { key: string; labelEn: string; labelZh: string };
const fieldOptions = [
  "structured_answers",
  "approved_findings",
  "evidence_excerpts",
  "collector_notes",
  "form_version_information",
  "audit_metadata",
] as const;

export default function DataPage() {
  const { locale } = useI18n();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [classifications, setClassifications] = useState<RegistryItem[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [showBuilder, setShowBuilder] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [programId, setProgramId] = useState("");
  const [classification, setClassification] = useState("");
  const [fields, setFields] = useState<string[]>([
    "structured_answers",
    "approved_findings",
    "evidence_excerpts",
  ]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const me = await apiFetch<{
        user: { organizationId?: string | null };
        permissions: string[];
      }>("/api/v1/auth/me");
      const [dataResult, programResult, classResult] = await Promise.all([
        apiFetch<{ datasets: Dataset[] }>("/api/v1/datasets"),
        apiFetch<{ programs: Program[] }>("/api/v1/programs").catch(() => ({
          programs: [],
        })),
        apiFetch<{ items: RegistryItem[] }>(
          "/api/v1/config/registries/data_classification?status=active",
        ).catch(() => ({ items: [] })),
      ]);
      setPermissions(me.permissions ?? []);
      setOrganizationId(me.user.organizationId ?? "");
      setDatasets(dataResult.datasets ?? []);
      setPrograms(
        (programResult.programs ?? []).filter(
          (program) => program.status === "active",
        ),
      );
      setClassifications(classResult.items ?? []);
      setClassification(
        (current) => current || classResult.items?.[0]?.key || "",
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
  const canCreate = permissions.includes("datasets.create");
  const label = useMemo(
    () =>
      new Map(
        classifications.map((item) => [
          item.key,
          locale === "zh" ? item.labelZh : item.labelEn,
        ]),
      ),
    [classifications, locale],
  );
  async function create() {
    if (!name.trim() || !organizationId || !classification) return;
    setBusy("create");
    setError("");
    try {
      await apiFetch("/api/v1/datasets", {
        method: "POST",
        body: JSON.stringify({
          organizationId,
          programId: programId || null,
          name: name.trim(),
          description: description.trim() || null,
          dataClassification: classification,
          selection: { filters: programId ? { programIds: [programId] } : {} },
          fieldPolicy: { include: fields, exclude: [] },
        }),
      });
      setName("");
      setDescription("");
      setShowBuilder(false);
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }
  async function refresh(dataset: Dataset) {
    setBusy(dataset.id);
    setError("");
    try {
      await apiFetch(`/api/v1/datasets/${dataset.id}/refresh`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }
  async function download(dataset: Dataset, format: "csv" | "json") {
    setBusy(dataset.id);
    setError("");
    try {
      const response = await fetch(`/api/v1/datasets/${dataset.id}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : (payload.error?.message ?? "Download failed"),
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${dataset.name}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="stack">
      <PageHeader
        title={locale === "zh" ? "记录与数据" : "Records & data"}
        description={
          locale === "zh"
            ? "构建可复现的数据集，并按受控字段策略下载。"
            : "Build reproducible datasets and download them under a controlled field policy."
        }
        actions={
          canCreate ? (
            <button
              className="button"
              onClick={() => setShowBuilder((value) => !value)}
              type="button"
            >
              <AppIcon name={showBuilder ? "close" : "plus"} />
              {showBuilder
                ? locale === "zh"
                  ? "关闭"
                  : "Close"
                : locale === "zh"
                  ? "构建数据集"
                  : "Build dataset"}
            </button>
          ) : undefined
        }
      />
      {error ? <ErrorState message={error} retry={load} /> : null}
      {showBuilder ? (
        <section className="card stack">
          <div>
            <div className="eyebrow">
              {locale === "zh" ? "数据集构建器" : "Dataset builder"}
            </div>
            <h2>
              {locale === "zh" ? "定义范围与字段" : "Define scope and fields"}
            </h2>
          </div>
          <div className="form-grid">
            <label>
              {locale === "zh" ? "名称" : "Name"}
              <input
                maxLength={500}
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </label>
            <label>
              {locale === "zh" ? "项目范围" : "Program scope"}
              <select
                onChange={(event) => {
                  setProgramId(event.target.value);
                  const program = programs.find(
                    (item) => item.id === event.target.value,
                  );
                  if (program) setOrganizationId(program.organizationId);
                }}
                value={programId}
              >
                <option value="">
                  {locale === "zh" ? "全部授权项目" : "All authorized programs"}
                </option>
                {programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {locale === "zh" ? program.nameZh : program.nameEn}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {locale === "zh" ? "数据分类" : "Data classification"}
              <select
                onChange={(event) => setClassification(event.target.value)}
                value={classification}
              >
                {classifications.map((item) => (
                  <option key={item.key} value={item.key}>
                    {locale === "zh" ? item.labelZh : item.labelEn}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-full">
              {locale === "zh" ? "说明（可选）" : "Description (optional)"}
              <textarea
                onChange={(event) => setDescription(event.target.value)}
                value={description}
              />
            </label>
          </div>
          <fieldset className="card card-soft" style={{ border: 0, margin: 0 }}>
            <legend style={{ padding: 0, fontWeight: 700 }}>
              {locale === "zh" ? "包含字段" : "Included fields"}
            </legend>
            <div className="grid-3">
              {fieldOptions.map((field) => (
                <label className="choice" key={field}>
                  <input
                    checked={fields.includes(field)}
                    onChange={(event) =>
                      setFields((current) =>
                        event.target.checked
                          ? [...current, field]
                          : current.filter((value) => value !== field),
                      )
                    }
                    type="checkbox"
                  />
                  <span>{field.replaceAll("_", " ")}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button
              className="button"
              disabled={
                busy === "create" ||
                !name.trim() ||
                !organizationId ||
                !classification
              }
              onClick={create}
              type="button"
            >
              {busy === "create"
                ? locale === "zh"
                  ? "正在构建…"
                  : "Building…"
                : locale === "zh"
                  ? "构建数据集"
                  : "Build dataset"}
            </button>
          </div>
        </section>
      ) : null}
      {loading ? (
        <LoadingState rows={5} />
      ) : datasets.length ? (
        <div className="table-shell">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{locale === "zh" ? "数据集" : "Dataset"}</th>
                  <th>{locale === "zh" ? "分类" : "Classification"}</th>
                  <th>{locale === "zh" ? "状态" : "Status"}</th>
                  <th>{locale === "zh" ? "更新" : "Updated"}</th>
                  <th>{locale === "zh" ? "操作" : "Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((dataset) => (
                  <tr key={dataset.id}>
                    <td>
                      <strong>{dataset.name}</strong>
                      <div className="caption">
                        {dataset.description || dataset.id.slice(0, 8)}
                      </div>
                    </td>
                    <td>
                      {label.get(dataset.dataClassification) ??
                        dataset.dataClassification}
                    </td>
                    <td>
                      <StatusPill
                        tone={dataset.status === "active" ? "green" : "neutral"}
                      >
                        {dataset.status}
                      </StatusPill>
                    </td>
                    <td>
                      {new Date(dataset.updatedAt).toLocaleDateString(
                        locale === "zh" ? "zh-CN" : "en-US",
                      )}
                    </td>
                    <td>
                      <div className="row">
                        <button
                          className="button button-secondary button-small"
                          disabled={busy === dataset.id}
                          onClick={() => download(dataset, "csv")}
                          type="button"
                        >
                          CSV
                        </button>
                        <button
                          className="button button-secondary button-small"
                          disabled={busy === dataset.id}
                          onClick={() => download(dataset, "json")}
                          type="button"
                        >
                          JSON
                        </button>
                        {permissions.includes("datasets.refresh") ? (
                          <button
                            className="button button-ghost button-small"
                            disabled={busy === dataset.id}
                            onClick={() => refresh(dataset)}
                            type="button"
                          >
                            {locale === "zh" ? "刷新" : "Refresh"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          icon="data"
          title={locale === "zh" ? "还没有数据集" : "No datasets yet"}
          description={
            locale === "zh"
              ? "从已批准证据构建可复现的数据快照。"
              : "Build a reproducible snapshot from approved evidence."
          }
        />
      )}
    </div>
  );
}
