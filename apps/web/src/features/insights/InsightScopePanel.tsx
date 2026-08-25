"use client";

import { AppIcon } from "@/components/AppIcon";
import {
  INSIGHT_LOCATIONS,
  INSIGHT_SOURCES,
  insightLocationLabel,
  insightSourceLabel,
  type InsightLocationKey,
  type InsightSourceKey,
} from "./demo-data";

export type InsightScope = {
  dateFrom: string;
  dateTo: string;
  sources: InsightSourceKey[];
  locations: InsightLocationKey[];
};

type Props = {
  locale: "zh" | "en";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: InsightScope;
  applied: InsightScope;
  onDraftChange: (scope: InsightScope) => void;
  onApply: () => void;
  onReset: () => void;
  sampleSize: number;
};

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function sameScope(a: InsightScope, b: InsightScope) {
  return (
    a.dateFrom === b.dateFrom &&
    a.dateTo === b.dateTo &&
    [...a.sources].sort().join() === [...b.sources].sort().join() &&
    [...a.locations].sort().join() === [...b.locations].sort().join()
  );
}

export function InsightScopePanel({
  locale,
  open,
  onOpenChange,
  draft,
  applied,
  onDraftChange,
  onApply,
  onReset,
  sampleSize,
}: Props) {
  const hasChanges = !sameScope(draft, applied);
  const invalid = !draft.sources.length || !draft.locations.length || draft.dateFrom > draft.dateTo;
  const summary = locale === "zh"
    ? `${applied.dateFrom.slice(5).replace("-", "/")}–${applied.dateTo.slice(5).replace("-", "/")} · ${applied.sources.length} 来源 · ${applied.locations.length} 地点`
    : `${applied.dateFrom}–${applied.dateTo} · ${applied.sources.length} sources · ${applied.locations.length} locations`;

  function setPreset(days: number) {
    const end = new Date(`${draft.dateTo}T12:00:00Z`);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days + 1);
    onDraftChange({ ...draft, dateFrom: start.toISOString().slice(0, 10) });
  }

  return (
    <section className={`insight-scope-shell ${open ? "expanded" : ""}`}>
      <button
        aria-controls="insight-scope-controls"
        aria-expanded={open}
        className="insight-scope-toggle"
        onClick={() => onOpenChange(!open)}
        type="button"
      >
        <span className="insight-scope-toggle-icon"><AppIcon name="filter" /></span>
        <span className="insight-scope-toggle-copy">
          <strong>{locale === "zh" ? "分析范围" : "Analysis scope"}</strong>
          <small>{summary}</small>
        </span>
        <span className="insight-scope-sample">
          {locale === "zh" ? `${sampleSize} 条模拟记录` : `${sampleSize} simulated records`}
        </span>
        <span className="insight-scope-chevron" aria-hidden="true">⌄</span>
      </button>

      {open ? (
        <div className="insight-scope-popover" id="insight-scope-controls">
          <div className="insight-scope-note">
            <span><AppIcon name="info" /></span>
            <p>
              <strong>{locale === "zh" ? "演示分析数据" : "Simulated analysis data"}</strong>
              {locale === "zh"
                ? "用于验证图表和交互，不会作为 AI 证据或研究结论。"
                : "Used to validate charts and interactions; never treated as AI evidence or research findings."}
            </p>
          </div>

          <fieldset className="insight-scope-fieldset">
            <legend>{locale === "zh" ? "日期范围" : "Date range"}</legend>
            <div className="insight-date-presets">
              {[30, 60, 90].map((days) => (
                <button key={days} onClick={() => setPreset(days)} type="button">
                  {locale === "zh" ? `近 ${days} 天` : `Last ${days} days`}
                </button>
              ))}
            </div>
            <div className="insight-date-inputs">
              <label>
                <span>{locale === "zh" ? "开始日期" : "Start date"}</span>
                <input
                  max={draft.dateTo}
                  onChange={(event) => onDraftChange({ ...draft, dateFrom: event.target.value })}
                  type="date"
                  value={draft.dateFrom}
                />
              </label>
              <span aria-hidden="true">→</span>
              <label>
                <span>{locale === "zh" ? "结束日期" : "End date"}</span>
                <input
                  min={draft.dateFrom}
                  onChange={(event) => onDraftChange({ ...draft, dateTo: event.target.value })}
                  type="date"
                  value={draft.dateTo}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="insight-scope-fieldset">
            <legend>{locale === "zh" ? "数据来源" : "Data sources"}</legend>
            <div className="insight-option-grid compact">
              {INSIGHT_SOURCES.map((source) => (
                <label className={draft.sources.includes(source.key) ? "selected" : ""} key={source.key}>
                  <input
                    checked={draft.sources.includes(source.key)}
                    onChange={() => onDraftChange({ ...draft, sources: toggleValue(draft.sources, source.key) })}
                    type="checkbox"
                  />
                  <span><AppIcon name="check" /></span>
                  <strong>{insightSourceLabel(source.key, locale)}</strong>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="insight-scope-fieldset">
            <legend>{locale === "zh" ? "地点" : "Locations"}</legend>
            <div className="insight-option-grid">
              {INSIGHT_LOCATIONS.map((location) => (
                <label className={draft.locations.includes(location.key) ? "selected" : ""} key={location.key}>
                  <input
                    checked={draft.locations.includes(location.key)}
                    onChange={() => onDraftChange({ ...draft, locations: toggleValue(draft.locations, location.key) })}
                    type="checkbox"
                  />
                  <span><AppIcon name="check" /></span>
                  <strong>{insightLocationLabel(location.key, locale)}</strong>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="insight-scope-actions">
            {invalid ? (
              <p role="alert">{locale === "zh" ? "请至少选择一个来源和一个地点，并检查日期顺序。" : "Select at least one source and location, and check the date order."}</p>
            ) : (
              <p>{hasChanges ? (locale === "zh" ? "有尚未应用的更改" : "Changes are ready to apply") : (locale === "zh" ? "当前图表已使用此范围" : "Charts already use this scope")}</p>
            )}
            <button className="button button-ghost button-small" onClick={onReset} type="button">
              {locale === "zh" ? "重置" : "Reset"}
            </button>
            <button className="button button-small" disabled={invalid || !hasChanges} onClick={onApply} type="button">
              {locale === "zh" ? "应用到图表" : "Apply to charts"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
