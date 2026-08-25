"use client";

import { useEffect, useState } from "react";
import type { Program, ProgramDetailsDraft } from "../types";

export function ProgramEditForm({
  locale,
  onCancel,
  onSubmit,
  program,
  saving,
}: {
  locale: "zh" | "en";
  onCancel: () => void;
  onSubmit: (draft: ProgramDetailsDraft) => void;
  program: Program;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<ProgramDetailsDraft>(() =>
    detailsFrom(program),
  );

  useEffect(() => {
    setDraft(detailsFrom(program));
  }, [program]);

  return (
    <div className="stack form-fieldset">
      <div>
        <h3>{locale === "zh" ? "编辑项目信息" : "Edit program details"}</h3>
        <p className="caption">
          {locale === "zh"
            ? "名称和说明可以修改；内部稳定标识保持不变。"
            : "Names and descriptions can change; the internal stable key does not."}
        </p>
      </div>
      <div className="form-grid">
        <label>
          {locale === "zh" ? "中文名称" : "Chinese name"}
          <input
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                nameZh: event.target.value,
              }))
            }
            value={draft.nameZh}
          />
        </label>
        <label>
          {locale === "zh" ? "英文名称" : "English name"}
          <input
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                nameEn: event.target.value,
              }))
            }
            value={draft.nameEn}
          />
        </label>
        <label>
          {locale === "zh" ? "中文说明（可选）" : "Chinese description"}
          <textarea
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                descriptionZh: event.target.value,
              }))
            }
            value={draft.descriptionZh}
          />
        </label>
        <label>
          {locale === "zh" ? "英文说明（可选）" : "English description"}
          <textarea
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                descriptionEn: event.target.value,
              }))
            }
            value={draft.descriptionEn}
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
          disabled={saving || !draft.nameZh.trim() || !draft.nameEn.trim()}
          onClick={() => onSubmit(draft)}
          type="button"
        >
          {saving
            ? locale === "zh"
              ? "保存中…"
              : "Saving…"
            : locale === "zh"
              ? "保存修改"
              : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function detailsFrom(program: Program): ProgramDetailsDraft {
  return {
    nameEn: program.nameEn,
    nameZh: program.nameZh,
    descriptionEn: program.descriptionEn ?? "",
    descriptionZh: program.descriptionZh ?? "",
  };
}
