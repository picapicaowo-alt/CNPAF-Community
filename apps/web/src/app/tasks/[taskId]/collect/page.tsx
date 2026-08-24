"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import { ErrorState, LoadingState, StatusPill } from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";
import {
  flushOutbox,
  listLocalDrafts,
  newId,
  queueOutbox,
  saveLocalDraft,
} from "@/lib/offline";
import type { TaskAssignment, TaskSummary } from "@/lib/task-ui";

type TemplateVersion = {
  id: string;
  nameEn: string;
  nameZh: string;
  descriptionEn?: string | null;
  descriptionZh?: string | null;
  configuration: Record<string, unknown>;
};
type TemplateSection = {
  id: string;
  key: string;
  labelEn: string;
  labelZh: string;
  helpTextEn?: string | null;
  helpTextZh?: string | null;
  sortOrder: number;
};
type TemplateField = {
  id: string;
  templateSectionId: string;
  key: string;
  fieldTypeKey: string;
  labelEn: string;
  labelZh: string;
  helpTextEn?: string | null;
  helpTextZh?: string | null;
  placeholderEn?: string | null;
  placeholderZh?: string | null;
  required: boolean;
  allowCustomEntry: boolean;
  sortOrder: number;
  validation: Record<string, unknown>;
};
type TemplateOption = {
  id: string;
  templateFieldId: string;
  key: string;
  labelEn: string;
  labelZh: string;
  helpTextEn?: string | null;
  helpTextZh?: string | null;
  status: string;
  sortOrder: number;
};
type RegistryItem = {
  registryKey: string;
  itemKey: string;
  labelEn: string;
  labelZh: string;
  metadata?: Record<string, unknown>;
};
type TaskPackage = {
  task: Omit<TaskSummary, "myAssignment">;
  assignment: TaskAssignment;
  form: {
    version: TemplateVersion;
    sections: TemplateSection[];
    fields: TemplateField[];
    options: TemplateOption[];
  };
  configuration: RegistryItem[];
  packageVersion: string;
};
type RecordResult = { record: { id: string } };
type Answer = string | number | boolean | string[];
type ControlKind =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "single"
  | "multi"
  | "boolean";

function hasValue(value: Answer | undefined) {
  return Array.isArray(value)
    ? value.length > 0
    : value !== undefined && value !== "";
}

function configuredControl(metadata?: Record<string, unknown>): ControlKind {
  const control = metadata?.control;
  return [
    "text",
    "textarea",
    "number",
    "date",
    "single",
    "multi",
    "boolean",
  ].includes(String(control))
    ? (control as ControlKind)
    : "text";
}

export default function GuidedCollectionPage() {
  const { locale } = useI18n();
  const params = useParams<{ taskId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const preview = searchParams.get("preview") === "1";
  const [taskPackage, setTaskPackage] = useState<TaskPackage | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [sourceKind, setSourceKind] = useState("");
  const [clientRecordId, setClientRecordId] = useState(() => newId());
  const [occurredAt] = useState(() => new Date().toISOString());
  const [attested, setAttested] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [online, setOnline] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedLabel, setSavedLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const versionRef = useRef(1);
  const hydratedRef = useRef(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const result = await apiFetch<TaskPackage>(
        `/api/v1/tasks/${params.taskId}/package`,
      );
      setTaskPackage(result);
      const configuredSource =
        typeof result.task.configuration?.sourceKindKey === "string"
          ? result.task.configuration.sourceKindKey
          : typeof result.form.version.configuration?.sourceKindKey === "string"
            ? result.form.version.configuration.sourceKindKey
            : "";
      const availableSources = result.configuration.filter(
        (item) => item.registryKey === "source_kind",
      );
      setSourceKind(configuredSource || availableSources[0]?.itemKey || "");
      if (!preview) {
        const local = (await listLocalDrafts()).find(
          (draft) =>
            draft.payload.taskId === params.taskId &&
            draft.syncStatus !== "synced",
        );
        if (local) {
          setClientRecordId(local.clientRecordId);
          versionRef.current = local.localVersion;
          const storedAnswers = local.payload.answers;
          if (storedAnswers && typeof storedAnswers === "object")
            setAnswers(storedAnswers as Record<string, Answer>);
          if (typeof local.payload.sourceKind === "string")
            setSourceKind(local.payload.sourceKind);
          if (local.payload.attested === true) setAttested(true);
        }
      }
      hydratedRef.current = true;
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [params.taskId, preview]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => {
      setOnline(true);
      void flushOutbox();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (preview || !taskPackage || !hydratedRef.current) return;
    setSavedLabel(locale === "zh" ? "正在保存…" : "Saving…");
    const timer = window.setTimeout(async () => {
      const nextVersion = versionRef.current + 1;
      versionRef.current = nextVersion;
      await saveLocalDraft({
        clientRecordId,
        localVersion: nextVersion,
        sourceKind,
        payload: {
          taskId: params.taskId,
          sourceKind,
          answers,
          attested,
          packageVersion: taskPackage.packageVersion,
        },
        updatedAt: new Date().toISOString(),
        syncStatus: online ? "pending" : "local_only",
      });
      setSavedLabel(
        online
          ? locale === "zh"
            ? "草稿已保存在本机"
            : "Draft saved on this device"
          : locale === "zh"
            ? "离线保存"
            : "Saved offline",
      );
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    answers,
    attested,
    clientRecordId,
    locale,
    online,
    params.taskId,
    preview,
    sourceKind,
    taskPackage,
  ]);

  const sections = taskPackage?.form.sections ?? [];
  const reviewStep = sections.length;
  const totalSteps = Math.max(1, sections.length + 1);
  const currentSection = sections[step];
  const fields = useMemo(
    () =>
      currentSection
        ? (taskPackage?.form.fields ?? [])
            .filter((field) => field.templateSectionId === currentSection.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
        : [],
    [currentSection, taskPackage],
  );
  const sourceKinds = (taskPackage?.configuration ?? []).filter(
    (item) => item.registryKey === "source_kind",
  );
  const fieldControlByKey = useMemo(
    () =>
      new Map(
        (taskPackage?.configuration ?? [])
          .filter((item) => item.registryKey === "collection_field_type")
          .map((item) => [item.itemKey, configuredControl(item.metadata)]),
      ),
    [taskPackage],
  );

  function label(en: string, zh: string) {
    return locale === "zh" ? zh : en;
  }
  function optionsFor(fieldId: string) {
    return (taskPackage?.form.options ?? [])
      .filter(
        (option) =>
          option.templateFieldId === fieldId && option.status === "active",
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
  function update(fieldId: string, value: Answer) {
    setAnswers((current) => ({ ...current, [fieldId]: value }));
  }

  function validateCurrentStep() {
    setError("");
    if (!sourceKind) {
      setError(
        locale === "zh" ? "请选择记录来源。" : "Select a record source.",
      );
      return false;
    }
    const missing = fields.find(
      (field) => field.required && !hasValue(answers[field.id]),
    );
    if (missing) {
      setError(
        `${label(missing.labelEn, missing.labelZh)} ${locale === "zh" ? "为必填项。" : "is required."}`,
      );
      return false;
    }
    return true;
  }

  function recordBody(submit: boolean, localVersion: number) {
    if (!taskPackage) throw new Error("Task package is unavailable");
    const selections: Array<{
      templateFieldId: string;
      optionId: string;
      value: Record<string, unknown>;
    }> = [];
    const quantitative: Record<
      string,
      { reason: string; value: number | null }
    > = {};
    const qualitativeLines: string[] = [];
    for (const field of taskPackage.form.fields) {
      const answer = answers[field.id];
      if (!hasValue(answer)) continue;
      const kind = fieldControlByKey.get(field.fieldTypeKey) ?? "text";
      if (kind === "multi") {
        for (const optionId of Array.isArray(answer) ? answer : [])
          selections.push({ templateFieldId: field.id, optionId, value: {} });
      } else if (kind === "single" && typeof answer === "string") {
        selections.push({
          templateFieldId: field.id,
          optionId: answer,
          value: {},
        });
      } else if (kind === "number") {
        quantitative[field.key] = {
          reason: "recorded",
          value: typeof answer === "number" ? answer : Number(answer),
        };
      } else {
        qualitativeLines.push(
          `${label(field.labelEn, field.labelZh)}: ${String(answer)}`,
        );
      }
    }
    return {
      clientRecordId,
      idempotencyKey: `${clientRecordId}-${submit ? "submit" : "draft"}-${localVersion}`,
      localVersion,
      sourceKind,
      siteId: taskPackage.task.siteId ?? null,
      programId: taskPackage.task.programId,
      taskId: taskPackage.task.id,
      taskAssignmentId: taskPackage.assignment.id,
      templateVersionId: taskPackage.form.version.id,
      structuredSelections: selections,
      customEntries: [],
      qualitative: qualitativeLines.join("\n"),
      quantitative,
      attribution: {},
      contentLanguage: locale,
      occurredAt,
      ...(submit ? { piiAttestation: attested } : {}),
    };
  }

  async function persistDraft() {
    if (preview || !online || !taskPackage) return null;
    setSaving(true);
    try {
      const nextVersion = versionRef.current + 1;
      versionRef.current = nextVersion;
      return await apiFetch<RecordResult>("/api/v1/records", {
        method: "POST",
        body: JSON.stringify(recordBody(false, nextVersion)),
      });
    } finally {
      setSaving(false);
    }
  }

  async function next() {
    if (!validateCurrentStep()) return;
    try {
      await persistDraft();
      setStep((current) => Math.min(reviewStep, current + 1));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function submit() {
    if (!taskPackage || !attested) {
      setError(
        locale === "zh"
          ? "请先确认隐私提示。"
          : "Confirm the privacy reminder before submitting.",
      );
      return;
    }
    setSubmitting(true);
    setError("");
    const nextVersion = versionRef.current + 1;
    const body = recordBody(true, nextVersion);
    try {
      if (!online) {
        if (files.length)
          throw new Error(
            locale === "zh"
              ? "附件需要联网后再提交；文字内容仍已安全保存在本机。"
              : "Attachments require a connection. Your form answers remain saved on this device.",
          );
        await queueOutbox({
          id: body.idempotencyKey,
          method: "PUT",
          url: "/api/v1/records",
          body,
        });
        await saveLocalDraft({
          clientRecordId,
          localVersion: nextVersion,
          sourceKind,
          payload: {
            taskId: params.taskId,
            sourceKind,
            answers,
            attested,
            packageVersion: taskPackage.packageVersion,
          },
          updatedAt: new Date().toISOString(),
          syncStatus: "pending",
        });
        router.replace("/records");
        return;
      }

      let draftRecord: RecordResult | null = null;
      if (files.length) {
        const draftVersion = nextVersion;
        draftRecord = await apiFetch<RecordResult>("/api/v1/records", {
          method: "POST",
          body: JSON.stringify(recordBody(false, draftVersion)),
        });
        for (const file of files) {
          const form = new FormData();
          form.set("file", file);
          await apiFetch(
            `/api/v1/records/${draftRecord.record.id}/attachments`,
            { method: "POST", body: form },
          );
        }
        versionRef.current = draftVersion;
      }
      const submitVersion = versionRef.current + 1;
      const result = await apiFetch<RecordResult>("/api/v1/records", {
        method: "PUT",
        body: JSON.stringify(recordBody(true, submitVersion)),
      });
      await saveLocalDraft({
        clientRecordId,
        localVersion: submitVersion,
        sourceKind,
        payload: { taskId: params.taskId, sourceKind, answers, attested },
        updatedAt: new Date().toISOString(),
        syncStatus: "synced",
      });
      router.replace(`/records/${result.record.id}`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  if (!taskPackage && !error) return <LoadingState rows={5} />;
  if (!taskPackage) return <ErrorState message={error} retry={load} />;
  const title = label(
    taskPackage.form.version.nameEn,
    taskPackage.form.version.nameZh,
  );
  const isReview = step >= reviewStep;

  return (
    <div className="step-layout">
      <header className="stack-sm">
        <div className="row-between">
          <Link className="inline-link" href={`/tasks/${params.taskId}`}>
            <AppIcon name="back" />
            {preview ? (locale === "zh" ? "退出预览" : "Exit preview") : title}
          </Link>
          <div className="row">
            {preview ? (
              <StatusPill tone="amber">
                {locale === "zh" ? "预览" : "Preview"}
              </StatusPill>
            ) : null}
            <StatusPill tone="green">
              {locale === "zh" ? "采集员" : "Collector"}
            </StatusPill>
          </div>
        </div>
        <div className="progress-label">
          <span>
            {locale === "zh"
              ? `第 ${step + 1} 步，共 ${totalSteps} 步`
              : `Step ${step + 1} of ${totalSteps}`}
          </span>
          <span>{savedLabel}</span>
        </div>
        <div className="progress-track">
          <div
            className="progress-value"
            style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
          />
        </div>
      </header>

      <main className="stack">
        {error ? <ErrorState message={error} /> : null}
        {!isReview ? (
          <>
            <div>
              <h1>
                {currentSection
                  ? label(currentSection.labelEn, currentSection.labelZh)
                  : title}
              </h1>
              {currentSection ? (
                <p className="muted">
                  {label(
                    currentSection.helpTextEn ?? "Complete the fields below.",
                    currentSection.helpTextZh ?? "请完成以下内容。",
                  )}
                </p>
              ) : null}
            </div>
            {step === 0 && sourceKinds.length > 1 ? (
              <label>
                {locale === "zh" ? "记录来源" : "Record source"}
                <select
                  disabled={preview}
                  value={sourceKind}
                  onChange={(event) => setSourceKind(event.target.value)}
                >
                  {sourceKinds.map((item) => (
                    <option key={item.itemKey} value={item.itemKey}>
                      {label(item.labelEn, item.labelZh)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="stack">
              {fields.map((field) => (
                <FieldControl
                  answers={answers}
                  control={fieldControlByKey.get(field.fieldTypeKey) ?? "text"}
                  disabled={preview}
                  field={field}
                  key={field.id}
                  locale={locale}
                  onChange={update}
                  options={optionsFor(field.id)}
                />
              ))}
              {!fields.length ? (
                <div className="feedback feedback-info">
                  <div>
                    <strong>
                      {locale === "zh"
                        ? "本节没有问题"
                        : "No questions in this section"}
                    </strong>
                    <p>
                      {locale === "zh"
                        ? "可以继续到下一步。"
                        : "Continue to the next step."}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
            {step === Math.max(0, reviewStep - 1) ? (
              <div className="stack-sm">
                <h2>
                  {locale === "zh" ? "附件（可选）" : "Attachments (optional)"}
                </h2>
                <div className="grid-2">
                  <label className="card card-compact">
                    {locale === "zh" ? "添加照片" : "Add photo"}
                    <input
                      accept="image/*"
                      capture="environment"
                      disabled={preview || !online}
                      onChange={(event) =>
                        setFiles((current) => [
                          ...current,
                          ...Array.from(event.target.files ?? []),
                        ])
                      }
                      type="file"
                    />
                  </label>
                  <label className="card card-compact">
                    {locale === "zh" ? "添加语音笔记" : "Add voice note"}
                    <input
                      accept="audio/*"
                      capture
                      disabled={preview || !online}
                      onChange={(event) =>
                        setFiles((current) => [
                          ...current,
                          ...Array.from(event.target.files ?? []),
                        ])
                      }
                      type="file"
                    />
                  </label>
                </div>
                {!online ? (
                  <p className="caption">
                    {locale === "zh"
                      ? "文字可离线保存；附件需联网后选择并上传。"
                      : "Answers save offline; choose attachments when connected."}
                  </p>
                ) : null}
                {files.length ? (
                  <div className="caption">
                    {files.map((file) => file.name).join(" · ")}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div>
              <h1>{locale === "zh" ? "准备提交？" : "Ready to submit?"}</h1>
              <p className="muted">
                {locale === "zh"
                  ? "请最后检查一次采集内容。"
                  : "Review your collection one last time."}
              </p>
            </div>
            <div className="card stack-sm">
              <h2>
                {taskPackage.task.location?.name ?? taskPackage.task.title}
              </h2>
              <p className="muted">{title}</p>
              <div className="row">
                {taskPackage.form.fields
                  .filter((field) => hasValue(answers[field.id]))
                  .map((field) => (
                    <StatusPill tone="blue" key={field.id}>
                      {label(field.labelEn, field.labelZh)}
                    </StatusPill>
                  ))}
              </div>
            </div>
            <label
              className="feedback feedback-success"
              style={{ cursor: "pointer" }}
            >
              <input
                checked={attested}
                disabled={preview}
                onChange={(event) => setAttested(event.target.checked)}
                type="checkbox"
              />
              <span>
                <strong>
                  {locale === "zh" ? "隐私确认" : "Privacy reminder"}
                </strong>
                <span
                  style={{ display: "block", marginTop: 4, fontWeight: 450 }}
                >
                  {locale === "zh"
                    ? "我确认内容不包含参与者姓名、电话、住址或身份证件号码。"
                    : "I confirm this entry does not include a participant’s name, phone number, address, or ID."}
                </span>
              </span>
            </label>
            {!online ? (
              <div className="feedback feedback-warning">
                <div>
                  <strong>
                    {locale === "zh" ? "离线也没关系" : "Offline? That’s okay."}
                  </strong>
                  <p>
                    {locale === "zh"
                      ? "内容会安全保存在本机，联网后自动上传。"
                      : "We’ll keep the form on this device and upload it automatically."}
                  </p>
                </div>
              </div>
            ) : null}
          </>
        )}
      </main>

      <footer className="step-footer">
        {step > 0 ? (
          <button
            className="button button-secondary"
            disabled={saving || submitting}
            onClick={() => {
              setError("");
              setStep((current) => current - 1);
            }}
            type="button"
          >
            {locale === "zh" ? "上一步" : "Back"}
          </button>
        ) : (
          <span />
        )}
        {preview && isReview ? (
          <Link className="button" href={`/tasks/${params.taskId}`}>
            {locale === "zh" ? "结束预览" : "Finish preview"}
          </Link>
        ) : isReview ? (
          <button
            className="button"
            disabled={submitting || !attested}
            onClick={submit}
            type="button"
          >
            {submitting
              ? locale === "zh"
                ? "提交中…"
                : "Submitting…"
              : locale === "zh"
                ? "提交"
                : "Submit"}
          </button>
        ) : (
          <button
            className="button"
            disabled={saving}
            onClick={next}
            type="button"
          >
            {saving
              ? locale === "zh"
                ? "保存中…"
                : "Saving…"
              : locale === "zh"
                ? "下一步"
                : "Next"}
          </button>
        )}
      </footer>
    </div>
  );
}

function FieldControl({
  field,
  control: kind,
  options,
  answers,
  onChange,
  locale,
  disabled,
}: {
  field: TemplateField;
  control: ControlKind;
  options: TemplateOption[];
  answers: Record<string, Answer>;
  onChange: (fieldId: string, value: Answer) => void;
  locale: "zh" | "en";
  disabled: boolean;
}) {
  const answer = answers[field.id];
  const label = locale === "zh" ? field.labelZh : field.labelEn;
  const help = locale === "zh" ? field.helpTextZh : field.helpTextEn;
  const placeholder =
    locale === "zh" ? field.placeholderZh : field.placeholderEn;
  const limits = field.validation ?? {};
  const min = typeof limits.min === "number" ? limits.min : undefined;
  const max = typeof limits.max === "number" ? limits.max : undefined;

  if ((kind === "multi" || kind === "single") && options.length) {
    const selected = Array.isArray(answer) ? answer : [];
    return (
      <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
        <legend style={{ marginBottom: 8, fontSize: 13, fontWeight: 700 }}>
          {label}
          {field.required ? " *" : ""}
        </legend>
        {help ? <p className="muted">{help}</p> : null}
        <div className="choice-list">
          {options.map((option) => {
            const checked =
              kind === "multi"
                ? selected.includes(option.id)
                : answer === option.id;
            return (
              <label className="choice" key={option.id}>
                <input
                  checked={checked}
                  disabled={disabled}
                  name={field.id}
                  onChange={(event) => {
                    if (kind === "single") onChange(field.id, option.id);
                    else
                      onChange(
                        field.id,
                        event.target.checked
                          ? [...selected, option.id]
                          : selected.filter((id) => id !== option.id),
                      );
                  }}
                  type={kind === "single" ? "radio" : "checkbox"}
                />
                <span>{locale === "zh" ? option.labelZh : option.labelEn}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (kind === "boolean")
    return (
      <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
        <legend style={{ marginBottom: 8, fontSize: 13, fontWeight: 700 }}>
          {label}
          {field.required ? " *" : ""}
        </legend>
        {help ? <p className="muted">{help}</p> : null}
        <div className="grid-2">
          <label className="choice">
            <input
              checked={answer === true}
              disabled={disabled}
              name={field.id}
              onChange={() => onChange(field.id, true)}
              type="radio"
            />
            <span>{locale === "zh" ? "是" : "Yes"}</span>
          </label>
          <label className="choice">
            <input
              checked={answer === false}
              disabled={disabled}
              name={field.id}
              onChange={() => onChange(field.id, false)}
              type="radio"
            />
            <span>{locale === "zh" ? "否" : "No"}</span>
          </label>
        </div>
      </fieldset>
    );
  if (kind === "textarea")
    return (
      <label>
        {label}
        {field.required ? " *" : ""}
        {help ? <span className="caption">{help}</span> : null}
        <textarea
          disabled={disabled}
          onChange={(event) => onChange(field.id, event.target.value)}
          placeholder={placeholder ?? ""}
          value={typeof answer === "string" ? answer : ""}
        />
      </label>
    );
  return (
    <label>
      {label}
      {field.required ? " *" : ""}
      {help ? <span className="caption">{help}</span> : null}
      <input
        disabled={disabled}
        max={max}
        min={min}
        onChange={(event) =>
          onChange(
            field.id,
            kind === "number"
              ? event.target.value === ""
                ? ""
                : Number(event.target.value)
              : event.target.value,
          )
        }
        placeholder={placeholder ?? ""}
        type={
          kind === "number"
            ? "number"
            : kind === "date"
              ? "datetime-local"
              : "text"
        }
        value={
          typeof answer === "string" || typeof answer === "number" ? answer : ""
        }
      />
    </label>
  );
}
