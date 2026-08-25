"use client";

import type { ProgramDraft } from "../types";
import { programKeyFrom } from "../model";

export function ProgramCreateForm({
  draft,
  locale,
  saving,
  onCancel,
  onChange,
  onSubmit,
}: {
  draft: ProgramDraft;
  locale: "zh" | "en";
  saving: boolean;
  onCancel: () => void;
  onChange: (next: ProgramDraft) => void;
  onSubmit: () => void;
}) {
  const disabled =
    saving ||
    !draft.nameEn.trim() ||
    !draft.nameZh.trim();
  const generatedKey = programKeyFrom(draft.nameEn);
  return (
    <section className="card stack">
      <h2>{locale === "zh" ? "新建项目" : "New program"}</h2>
      <div className="form-grid">
        <label>
          中文名称
          <input
            onChange={(event) =>
              onChange({ ...draft, nameZh: event.target.value })
            }
            value={draft.nameZh}
          />
        </label>
        <label>
          English name
          <input
            onChange={(event) =>
              onChange({ ...draft, nameEn: event.target.value })
            }
            value={draft.nameEn}
          />
        </label>
        <label>
          {locale === "zh" ? "中文说明（可选）" : "Chinese description"}
          <textarea
            onChange={(event) =>
              onChange({ ...draft, descriptionZh: event.target.value })
            }
            value={draft.descriptionZh}
          />
        </label>
        <label>
          {locale === "zh" ? "英文说明（可选）" : "English description"}
          <textarea
            onChange={(event) =>
              onChange({ ...draft, descriptionEn: event.target.value })
            }
            value={draft.descriptionEn}
          />
        </label>
        <details className="field-full form-fieldset">
          <summary>
            {locale === "zh" ? "高级设置：内部稳定标识" : "Advanced: internal stable key"}
          </summary>
          <div className="stack-sm" style={{ marginTop: 12 }}>
            <label>
              {locale === "zh" ? "内部稳定标识" : "Internal stable key"}
              <input
                onChange={(event) =>
                  onChange({ ...draft, key: event.target.value })
                }
                placeholder={generatedKey}
                value={draft.key}
              />
            </label>
            <p className="caption">
              {locale === "zh"
                ? `留空会根据英文名称自动生成“${generatedKey}”。创建后保持不变，即使以后修改项目名称，任务、审计和导出也不会断开。`
                : `Leave blank to generate “${generatedKey}” from the English name. It stays unchanged so tasks, audit history, and exports keep their references.`}
            </p>
          </div>
        </details>
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
              ? "正在创建…"
              : "Creating…"
            : locale === "zh"
              ? "创建项目"
              : "Create program"}
        </button>
      </div>
    </section>
  );
}
