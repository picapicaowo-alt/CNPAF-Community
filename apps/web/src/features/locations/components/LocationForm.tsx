"use client";

import { AppIcon } from "@/components/AppIcon";
import { StatusPill } from "@/components/ui";
import type { LocationAlias, LocationDraft, LocationType } from "../types";

export function LocationForm({
  aliases,
  draft,
  editing,
  locale,
  saving,
  types,
  onCancel,
  onChange,
  onSubmit,
}: {
  aliases?: LocationAlias[];
  draft: LocationDraft;
  editing: boolean;
  locale: "zh" | "en";
  saving: boolean;
  types: LocationType[];
  onCancel: () => void;
  onChange: (next: LocationDraft) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="stack">
      <div className="modal-heading row-between">
        <div>
          <div className="eyebrow">
            {editing
              ? locale === "zh"
                ? "地点管理"
                : "Location management"
              : locale === "zh"
                ? "标准地点"
                : "Canonical location"}
          </div>
          <h2 id="location-dialog-title">
            {editing
              ? locale === "zh"
                ? "编辑地点"
                : "Edit location"
              : locale === "zh"
                ? "新建地点"
                : "New location"}
          </h2>
          <p className="muted">
            {locale === "zh"
              ? "填写工作人员日常使用的地址信息；无需经纬度。"
              : "Enter the address staff use day to day; coordinates are not required."}
          </p>
        </div>
        <button
          aria-label={locale === "zh" ? "关闭" : "Close"}
          className="icon-button"
          disabled={saving}
          onClick={onCancel}
          type="button"
        >
          <AppIcon name="close" />
        </button>
      </div>

      <div className="form-grid">
        <label>
          {locale === "zh" ? "地点名称" : "Location name"}
          <input
            autoFocus
            onChange={(event) =>
              onChange({ ...draft, name: event.target.value })
            }
            value={draft.name}
          />
        </label>
        <label>
          {locale === "zh" ? "地点类型" : "Location type"}
          <select
            onChange={(event) =>
              onChange({ ...draft, siteType: event.target.value })
            }
            value={draft.siteType}
          >
            {types.map((type) => (
              <option key={type.key} value={type.key}>
                {locale === "zh" ? type.labelZh : type.labelEn}
              </option>
            ))}
          </select>
        </label>
        <label className="field-full">
          {locale === "zh" ? "街道地址（可选）" : "Address (optional)"}
          <input
            onChange={(event) =>
              onChange({ ...draft, address: event.target.value })
            }
            placeholder={locale === "zh" ? "门牌号和街道" : "Street address"}
            value={draft.address}
          />
        </label>
        <label>
          {locale === "zh" ? "城市" : "City"}
          <input
            onChange={(event) =>
              onChange({ ...draft, city: event.target.value })
            }
            value={draft.city}
          />
        </label>
        <label>
          {locale === "zh" ? "州 / 省" : "State / province"}
          <input
            onChange={(event) =>
              onChange({ ...draft, state: event.target.value })
            }
            value={draft.state}
          />
        </label>
        <label>
          {locale === "zh" ? "国家 / 地区" : "Country / region"}
          <input
            onChange={(event) =>
              onChange({ ...draft, country: event.target.value })
            }
            value={draft.country}
          />
        </label>
        <label>
          {editing
            ? locale === "zh"
              ? "新增别名（可选）"
              : "Add an alias (optional)"
            : locale === "zh"
              ? "首个别名（可选）"
              : "First alias (optional)"}
          <input
            onChange={(event) =>
              onChange({ ...draft, alias: event.target.value })
            }
            placeholder={
              locale === "zh" ? "常用简称或旧名称" : "Common or former name"
            }
            value={draft.alias}
          />
        </label>
      </div>

      {editing ? (
        <div className="stack-sm">
          <div className="label-text">
            {locale === "zh" ? "已有别名" : "Existing aliases"}
          </div>
          <div className="row location-alias-list">
            {aliases?.length ? (
              aliases.map((alias) => (
                <StatusPill key={alias.id}>{alias.displayAlias}</StatusPill>
              ))
            ) : (
              <span className="caption">
                {locale === "zh" ? "暂无别名" : "No aliases yet"}
              </span>
            )}
          </div>
        </div>
      ) : null}

      <div className="modal-actions">
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
          disabled={saving || !draft.name.trim() || !draft.siteType}
          onClick={onSubmit}
          type="button"
        >
          {saving
            ? locale === "zh"
              ? "正在保存…"
              : "Saving…"
            : locale === "zh"
              ? "保存地点"
              : "Save location"}
        </button>
      </div>
    </div>
  );
}
