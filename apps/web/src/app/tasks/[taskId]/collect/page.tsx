"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  configuredFormControl,
  hasFormAnswerValue,
  normalizeLegacyFormAnswers,
  resolveFormBranchAction,
  resolveRuntimeFormVisibility,
  type FormAnswer,
  type FormAnswers,
  type FormScalarAnswer,
  type RuntimeFormField,
  type RuntimeFormOption,
  type RuntimeFormSection,
} from "@cnpaf/shared";
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
import { DynamicFieldControl } from "@/features/forms/runtime/DynamicFieldControl";
import { serializeFormAnswers } from "@/features/forms/runtime/serializeFormAnswers";
import { AttachmentPicker } from "@/features/attachments/components/AttachmentPicker";

type TemplateVersion = {
  id: string;
  nameEn: string;
  nameZh: string;
  descriptionEn?: string | null;
  descriptionZh?: string | null;
  configuration: Record<string, unknown>;
};
type RegistryItem = {
  registryKey: string;
  itemKey: string;
  labelEn: string;
  labelZh: string;
  metadata?: Record<string, unknown>;
};
type TaskPackage = {
  task: Omit<TaskSummary, "myAssignment" | "assignments">;
  assignment: TaskAssignment;
  form: {
    version: TemplateVersion;
    sections: RuntimeFormSection[];
    fields: RuntimeFormField[];
    options: RuntimeFormOption[];
  };
  configuration: RegistryItem[];
  correction: {
    record: { id: string; clientRecordId: string; sourceKind: string };
    version: {
      id: string;
      localVersion: number;
      occurredAt?: string | null;
      piiAttestation?: boolean | null;
    };
    fieldAnswers: Array<{
      templateFieldId: string;
      value: FormScalarAnswer | null;
      missingReasonKey?: string | null;
      customText?: string | null;
    }>;
    notes: Array<{ body: string }>;
    correctionFieldIds: string[];
  } | null;
  packageVersion: string;
};
type RecordResult = { record: { id: string } };

export default function GuidedCollectionPage() {
  const { locale } = useI18n();
  const params = useParams<{ taskId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const preview = searchParams.get("preview") === "1";
  const [taskPackage, setTaskPackage] = useState<TaskPackage | null>(null);
  const [step, setStep] = useState(0);
  const [sectionHistory, setSectionHistory] = useState<string[]>([]);
  const [answers, setAnswers] = useState<FormAnswers>({});
  const [sourceKind, setSourceKind] = useState("");
  const [clientRecordId, setClientRecordId] = useState(() => newId());
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString());
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
            setAnswers(
              normalizeLegacyFormAnswers(
                storedAnswers as Record<
                  string,
                  FormAnswer | FormScalarAnswer
                >,
              ),
            );
          if (typeof local.payload.sourceKind === "string")
            setSourceKind(local.payload.sourceKind);
          if (local.payload.attested === true) setAttested(true);
        } else if (result.correction) {
          setClientRecordId(result.correction.record.clientRecordId);
          setSourceKind(result.correction.record.sourceKind);
          setOccurredAt(
            result.correction.version.occurredAt ?? new Date().toISOString(),
          );
          setAttested(Boolean(result.correction.version.piiAttestation));
          versionRef.current = result.correction.version.localVersion;
          setAnswers(
            Object.fromEntries(
              result.correction.fieldAnswers.map((answer) => [
                answer.templateFieldId,
                {
                  ...(answer.value === null ? {} : { value: answer.value }),
                  ...(answer.missingReasonKey
                    ? { missingReasonKey: answer.missingReasonKey }
                    : {}),
                  ...(answer.customText
                    ? { customText: answer.customText }
                    : {}),
                },
              ]),
            ),
          );
          const firstCorrectionField = result.form.fields.find((field) =>
            result.correction?.correctionFieldIds.includes(field.id),
          );
          if (firstCorrectionField) {
            const targetStep = result.form.sections.findIndex(
              (section) => section.id === firstCorrectionField.templateSectionId,
            );
            if (targetStep >= 0) setStep(targetStep);
          }
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

  const visibility = useMemo(
    () =>
      resolveRuntimeFormVisibility({
        answers,
        fields: taskPackage?.form.fields ?? [],
        sections: taskPackage?.form.sections ?? [],
      }),
    [answers, taskPackage],
  );
  const sections = visibility.visibleSections;
  const reviewStep = sections.length;
  const totalSteps = Math.max(1, sections.length + 1);
  const currentSection = sections[step];
  const fields = useMemo(
    () =>
      currentSection
        ? visibility.visibleFields.filter(
            (field) => field.templateSectionId === currentSection.id,
          )
        : [],
    [currentSection, visibility.visibleFields],
  );
  useEffect(() => {
    if (step > reviewStep) setStep(reviewStep);
  }, [reviewStep, step]);
  const sourceKinds = (taskPackage?.configuration ?? []).filter(
    (item) => item.registryKey === "source_kind",
  );
  const fieldControlByKey = useMemo(
    () =>
      new Map(
        (taskPackage?.configuration ?? [])
          .filter((item) => item.registryKey === "collection_field_type")
          .map((item) => [item.itemKey, configuredFormControl(item.metadata)]),
      ),
    [taskPackage],
  );
  const missingReasons = useMemo(
    () =>
      (taskPackage?.configuration ?? [])
        .filter((item) => item.registryKey === "missing_reason")
        .map((item) => ({
          key: item.itemKey,
          labelEn: item.labelEn,
          labelZh: item.labelZh,
          metadata: item.metadata,
        })),
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
  function update(fieldId: string, answer: FormAnswer) {
    setAnswers((current) => ({ ...current, [fieldId]: answer }));
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
      (field) => field.required && !hasFormAnswerValue(answers[field.id]),
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
    const serialized = serializeFormAnswers({
      answers,
      controls: fieldControlByKey,
      fields: taskPackage.form.fields,
      locale,
      options: taskPackage.form.options,
      sections: taskPackage.form.sections,
    });
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
      ...serialized,
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
      if (!currentSection || !taskPackage) return;
      const branch = resolveFormBranchAction({
        answers,
        fields: taskPackage.form.fields,
        sectionId: currentSection.id,
        visibleFieldIds: visibility.visibleFieldIds,
      });
      const targetStep =
        branch?.action === "go_to_section"
          ? sections.findIndex(
              (section) => section.key === branch.targetSectionKey,
            )
          : -1;
      setSectionHistory((current) => [...current, currentSection.key]);
      setStep(
        branch?.action === "end_form"
          ? reviewStep
          : targetStep >= 0
            ? targetStep
            : Math.min(reviewStep, step + 1),
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function back() {
    setError("");
    const history = [...sectionHistory];
    while (history.length) {
      const previousKey = history.pop();
      const previousStep = sections.findIndex(
        (section) => section.key === previousKey,
      );
      if (previousStep >= 0) {
        setSectionHistory(history);
        setStep(previousStep);
        return;
      }
    }
    setSectionHistory([]);
    setStep((current) => Math.max(0, current - 1));
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
        {!preview && taskPackage.correction ? (
          <div className="feedback feedback-warning">
            <div>
              <strong>
                {locale === "zh" ? "此提交需要补充" : "This submission needs an update"}
              </strong>
              {taskPackage.correction.notes.map((note, index) => (
                <p key={`${note.body}-${index}`}>{note.body}</p>
              ))}
              {taskPackage.correction.correctionFieldIds.length ? (
                <p className="caption">
                  {locale === "zh" ? "需要修改" : "Update"}: {taskPackage.form.fields
                    .filter((field) =>
                      taskPackage.correction?.correctionFieldIds.includes(field.id),
                    )
                    .map((field) => label(field.labelEn, field.labelZh))
                    .join("、")}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
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
                <DynamicFieldControl
                  answer={answers[field.id]}
                  control={fieldControlByKey.get(field.fieldTypeKey) ?? "text"}
                  disabled={preview}
                  field={field}
                  key={field.id}
                  locale={locale}
                  missingReasons={missingReasons}
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
                <AttachmentPicker
                  disabled={preview || !online}
                  files={files}
                  locale={locale}
                  onChange={setFiles}
                />
                {!online ? (
                  <p className="caption">
                    {locale === "zh"
                      ? "文字可离线保存；附件需联网后选择并上传。"
                      : "Answers save offline; choose attachments when connected."}
                  </p>
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
                  .filter((field) => hasFormAnswerValue(answers[field.id]))
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
            onClick={back}
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
