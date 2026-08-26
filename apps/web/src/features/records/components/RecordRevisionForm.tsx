"use client";

import { useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import type { RecordFieldAnswer } from "@/features/records/types";

type RevisionAnswer = {
  templateFieldId: string;
  value: string | number | boolean | string[] | null;
  missingReasonKey?: string | null;
  customText?: string | null;
};

function initialValue(answer: RecordFieldAnswer): string | number | boolean {
  if (Array.isArray(answer.value)) return answer.value.map(String).join(", ");
  if (answer.value == null) return "";
  if (["string", "number", "boolean"].includes(typeof answer.value)) {
    return answer.value as string | number | boolean;
  }
  return JSON.stringify(answer.value);
}

function serializedValue(answer: RecordFieldAnswer, value: string | number | boolean) {
  if (answer.fieldTypeKey === "boolean") return Boolean(value);
  if (["number", "rating_scale"].includes(answer.fieldTypeKey)) return Number(value);
  if (answer.fieldTypeKey === "multi_select") {
    return String(value).split(",").map((item) => item.trim()).filter(Boolean);
  }
  return String(value);
}

export function RecordRevisionForm({
  answers,
  busy,
  locale,
  onCancel,
  onSave,
  qualitative,
}: {
  answers: RecordFieldAnswer[];
  busy: boolean;
  locale: "zh" | "en";
  onCancel: () => void;
  onSave: (input: { reason: string; qualitative: string; fieldAnswers: RevisionAnswer[] }) => Promise<void>;
  qualitative: string;
}) {
  const initial = useMemo(
    () => Object.fromEntries(answers.map((answer) => [answer.templateFieldId, initialValue(answer)])),
    [answers],
  );
  const [values, setValues] = useState<Record<string, string | number | boolean>>(initial);
  const [sourceNotes, setSourceNotes] = useState(qualitative);
  const [reason, setReason] = useState("");
  const sections = useMemo(() => {
    const grouped = new Map<string, RecordFieldAnswer[]>();
    for (const answer of answers) grouped.set(answer.sectionKey, [...(grouped.get(answer.sectionKey) ?? []), answer]);
    return [...grouped.values()];
  }, [answers]);

  return (
    <section className="card record-revision-card" aria-label={locale === "zh" ? "编辑记录修订" : "Edit record revision"}>
      <header className="record-revision-heading">
        <span className="card-section-icon"><AppIcon name="edit" /></span>
        <div>
          <span className="eyebrow">{locale === "zh" ? "可审计修订" : "Auditable revision"}</span>
          <h2>{locale === "zh" ? "编辑记录内容" : "Edit record content"}</h2>
          <p>{locale === "zh" ? "已批准版本保持不变；保存会创建一个新的草稿版本，重新提交后再进入审核。" : "The approved version remains unchanged. Saving creates a new draft that must be reviewed again."}</p>
        </div>
      </header>
      <div className="record-revision-sections">
        {sections.map((section) => (
          <fieldset key={section[0]?.sectionKey}>
            <legend>{locale === "zh" ? section[0]?.sectionLabelZh : section[0]?.sectionLabelEn}</legend>
            {section.map((answer) => {
              const label = locale === "zh" ? answer.labelZh : answer.labelEn;
              const value = values[answer.templateFieldId] ?? "";
              if (answer.fieldTypeKey === "boolean") {
                return (
                  <label className="record-revision-boolean" key={answer.id}>
                    <input checked={Boolean(value)} disabled={busy} onChange={(event) => setValues((current) => ({ ...current, [answer.templateFieldId]: event.target.checked }))} type="checkbox" />
                    <span>{label}</span>
                  </label>
                );
              }
              const multiline = ["long_text", "multi_select"].includes(answer.fieldTypeKey);
              return (
                <label key={answer.id}>
                  <span>{label}</span>
                  {multiline ? (
                    <textarea disabled={busy} onChange={(event) => setValues((current) => ({ ...current, [answer.templateFieldId]: event.target.value }))} rows={answer.fieldTypeKey === "long_text" ? 4 : 2} value={String(value)} />
                  ) : (
                    <input disabled={busy} onChange={(event) => setValues((current) => ({ ...current, [answer.templateFieldId]: event.target.value }))} type={["number", "rating_scale"].includes(answer.fieldTypeKey) ? "number" : "text"} value={String(value)} />
                  )}
                </label>
              );
            })}
          </fieldset>
        ))}
        <label>
          <span>{locale === "zh" ? "来源备注" : "Source notes"}</span>
          <textarea disabled={busy} onChange={(event) => setSourceNotes(event.target.value)} rows={5} value={sourceNotes} />
        </label>
        <label>
          <span>{locale === "zh" ? "修订原因（必填）" : "Reason for revision (required)"}</span>
          <textarea disabled={busy} onChange={(event) => setReason(event.target.value)} placeholder={locale === "zh" ? "说明修改了什么，以及为什么需要修改。" : "Explain what changed and why."} required rows={3} value={reason} />
        </label>
      </div>
      <footer className="record-revision-actions">
        <button className="button button-ghost" disabled={busy} onClick={onCancel} type="button">{locale === "zh" ? "取消" : "Cancel"}</button>
        <button
          className="button"
          disabled={busy || !reason.trim()}
          onClick={() => onSave({
            reason: reason.trim(),
            qualitative: sourceNotes,
            fieldAnswers: answers.map((answer) => ({
              templateFieldId: answer.templateFieldId,
              value: serializedValue(answer, values[answer.templateFieldId] ?? ""),
              missingReasonKey: answer.missingReasonKey,
              customText: answer.customText,
            })),
          })}
          type="button"
        >
          <AppIcon name="check" />{busy ? (locale === "zh" ? "保存中…" : "Saving…") : (locale === "zh" ? "保存为新修订" : "Save as new revision")}
        </button>
      </footer>
    </section>
  );
}
