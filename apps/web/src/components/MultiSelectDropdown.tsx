"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type MultiSelectOption = {
  value: string;
  label: string;
  description?: string;
};

export function MultiSelectDropdown({
  disabled = false,
  locale,
  onChange,
  options,
  placeholder,
  values,
  visibleValues,
}: {
  disabled?: boolean;
  locale: "zh" | "en";
  onChange: (values: string[]) => void;
  options: MultiSelectOption[];
  placeholder: string;
  values: string[];
  visibleValues?: string[];
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(values), [values]);
  const visibleValueSet = useMemo(
    () => (visibleValues ? new Set(visibleValues) : null),
    [visibleValues],
  );
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return options.filter(
      (option) =>
        (!visibleValueSet || visibleValueSet.has(option.value)) &&
        (!normalized ||
          option.label.toLocaleLowerCase().includes(normalized) ||
          option.description?.toLocaleLowerCase().includes(normalized)),
    );
  }, [options, query, visibleValueSet]);
  const selectedLabels = options
    .filter((option) => selected.has(option.value))
    .map((option) => option.label);
  const visibleSelectedCount = visible.reduce(
    (count, option) => count + Number(selected.has(option.value)),
    0,
  );
  const allVisibleSelected =
    visible.length > 0 && visibleSelectedCount === visible.length;
  const someVisibleSelected =
    visibleSelectedCount > 0 && !allVisibleSelected;
  const hasActiveFilter = Boolean(visibleValues) || Boolean(query.trim());
  const summary =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length === 1
        ? selectedLabels[0]
        : locale === "zh"
          ? `已选择 ${selectedLabels.length} 人`
          : `${selectedLabels.length} selected`;

  useEffect(() => {
    if (selectAllRef.current)
      selectAllRef.current.indeterminate = someVisibleSelected;
  }, [someVisibleSelected]);

  function toggle(value: string) {
    onChange(
      selected.has(value)
        ? values.filter((candidate) => candidate !== value)
        : [...values, value],
    );
  }

  function toggleVisible() {
    const visibleIds = new Set(visible.map((option) => option.value));
    onChange(
      allVisibleSelected
        ? values.filter((value) => !visibleIds.has(value))
        : [...new Set([...values, ...visibleIds])],
    );
  }

  return (
    <details className="multi-select-dropdown" ref={detailsRef}>
      <summary
        aria-disabled={disabled}
        className={disabled ? "disabled" : ""}
        onClick={(event) => {
          if (disabled) event.preventDefault();
        }}
      >
        <span>{summary}</span>
        <span aria-hidden="true">⌄</span>
      </summary>
      {!disabled ? (
        <div className="multi-select-panel">
          <input
            aria-label={locale === "zh" ? "搜索人员" : "Search people"}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={locale === "zh" ? "搜索…" : "Search…"}
            value={query}
          />
          <label className="multi-select-option multi-select-master-option">
            <input
              aria-label={
                allVisibleSelected
                  ? locale === "zh"
                    ? "全不选"
                    : "Deselect all"
                  : locale === "zh"
                    ? "全选"
                    : "Select all"
              }
              checked={allVisibleSelected}
              disabled={!visible.length}
              onChange={toggleVisible}
              ref={selectAllRef}
              type="checkbox"
            />
            <span>
              <strong>
                {allVisibleSelected
                  ? locale === "zh"
                    ? hasActiveFilter
                      ? "全不选当前筛选"
                      : "全不选"
                    : hasActiveFilter
                      ? "Deselect filtered"
                      : "Deselect all"
                  : locale === "zh"
                    ? hasActiveFilter
                      ? "全选当前筛选"
                      : "全选"
                    : hasActiveFilter
                      ? "Select filtered"
                      : "Select all"}
              </strong>
              <span className="caption">
                {locale === "zh"
                  ? `当前已选 ${visibleSelectedCount} / ${visible.length}`
                  : `${visibleSelectedCount} of ${visible.length} selected`}
              </span>
            </span>
          </label>
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
                    <strong>{option.label}</strong>
                    {option.description ? (
                      <span className="caption">{option.description}</span>
                    ) : null}
                  </span>
                </label>
              ))
            ) : (
              <p className="muted">
                {locale === "zh" ? "没有可选人员" : "No people available"}
              </p>
            )}
          </div>
          <button
            className="button button-secondary button-small button-wide"
            onClick={() => detailsRef.current?.removeAttribute("open")}
            type="button"
          >
            {locale === "zh" ? "完成选择" : "Done"}
          </button>
        </div>
      ) : null}
    </details>
  );
}
