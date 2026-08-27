"use client";

import { useEffect, useState } from "react";
import { ErrorState, StatusPill } from "@/components/ui";
import { errorMessage } from "@/lib/api-client";
import { compareFormVersions } from "./api";
import {
  releaseNotesFromVersion,
  type FormVersionComparison,
  type FormVersionDetails,
  type FormVersionSummary,
  type ReleaseNotes,
} from "./types";

type Props = {
  busy: boolean;
  currentVersion: FormVersionSummary;
  editable: boolean;
  locale: "zh" | "en";
  onSaveDetails: (
    details: FormVersionDetails,
    notes: ReleaseNotes,
  ) => Promise<void>;
  templateId: string;
  versions: FormVersionSummary[];
};

export function FormVersionPanel({
  busy,
  currentVersion,
  editable,
  locale,
  onSaveDetails,
  templateId,
  versions,
}: Props) {
  const [notes, setNotes] = useState(() =>
    releaseNotesFromVersion(currentVersion),
  );
  const [details, setDetails] = useState<FormVersionDetails>(() => ({
    nameEn: currentVersion.nameEn,
    nameZh: currentVersion.nameZh,
    descriptionEn: currentVersion.descriptionEn ?? "",
    descriptionZh: currentVersion.descriptionZh ?? "",
  }));
  const [fromVersionId, setFromVersionId] = useState("");
  const [toVersionId, setToVersionId] = useState(currentVersion.id);
  const [comparison, setComparison] = useState<FormVersionComparison | null>(
    null,
  );
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setNotes(releaseNotesFromVersion(currentVersion));
    setDetails({
      nameEn: currentVersion.nameEn,
      nameZh: currentVersion.nameZh,
      descriptionEn: currentVersion.descriptionEn ?? "",
      descriptionZh: currentVersion.descriptionZh ?? "",
    });
    setToVersionId(currentVersion.id);
    setFromVersionId(
      versions.find((version) => version.version < currentVersion.version)?.id ??
        versions.find((version) => version.id !== currentVersion.id)?.id ??
        "",
    );
    setComparison(null);
  }, [currentVersion, versions]);

  async function compare() {
    if (!fromVersionId || !toVersionId || fromVersionId === toVersionId) return;
    setComparing(true);
    setError("");
    try {
      const result = await compareFormVersions(
        templateId,
        fromVersionId,
        toVersionId,
      );
      setComparison(result.comparison);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setComparing(false);
    }
  }

  return (
    <details className="card stack-sm">
      <summary className="row-between">
        <span>
          <strong>{locale === "zh" ? "模板信息与版本" : "Template details & versions"}</strong>
          <span className="caption" style={{ display: "block" }}>
            {locale === "zh"
              ? `v${currentVersion.version} · ${currentVersion.sectionCount ?? 0} 个 Section · ${currentVersion.fieldCount ?? 0} 道题 · ${currentVersion.usageCount ?? 0} 个任务使用`
              : `v${currentVersion.version} · ${currentVersion.sectionCount ?? 0} sections · ${currentVersion.fieldCount ?? 0} fields · ${currentVersion.usageCount ?? 0} tasks`}
          </span>
        </span>
        <StatusPill tone={currentVersion.status === "published" ? "green" : "amber"}>
          {versionStatus(currentVersion.status, locale)}
        </StatusPill>
      </summary>
      <div className="form-grid form-fieldset">
        <label>
          {locale === "zh" ? "中文名称" : "Chinese name"}
          <input
            disabled={!editable || busy}
            maxLength={240}
            onChange={(event) =>
              setDetails((current) => ({
                ...current,
                nameZh: event.target.value,
              }))
            }
            value={details.nameZh}
          />
        </label>
        <label>
          {locale === "zh" ? "英文名称" : "English name"}
          <input
            disabled={!editable || busy}
            maxLength={240}
            onChange={(event) =>
              setDetails((current) => ({
                ...current,
                nameEn: event.target.value,
              }))
            }
            value={details.nameEn}
          />
        </label>
        <label>
          {locale === "zh" ? "中文说明" : "Chinese description"}
          <textarea
            disabled={!editable || busy}
            maxLength={4000}
            onChange={(event) =>
              setDetails((current) => ({
                ...current,
                descriptionZh: event.target.value,
              }))
            }
            value={details.descriptionZh}
          />
        </label>
        <label>
          {locale === "zh" ? "英文说明" : "English description"}
          <textarea
            disabled={!editable || busy}
            maxLength={4000}
            onChange={(event) =>
              setDetails((current) => ({
                ...current,
                descriptionEn: event.target.value,
              }))
            }
            value={details.descriptionEn}
          />
        </label>
        <label>
          中文发布说明
          <textarea
            disabled={!editable || busy}
            maxLength={4000}
            onChange={(event) =>
              setNotes((current) => ({ ...current, zh: event.target.value }))
            }
            value={notes.zh}
          />
        </label>
        <label>
          English release notes
          <textarea
            disabled={!editable || busy}
            maxLength={4000}
            onChange={(event) =>
              setNotes((current) => ({ ...current, en: event.target.value }))
            }
            value={notes.en}
          />
        </label>
        {editable ? (
          <div className="field-full row" style={{ justifyContent: "flex-end" }}>
            <button
              className="button button-secondary button-small"
              disabled={busy || !details.nameEn.trim() || !details.nameZh.trim()}
              onClick={() => void onSaveDetails(details, notes)}
              type="button"
            >
              {locale === "zh" ? "保存模板信息" : "Save template details"}
            </button>
          </div>
        ) : null}
      </div>
      {versions.length > 1 ? (
        <div className="stack-sm form-fieldset">
          <div className="row-between mobile-stack">
            <h3>{locale === "zh" ? "比较版本" : "Compare versions"}</h3>
            <button
              className="button button-secondary button-small"
              disabled={
                comparing ||
                !fromVersionId ||
                !toVersionId ||
                fromVersionId === toVersionId
              }
              onClick={() => void compare()}
              type="button"
            >
              {comparing
                ? locale === "zh"
                  ? "比较中…"
                  : "Comparing…"
                : locale === "zh"
                  ? "查看差异"
                  : "View changes"}
            </button>
          </div>
          <div className="form-grid">
            <VersionSelect
              label={locale === "zh" ? "从版本" : "From"}
              locale={locale}
              onChange={setFromVersionId}
              value={fromVersionId}
              versions={versions}
            />
            <VersionSelect
              label={locale === "zh" ? "到版本" : "To"}
              locale={locale}
              onChange={setToVersionId}
              value={toVersionId}
              versions={versions}
            />
          </div>
          {error ? <ErrorState message={error} /> : null}
          {comparison ? (
            <ComparisonResult comparison={comparison} locale={locale} />
          ) : null}
        </div>
      ) : (
        <p className="muted">
          {locale === "zh"
            ? "创建第二个版本后可在这里比较结构差异。"
            : "Create another version to compare structural changes."}
        </p>
      )}
    </details>
  );
}

function VersionSelect({
  label,
  locale,
  onChange,
  value,
  versions,
}: {
  label: string;
  locale: "zh" | "en";
  onChange: (value: string) => void;
  value: string;
  versions: FormVersionSummary[];
}) {
  return (
    <label>
      {label}
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        {versions.map((version) => (
          <option key={version.id} value={version.id}>
            v{version.version} · {versionStatus(version.status, locale)} ·{" "}
            {version.usageCount ?? 0} {locale === "zh" ? "个任务" : "task(s)"}
          </option>
        ))}
      </select>
    </label>
  );
}

function ComparisonResult({
  comparison,
  locale,
}: {
  comparison: FormVersionComparison;
  locale: "zh" | "en";
}) {
  const labels = {
    added: locale === "zh" ? "新增" : "Added",
    removed: locale === "zh" ? "删除" : "Removed",
    modified: locale === "zh" ? "修改" : "Modified",
    moved: locale === "zh" ? "移动" : "Moved",
  };
  return (
    <div className="stack-sm">
      <div className="row">
        {(Object.keys(labels) as Array<keyof typeof labels>).map((key) => (
          <StatusPill key={key} tone={key === "removed" ? "red" : key === "added" ? "green" : "blue"}>
            {labels[key]} {comparison.summary[key]}
          </StatusPill>
        ))}
      </div>
      {comparison.changes.length ? (
        <div className="list-panel">
          {comparison.changes.map((change, index) => (
            <div
              className="version-change-row"
              key={`${change.entityType}-${change.key}-${change.changeType}-${index}`}
            >
              <StatusPill tone={change.changeType === "removed" ? "red" : change.changeType === "added" ? "green" : "blue"}>
                {labels[change.changeType]}
              </StatusPill>
              <div>
                <div className="list-row-title">
                  {locale === "zh" ? change.labelZh : change.labelEn}
                </div>
                <div className="caption">
                  {entityLabel(change.entityType, locale)} · {change.key}
                  {change.parentKey ? ` · ${change.parentKey}` : ""}
                </div>
              </div>
              <div className="muted">
                {change.details.length
                  ? change.details
                      .map((detail) => detailLabel(detail, locale))
                      .join(" · ")
                  : "—"}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">
          {locale === "zh" ? "两个版本结构相同。" : "The versions are structurally identical."}
        </p>
      )}
    </div>
  );
}

function versionStatus(status: string, locale: "zh" | "en") {
  if (status === "published") return locale === "zh" ? "已发布" : "Published";
  if (status === "draft") return locale === "zh" ? "草稿" : "Draft";
  if (status === "archived") return locale === "zh" ? "已归档" : "Archived";
  return status;
}

function entityLabel(entity: string, locale: "zh" | "en") {
  const labels: Record<string, { zh: string; en: string }> = {
    version: { zh: "版本", en: "Version" },
    section: { zh: "Section", en: "Section" },
    field: { zh: "题目", en: "Field" },
    option: { zh: "选项", en: "Option" },
  };
  return labels[entity]?.[locale] ?? entity;
}

function detailLabel(detail: string, locale: "zh" | "en") {
  if (locale === "en") return detail;
  const labels: Record<string, string> = {
    allowCustomEntry: "允许其他答案",
    allowMissingReason: "允许未记录原因",
    branchingLogic: "跳转逻辑",
    configuration: "配置",
    descriptionEn: "英文说明",
    descriptionZh: "中文说明",
    fieldTypeKey: "题型",
    helpTextEn: "英文帮助文字",
    helpTextZh: "中文帮助文字",
    labelEn: "英文标签",
    labelZh: "中文标签",
    nameEn: "英文名称",
    nameZh: "中文名称",
    parentKey: "所属位置",
    placeholderEn: "英文占位文字",
    placeholderZh: "中文占位文字",
    required: "必填",
    sortOrder: "顺序",
    status: "状态",
    validation: "校验规则",
    visibilityConditions: "显示条件",
  };
  return labels[detail] ?? detail;
}
