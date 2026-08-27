"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  configuredFormControl,
  hasFormAnswerValue,
  normalizeLegacyFormAnswers,
  resolveFormBranchAction,
  resolveRuntimeFormVisibility,
  sourceKindPolicySchema,
  type FormAnswer,
  type FormAnswers,
  type FormScalarAnswer,
} from "@cnpaf/shared";
import { useI18n } from "@/components/LocaleProvider";
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusPill } from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";
import {
  listLocalDrafts,
  newId,
  queueOutbox,
  saveLocalDraft,
} from "@/lib/offline";
import { DynamicFieldControl } from "@/features/forms/runtime/DynamicFieldControl";
import { serializeFormAnswers } from "@/features/forms/runtime/serializeFormAnswers";
import { localizedLocationName } from "@/features/locations/model";
import {
  createCaptureSite,
  listQuickForms,
  loadQuickFormPackage,
  searchCaptureSites,
} from "./api";
import type { QuickCapturePackage, QuickFormSummary, SiteChoice } from "./types";

type RecordResult = { record: { id: string } };

export function QuickCaptureScreen() {
  const { locale } = useI18n();
  const router = useRouter();
  const [forms, setForms] = useState<QuickFormSummary[]>([]);
  const [versionId, setVersionId] = useState("");
  const [formPackage, setFormPackage] = useState<QuickCapturePackage | null>(null);
  const [answers, setAnswers] = useState<FormAnswers>({});
  const [sourceKind, setSourceKind] = useState("");
  const [siteId, setSiteId] = useState<string | null>(null);
  const [siteQuery, setSiteQuery] = useState("");
  const [siteType, setSiteType] = useState("");
  const [sites, setSites] = useState<SiteChoice[]>([]);
  const [step, setStep] = useState(-1);
  const [sectionHistory, setSectionHistory] = useState<string[]>([]);
  const [attested, setAttested] = useState(false);
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [clientRecordId, setClientRecordId] = useState(() => newId());
  const localVersionRef = useRef(1);
  const hydratedRef = useRef(false);
  const occurredAtRef = useRef(new Date().toISOString());

  const loadPackage = useCallback(async (targetVersionId: string) => {
    const result = await loadQuickFormPackage(targetVersionId);
    setFormPackage(result);
    const sources = result.configuration.filter((item) => item.registryKey === "source_kind");
    const siteTypes = result.configuration.filter((item) => item.registryKey === "site_type");
    setSourceKind((current) => current || sources[0]?.itemKey || "");
    setSiteType((current) => current || siteTypes[0]?.itemKey || "");
    return result;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listQuickForms();
      setForms(result.forms ?? []);
      const drafts = await listLocalDrafts();
      const saved = drafts
        .filter((draft) => draft.payload.quickCapture === true && draft.syncStatus !== "synced")
        .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      const targetVersion =
        typeof saved?.payload.versionId === "string" &&
        result.forms.some((form) => form.versionId === saved.payload.versionId)
          ? saved.payload.versionId
          : result.forms[0]?.versionId;
      if (targetVersion) {
        setVersionId(targetVersion);
        await loadPackage(targetVersion);
      }
      if (saved && targetVersion === saved.payload.versionId) {
        setClientRecordId(saved.clientRecordId);
        localVersionRef.current = saved.localVersion;
        if (saved.payload.answers && typeof saved.payload.answers === "object")
          setAnswers(
            normalizeLegacyFormAnswers(
              saved.payload.answers as Record<string, FormAnswer | FormScalarAnswer>,
            ),
          );
        if (typeof saved.payload.sourceKind === "string") setSourceKind(saved.payload.sourceKind);
        if (typeof saved.payload.siteId === "string") setSiteId(saved.payload.siteId);
        if (typeof saved.payload.siteQuery === "string") setSiteQuery(saved.payload.siteQuery);
      }
      hydratedRef.current = true;
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [loadPackage]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    if (!siteQuery.trim()) {
      setSites([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        setSites((await searchCaptureSites(siteQuery.trim())).sites ?? []);
      } catch (caught) {
        setError(errorMessage(caught));
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [siteQuery]);

  useEffect(() => {
    if (!hydratedRef.current || !formPackage || !versionId || !sourceKind) return;
    const timer = window.setTimeout(async () => {
      const nextVersion = localVersionRef.current + 1;
      localVersionRef.current = nextVersion;
      await saveLocalDraft({
        clientRecordId,
        localVersion: nextVersion,
        sourceKind,
        payload: {
          quickCapture: true,
          versionId,
          answers,
          sourceKind,
          siteId,
          siteQuery,
          packageVersion: formPackage.packageVersion,
        },
        updatedAt: new Date().toISOString(),
        syncStatus: online ? "pending" : "local_only",
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [answers, clientRecordId, formPackage, online, siteId, siteQuery, sourceKind, versionId]);

  const sourceKinds = useMemo(
    () => formPackage?.configuration.filter((item) => item.registryKey === "source_kind") ?? [],
    [formPackage],
  );
  const sourcePolicy = useMemo(() => {
    const source = sourceKinds.find((item) => item.itemKey === sourceKind);
    const parsed = sourceKindPolicySchema.safeParse(
      (source?.metadata as { policy?: unknown } | undefined)?.policy,
    );
    return parsed.success ? parsed.data : null;
  }, [sourceKind, sourceKinds]);
  const controls = useMemo(
    () =>
      new Map(
        (formPackage?.configuration ?? [])
          .filter((item) => item.registryKey === "collection_field_type")
          .map((item) => [item.itemKey, configuredFormControl(item.metadata)]),
      ),
    [formPackage],
  );
  const missingReasons = useMemo(
    () =>
      (formPackage?.configuration ?? [])
        .filter((item) => item.registryKey === "missing_reason")
        .map((item) => ({ key: item.itemKey, labelEn: item.labelEn, labelZh: item.labelZh, metadata: item.metadata })),
    [formPackage],
  );
  const visibility = useMemo(
    () =>
      resolveRuntimeFormVisibility({
        answers,
        fields: formPackage?.form.fields ?? [],
        sections: formPackage?.form.sections ?? [],
      }),
    [answers, formPackage],
  );
  const sections = visibility.visibleSections;
  const reviewStep = sections.length;
  const currentSection = step >= 0 ? sections[step] : null;
  const currentFields = currentSection
    ? visibility.visibleFields.filter(
        (field) => field.templateSectionId === currentSection.id,
      )
    : [];

  useEffect(() => {
    if (step > reviewStep) setStep(reviewStep);
  }, [reviewStep, step]);

  async function changeForm(targetVersionId: string) {
    setLoading(true);
    setError("");
    try {
      setVersionId(targetVersionId);
      setAnswers({});
      setStep(-1);
      setSectionHistory([]);
      setSiteId(null);
      setSourceKind("");
      await loadPackage(targetVersionId);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function ensureSite() {
    if (!sourcePolicy?.requiresSite) return siteId;
    if (siteId) return siteId;
    if (!online) throw new Error(locale === "zh" ? "离线时请选择已有地点。" : "Choose an existing location while offline.");
    if (!siteQuery.trim() || !siteType) throw new Error(locale === "zh" ? "请选择或新建地点。" : "Choose or create a location.");
    const result = await createCaptureSite({
      name: siteQuery.trim(),
      siteType,
      locale,
      organizationId: formPackage?.template.organizationId,
    });
    if (!result.site && result.suggestions?.length) {
      setSites(result.suggestions);
      throw new Error(locale === "zh" ? "发现相似地点，请先选择。" : "Similar locations found. Choose one first.");
    }
    if (!result.site) throw new Error(locale === "zh" ? "地点创建失败。" : "Location could not be created.");
    setSiteId(result.site.id);
    return result.site.id;
  }

  function validateSection() {
    const missing = currentFields.find(
      (field) => field.required && !hasFormAnswerValue(answers[field.id]),
    );
    if (!missing) return true;
    setError(
      `${locale === "zh" ? missing.labelZh : missing.labelEn} ${locale === "zh" ? "为必填项。" : "is required."}`,
    );
    return false;
  }

  function buildBody(submit: boolean, localVersion: number, resolvedSiteId: string | null) {
    if (!formPackage) throw new Error("Form package unavailable");
    return {
      clientRecordId,
      idempotencyKey: `${clientRecordId}-${submit ? "submit" : "draft"}-${localVersion}`,
      localVersion,
      sourceKind,
      siteId: resolvedSiteId,
      templateVersionId: formPackage.form.version.id,
      ...serializeFormAnswers({
        answers,
        controls,
        fields: formPackage.form.fields,
        locale,
        options: formPackage.form.options,
        sections: formPackage.form.sections,
      }),
      attribution: {},
      contentLanguage: locale,
      occurredAt: occurredAtRef.current,
      ...(submit ? { piiAttestation: attested } : {}),
    };
  }

  async function next() {
    setError("");
    try {
      if (step < 0) {
        if (!versionId || !sourceKind) throw new Error(locale === "zh" ? "请选择表单和记录来源。" : "Choose a form and record source.");
        await ensureSite();
        setSectionHistory([]);
        setStep(0);
        return;
      }
      if (!validateSection()) return;
      if (online && formPackage) {
        const nextVersion = localVersionRef.current + 1;
        localVersionRef.current = nextVersion;
        await apiFetch("/api/v1/records", {
          method: "POST",
          body: JSON.stringify(buildBody(false, nextVersion, siteId)),
        });
      }
      if (!currentSection || !formPackage) return;
      const branch = resolveFormBranchAction({
        answers,
        fields: formPackage.form.fields,
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
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function back() {
    setError("");
    if (step === 0) {
      setSectionHistory([]);
      setStep(-1);
      return;
    }
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
    setStep((current) => Math.max(-1, current - 1));
  }

  async function submit() {
    if (!formPackage || (sourcePolicy?.requiresPiiAttestation && !attested)) {
      setError(locale === "zh" ? "请完成隐私确认。" : "Complete the privacy confirmation.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const resolvedSiteId = await ensureSite();
      const nextVersion = localVersionRef.current + 1;
      const body = buildBody(true, nextVersion, resolvedSiteId);
      if (online) {
        const result = await apiFetch<RecordResult>("/api/v1/records", {
          method: "PUT",
          body: JSON.stringify(body),
        });
        await saveLocalDraft({ clientRecordId, localVersion: nextVersion, sourceKind, payload: { quickCapture: true, versionId, answers }, updatedAt: new Date().toISOString(), syncStatus: "synced" });
        router.replace(`/records/${result.record.id}`);
      } else {
        await queueOutbox({ id: body.idempotencyKey, method: "PUT", url: "/api/v1/records", body });
        await saveLocalDraft({ clientRecordId, localVersion: nextVersion, sourceKind, payload: { quickCapture: true, versionId, answers }, updatedAt: new Date().toISOString(), syncStatus: "pending" });
        router.replace("/records");
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !forms.length) return <LoadingState rows={6} />;
  if (error && !forms.length) return <ErrorState message={error} retry={load} />;
  if (!forms.length)
    return (
      <EmptyState
        description={locale === "zh" ? "请让管理员发布一个已允许快速采集的表单。" : "Ask an administrator to publish a form enabled for quick capture."}
        icon="forms"
        title={locale === "zh" ? "没有可用表单" : "No quick-capture forms"}
      />
    );

  const review = step >= reviewStep;
  return (
    <div className="stack">
      <PageHeader
        title={locale === "zh" ? "快速采集" : "Quick capture"}
        description={locale === "zh" ? "未分配任务的采集也使用已发布动态表单。" : "Unassigned collection uses the same published dynamic forms."}
        actions={<StatusPill tone={online ? "green" : "amber"}>{online ? (locale === "zh" ? "在线" : "Online") : (locale === "zh" ? "离线" : "Offline")}</StatusPill>}
      />
      {error ? <ErrorState message={error} /> : null}
      {step < 0 ? (
        <section className="card stack">
          <label>
            {locale === "zh" ? "已发布表单" : "Published form"}
            <select value={versionId} onChange={(event) => void changeForm(event.target.value)}>
              {forms.map((form) => <option key={form.versionId} value={form.versionId}>{locale === "zh" ? form.nameZh : form.nameEn} · v{form.version}</option>)}
            </select>
          </label>
          <label>
            {locale === "zh" ? "记录来源" : "Record source"}
            <select value={sourceKind} onChange={(event) => setSourceKind(event.target.value)}>
              {sourceKinds.map((source) => <option key={source.itemKey} value={source.itemKey}>{locale === "zh" ? source.labelZh : source.labelEn}</option>)}
            </select>
          </label>
          {sourcePolicy?.requiresSite ? (
            <div className="stack-sm">
              <label>
                {locale === "zh" ? "搜索或新建地点" : "Search or create location"}
                <input value={siteQuery} onChange={(event) => { setSiteQuery(event.target.value); setSiteId(null); }} />
              </label>
              {sites.length ? <div className="choice-list">{sites.map((site) => {
                const siteName = localizedLocationName(site, locale);
                return <button className={`choice${site.id === siteId ? " selected-row" : ""}`} key={site.id} onClick={() => { setSiteId(site.id); setSiteQuery(siteName); }} type="button">{siteName}</button>;
              })}</div> : null}
              <label>
                {locale === "zh" ? "地点类型" : "Location type"}
                <select value={siteType} onChange={(event) => setSiteType(event.target.value)}>
                  {(formPackage?.configuration ?? []).filter((item) => item.registryKey === "site_type").map((item) => <option key={item.itemKey} value={item.itemKey}>{locale === "zh" ? item.labelZh : item.labelEn}</option>)}
                </select>
              </label>
            </div>
          ) : null}
        </section>
      ) : !review && currentSection && formPackage ? (
        <section className="card stack">
          <div>
            <div className="eyebrow">{locale === "zh" ? `第 ${step + 1} 节，共 ${sections.length} 节` : `Section ${step + 1} of ${sections.length}`}</div>
            <h1>{locale === "zh" ? currentSection.labelZh : currentSection.labelEn}</h1>
            {(locale === "zh" ? currentSection.helpTextZh : currentSection.helpTextEn) ? <p className="muted">{locale === "zh" ? currentSection.helpTextZh : currentSection.helpTextEn}</p> : null}
          </div>
          {currentFields.map((field) => (
            <DynamicFieldControl
              answer={answers[field.id]}
              control={controls.get(field.fieldTypeKey) ?? "text"}
              field={field}
              key={field.id}
              locale={locale}
              missingReasons={missingReasons}
              onChange={(fieldId, answer) => setAnswers((current) => ({ ...current, [fieldId]: answer }))}
              options={formPackage.form.options.filter((option) => option.templateFieldId === field.id && option.status === "active")}
            />
          ))}
        </section>
      ) : (
        <section className="card stack">
          <h1>{locale === "zh" ? "检查并提交" : "Review and submit"}</h1>
          <p className="muted">{locale === "zh" ? `已回答 ${visibility.visibleFields.filter((field) => hasFormAnswerValue(answers[field.id])).length} 道题。` : `${visibility.visibleFields.filter((field) => hasFormAnswerValue(answers[field.id])).length} fields answered.`}</p>
          {sourcePolicy?.requiresPiiAttestation ? (
            <label className="choice"><input checked={attested} onChange={(event) => setAttested(event.target.checked)} type="checkbox" /><span>{locale === "zh" ? "我确认内容已去除姓名、电话、住址和证件号码。" : "I confirm identifying personal details have been removed."}</span></label>
          ) : null}
        </section>
      )}
      <footer className="step-footer">
        {step >= 0 ? <button className="button button-secondary" disabled={saving} onClick={back} type="button">{locale === "zh" ? "上一步" : "Back"}</button> : <span />}
        {review ? <button className="button" disabled={saving || Boolean(sourcePolicy?.requiresPiiAttestation && !attested)} onClick={() => void submit()} type="button">{saving ? (locale === "zh" ? "提交中…" : "Submitting…") : (locale === "zh" ? "提交" : "Submit")}</button> : <button className="button" disabled={saving} onClick={() => void next()} type="button">{locale === "zh" ? "下一步" : "Next"}</button>}
      </footer>
    </div>
  );
}
