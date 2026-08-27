"use client";

import type { RegistryItemDraft } from "../types";

export function ConfigurationItemForm({
  draft,
  editing,
  locale,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: RegistryItemDraft;
  editing: boolean;
  locale: "zh" | "en";
  saving: boolean;
  onChange: (next: RegistryItemDraft) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const disabled =
    saving || !draft.key || !draft.labelEn.trim() || !draft.labelZh.trim();
  return (
    <section className="card stack">
      <h2>
        {editing
          ? locale === "zh"
            ? "编辑配置项"
            : "Edit configuration item"
          : locale === "zh"
            ? "新建配置项"
            : "New configuration item"}
      </h2>
      <div className="form-grid">
        <label>
          {locale === "zh" ? "稳定 Key" : "Stable key"}
          <input
            disabled={editing}
            onChange={(event) =>
              onChange({ ...draft, key: event.target.value })
            }
            placeholder="community_center"
            value={draft.key}
          />
        </label>
        <label>
          {locale === "zh" ? "排序" : "Sort order"}
          <input
            onChange={(event) =>
              onChange({ ...draft, sortOrder: Number(event.target.value) })
            }
            type="number"
            value={draft.sortOrder}
          />
        </label>
        <label>
          {locale === "zh" ? "中文名称" : "Chinese name"}
          <input
            onChange={(event) =>
              onChange({ ...draft, labelZh: event.target.value })
            }
            value={draft.labelZh}
          />
        </label>
        <label>
          {locale === "zh" ? "英文名称" : "English name"}
          <input
            onChange={(event) =>
              onChange({ ...draft, labelEn: event.target.value })
            }
            value={draft.labelEn}
          />
        </label>
        <label>
          {locale === "zh" ? "中文说明（可选）" : "Chinese help (optional)"}
          <textarea
            onChange={(event) =>
              onChange({ ...draft, helpTextZh: event.target.value })
            }
            value={draft.helpTextZh}
          />
        </label>
        <label>
          {locale === "zh" ? "英文说明（可选）" : "English help (optional)"}
          <textarea
            onChange={(event) =>
              onChange({ ...draft, helpTextEn: event.target.value })
            }
            value={draft.helpTextEn}
          />
        </label>
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button
          className="button button-secondary"
          disabled={saving}
          onClick={onCancel}
          type="button"
        >
          {locale === "zh" ? "取消" : "Cancel"}
        </button>
        <button
          className="button"
          disabled={disabled}
          onClick={onSubmit}
          type="button"
        >
          {saving
            ? locale === "zh"
              ? "正在保存…"
              : "Saving…"
            : locale === "zh"
              ? "保存"
              : "Save"}
        </button>
      </div>
    </section>
  );
}
