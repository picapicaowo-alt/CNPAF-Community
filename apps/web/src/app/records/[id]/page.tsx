"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { AiCopilotPanel } from "@/components/AiCopilotPanel";
import { AiSourceList, type AiDisplaySource } from "@/components/AiSourceList";
import { useI18n } from "@/components/LocaleProvider";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  StatusPill,
} from "@/components/ui";
import { FieldAnswersPanel } from "@/features/records/FieldAnswersPanel";
import {
  hasStructuredEvidence,
  StructuredEvidencePanel,
} from "@/features/records/StructuredEvidencePanel";
import { RecordRevisionForm } from "@/features/records/components/RecordRevisionForm";
import { recordCitationLabel, recordDisplayName, recordReference } from "@/features/records/display";
import type { RecordFieldAnswer } from "@/features/records/types";
import { downloadRecord } from "@/features/records/api";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { workflowLabel } from "@/lib/display-labels";
import type { AttachmentSummary } from "@cnpaf/shared";
import { AttachmentGallery } from "@/features/attachments/components/AttachmentGallery";
import { localizedLocationName } from "@/features/locations/model";
import {
  AiConversationArtifactList,
  type AiConversationArtifactSummary,
} from "@/features/records/components/AiConversationArtifactList";

function readableKey(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function RecordDetail() {
  const { t, locale } = useI18n();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [identity, setIdentity] = useState<{
    userId: string;
    permissions: string[];
  } | null>(null);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<"download" | "analysis" | "revision" | "submit" | "archive" | "">("");
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [recordResult, me] = await Promise.all([
        apiFetch<Record<string, unknown>>(`/api/v1/records/${params.id}`),
        apiFetch<{ user: { id: string }; permissions: string[] }>(
          "/api/v1/auth/me",
        ),
      ]);
      setData(recordResult);
      setIdentity({ userId: me.user.id, permissions: me.permissions ?? [] });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [params.id]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!data?.record)
    return (
      <>
        <PageHeader
          title={t.terms.record}
        />
        {error ? (
          <ErrorState message={error} retry={load} />
        ) : (
          <LoadingState rows={5} />
        )}
      </>
    );
  const record = data.record as {
    id: string;
    sourceKind: string;
    reviewStatus: string;
    recordStatus: string;
    aiStatus: string;
    privacyStatus: string;
    researchUseStatus: string;
    createdById: string;
    taskId?: string | null;
    siteId?: string | null;
    programId?: string | null;
    createdAt: string;
    updatedAt: string;
  };
  const versions =
    (data.versions as {
      id: string;
      qualitative: string;
      quantitative?: Record<string, unknown>;
      structured?: Record<string, unknown>;
      versionNumber: number;
      isSnapshot: boolean;
      occurredAt?: string | null;
      submittedAt?: string | null;
      createdAt: string;
    }[]) ?? [];
  const notes = (data.notes as { body: string }[]) ?? [];
  const findings =
    (data.findings as { kind: string; statement: string }[]) ?? [];
  const run = data.run as
    | { id: string; status: string; createdAt: string; completedAt?: string | null; costMetadata?: unknown }
    | null
    | undefined;
  const attachments = (data.attachments as AttachmentSummary[]) ?? [];
  const aiConversationArtifacts = (data.aiConversationArtifacts as AiConversationArtifactSummary[]) ?? [];
  const runMetadata = run?.costMetadata && typeof run.costMetadata === "object" && !Array.isArray(run.costMetadata)
    ? run.costMetadata as { externalSources?: unknown }
    : null;
  const recordExternalSources: AiDisplaySource[] = Array.isArray(runMetadata?.externalSources)
    ? runMetadata.externalSources.flatMap((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const source = value as { title?: unknown; url?: unknown };
        if (typeof source.url !== "string") return [];
        return [{
          id: source.url,
          sourceType: "external_web",
          citationLabel: typeof source.title === "string" ? source.title : null,
          excerpt: typeof source.title === "string" ? source.title : null,
          metadata: { title: source.title, url: source.url },
        }];
      })
    : [];
  const context = (data.context as {
    creator?: { id: string; name: string; email: string } | null;
    site?: {
      id: string;
      name: string;
      nameEn?: string | null;
      nameZh?: string | null;
      region?: string | null;
      city?: string | null;
    } | null;
    program?: { id: string; nameEn: string; nameZh: string } | null;
    formVersion?: { id: string; nameEn: string; nameZh: string; version: number } | null;
  } | undefined) ?? {};
  const reviewHistory = (data.reviewHistory as Array<{
    decision: { id: string; action: string; annotation?: string | null; createdAt: string };
    reviewer: { id: string; name: string; email: string };
  }> | undefined) ?? [];
  const head = versions[0];
  const fieldAnswers = (data.fieldAnswers as RecordFieldAnswer[]) ?? [];
  const headAnswers = fieldAnswers.filter(
    (answer) => answer.recordVersionId === head?.id,
  );
  const canCorrect =
    record.reviewStatus === "needs_completion" &&
    record.createdById === identity?.userId &&
    identity.permissions.includes("records.edit_own");
  const canAnalyze = Boolean(
    head?.id &&
      record.privacyStatus !== "flagged" &&
      identity?.permissions.includes("ai.request_reclassification"),
  );
  const canAsk = Boolean(identity?.permissions.some((permission) => ["chat.ask_collect", "ask_collect.use"].includes(permission)));
  const canManage = Boolean(identity?.permissions.includes("records.review") || (record.createdById === identity?.userId && identity.permissions.includes("records.edit_own")));
  const canArchive = Boolean(identity?.permissions.includes("records.review"));
  const analysisPending = ["queued", "running"].includes(record.aiStatus);
  const analysisReady =
    record.aiStatus === "succeeded" || run?.status === "succeeded";

  async function download() {
    setBusyAction("download");
    setError("");
    try {
      await downloadRecord(params.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyAction("");
    }
  }

  async function requestAnalysis() {
    if (!head?.id || !canAnalyze) return;
    setBusyAction("analysis");
    setError("");
    try {
      await apiFetch(`/api/v1/records/${head.id}/ai/classify`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setData((current) =>
        current?.record
          ? {
              ...current,
              record: {
                ...(current.record as Record<string, unknown>),
                aiStatus: "queued",
              },
            }
          : current,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyAction("");
    }
  }

  async function saveRevision(input: { reason: string; qualitative: string; fieldAnswers: Array<{ templateFieldId: string; value: string | number | boolean | string[] | null; missingReasonKey?: string | null; customText?: string | null }> }) {
    setBusyAction("revision");
    setError("");
    try {
      await apiFetch(`/api/v1/records/${record.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "save_revision", ...input }),
      });
      setEditing(false);
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyAction("");
    }
  }

  async function submitRevision() {
    setBusyAction("submit");
    setError("");
    try {
      await apiFetch(`/api/v1/records/${record.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "submit_revision" }),
      });
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyAction("");
    }
  }

  async function archive() {
    if (!archiveReason.trim()) return;
    setBusyAction("archive");
    setError("");
    try {
      await apiFetch(`/api/v1/records/${record.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "archive", reason: archiveReason.trim() }),
      });
      router.replace("/records");
    } catch (caught) {
      setError(errorMessage(caught));
      setBusyAction("");
    }
  }

  const displayName = recordDisplayName(
    { sourceKind: record.sourceKind, occurredAt: head?.occurredAt, updatedAt: record.updatedAt },
    locale,
    {
      locationName: context.site
        ? localizedLocationName(context.site, locale)
        : null,
      formName: context.formVersion ? (locale === "zh" ? context.formVersion.nameZh : context.formVersion.nameEn) : null,
    },
  );
  const reference = recordReference({ id: record.id, sourceKind: record.sourceKind, occurredAt: head?.occurredAt, updatedAt: record.updatedAt });

  return (
    <div className="stack">
      <PageHeader
        eyebrow={reference}
        title={displayName || readableKey(record.sourceKind)}
        description={`${locale === "zh" ? "更新于" : "Updated"} ${new Date(record.updatedAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}`}
        actions={
          <>
            <button
              className="button"
              disabled={busyAction === "download"}
              onClick={download}
              type="button"
            >
              <AppIcon name="download" />
              JSON
            </button>
            {canManage ? (
              <button className="button button-secondary" disabled={Boolean(busyAction)} onClick={() => setEditing((value) => !value)} type="button">
                <AppIcon name="edit" />{editing ? (locale === "zh" ? "收起编辑" : "Close editor") : (locale === "zh" ? "编辑记录" : "Edit record")}
              </button>
            ) : null}
            {canManage && record.reviewStatus === "not_submitted" ? (
              <button className="button" disabled={Boolean(busyAction)} onClick={submitRevision} type="button">
                <AppIcon name="check" />{busyAction === "submit" ? (locale === "zh" ? "提交中…" : "Submitting…") : (locale === "zh" ? "提交修订审核" : "Submit revision")}
              </button>
            ) : null}
            {canArchive ? (
              <button className="button button-danger" disabled={Boolean(busyAction)} onClick={() => setConfirmArchive(true)} type="button">
                <AppIcon name="trash" />{locale === "zh" ? "删除记录" : "Delete record"}
              </button>
            ) : null}
            {canCorrect && record.taskId ? (
              <Link className="button" href={`/tasks/${record.taskId}/collect`}>
                {locale === "zh" ? "补充并重新提交" : "Update and resubmit"}
              </Link>
            ) : null}
          </>
        }
      />
      {error ? <ErrorState message={error} /> : null}
      {confirmArchive ? (
        <section className="card record-archive-confirm" role="alertdialog" aria-labelledby="archive-record-title">
          <div>
            <h2 id="archive-record-title">{locale === "zh" ? "确认删除这条记录？" : "Delete this record?"}</h2>
            <p>{locale === "zh" ? "记录会从工作列表和 AI 检索中移除，但审计日志会保留，避免破坏历史追溯。" : "The record will leave active lists and AI retrieval. Its audit history remains intact."}</p>
          </div>
          <label>
            {locale === "zh" ? "删除原因" : "Reason for deletion"}
            <textarea autoFocus onChange={(event) => setArchiveReason(event.target.value)} placeholder={locale === "zh" ? "例如：重复提交，已核对正确记录。" : "For example: duplicate submission; canonical record verified."} rows={2} value={archiveReason} />
          </label>
          <div className="row">
            <button className="button button-ghost" disabled={busyAction === "archive"} onClick={() => setConfirmArchive(false)} type="button">{locale === "zh" ? "取消" : "Cancel"}</button>
            <button className="button button-danger" disabled={busyAction === "archive" || !archiveReason.trim()} onClick={archive} type="button">{busyAction === "archive" ? (locale === "zh" ? "删除中…" : "Deleting…") : (locale === "zh" ? "确认删除" : "Confirm deletion")}</button>
          </div>
        </section>
      ) : null}
      {editing ? (
        <RecordRevisionForm answers={headAnswers} busy={busyAction === "revision"} key={head?.id} locale={locale} onCancel={() => setEditing(false)} onSave={saveRevision} qualitative={head?.qualitative ?? ""} />
      ) : null}
      <div className="row">
        <StatusPill
          tone={record.reviewStatus === "approved" ? "green" : "amber"}
        >
          {workflowLabel(record.reviewStatus, locale)}
        </StatusPill>
        <StatusPill tone={record.privacyStatus === "flagged" ? "red" : "green"}>
          {record.privacyStatus === "clear"
            ? locale === "zh"
              ? "隐私检查通过"
              : "Privacy cleared"
            : workflowLabel(record.privacyStatus, locale)}
        </StatusPill>
        <StatusPill>{workflowLabel(record.researchUseStatus, locale)}</StatusPill>
      </div>
      <div className="detail-grid">
        <div className="stack">
          <FieldAnswersPanel
            answers={headAnswers}
            locale={locale}
            title={locale === "zh" ? "提交的表单" : "Submitted form"}
          />
          {head?.qualitative ? (
            <section className="card source-note-card">
              <div className="card-section-heading">
                <span className="card-section-icon">
                  <AppIcon name="file" />
                </span>
                <div>
                  <span className="eyebrow">
                    {locale === "zh" ? "原始内容" : "Original content"}
                  </span>
                  <h2>{locale === "zh" ? "来源备注" : "Source notes"}</h2>
                </div>
              </div>
              <p className="pre-wrap source-note-copy">{head.qualitative}</p>
            </section>
          ) : null}
          <StructuredEvidencePanel
            locale={locale}
            value={hasStructuredEvidence(head?.structured) ? head?.structured : head?.quantitative}
          />
          {notes.length ? (
            <section className="card">
              <h2>{t.annotation}</h2>
              {notes.map((note, index) => (
                <p className="pre-wrap" key={index}>
                  {note.body}
                </p>
              ))}
            </section>
          ) : null}
        </div>
        <aside className="stack-sm">
          <section className={`card ai-analysis-card${analysisReady ? " is-ready" : ""}`}>
            <div className="ai-analysis-heading">
              <span className="card-section-icon ai-icon">
                <AppIcon name="sparkles" />
              </span>
              <div>
                <span className="eyebrow">{locale === "zh" ? "按需运行" : "On demand"}</span>
                <h2>{locale === "zh" ? "AI 辅助分析" : "AI-assisted analysis"}</h2>
              </div>
              {analysisReady ? (
                <StatusPill tone="violet">{locale === "zh" ? "已生成" : "Generated"}</StatusPill>
              ) : analysisPending ? (
                <StatusPill tone="blue">{locale === "zh" ? "处理中" : "Running"}</StatusPill>
              ) : null}
            </div>
            {analysisReady ? (
              findings.length ? (
                <div className="ai-findings-list">
                  {findings.map((finding, index) => (
                    <div className="ai-finding" key={`${finding.kind}-${index}`}>
                      <span>{readableKey(finding.kind)}</span>
                      <p>{finding.statement}</p>
                    </div>
                  ))}
                  <AiSourceList locale={locale} sources={recordExternalSources} />
                </div>
              ) : (
                <p className="muted">
                  {locale === "zh" ? "分析已完成，未提取到发现。" : "Analysis completed with no extracted findings."}
                </p>
              )
            ) : analysisPending ? (
              <div className="ai-analysis-pending">
                <span className="analysis-spinner" aria-hidden="true" />
                <p>
                  {locale === "zh"
                    ? "分析已排队。你可以离开此页面，稍后再查看结果。"
                    : "Analysis is queued. You can leave this page and return later."}
                </p>
              </div>
            ) : record.privacyStatus === "flagged" ? (
              <div className="ai-analysis-note">
                <AppIcon name="info" />
                <p>
                  {locale === "zh"
                    ? "隐私标记解决前不会发送内容给 AI。"
                    : "Content will not be sent to AI until the privacy flag is resolved."}
                </p>
              </div>
            ) : (
              <>
                <p className="muted ai-analysis-intro">
                  {locale === "zh"
                    ? "AI 不会自动运行。只有点击下方按钮后才会消耗额度并生成主题与关注点。"
                    : "AI does not run automatically. Credits are used only after you request themes and concerns below."}
                </p>
                {canAnalyze ? (
                  <button
                    className="button button-secondary button-wide"
                    disabled={busyAction === "analysis"}
                    onClick={requestAnalysis}
                    type="button"
                  >
                    <AppIcon name="sparkles" />
                    {busyAction === "analysis"
                      ? locale === "zh"
                        ? "正在请求…"
                        : "Requesting…"
                      : locale === "zh"
                        ? "生成 AI 分析"
                        : "Generate AI analysis"}
                  </button>
                ) : null}
              </>
            )}
          </section>
          <section className="card">
            <div className="card-section-heading compact">
              <span className="card-section-icon">
                <AppIcon name="info" />
              </span>
              <h2>{locale === "zh" ? "记录信息" : "Record details"}</h2>
            </div>
            <dl className="definition-list">
              <div className="definition-row">
                <dt>{locale === "zh" ? "记录状态" : "Record status"}</dt>
                <dd>{workflowLabel(record.recordStatus, locale)}</dd>
              </div>
              <div className="definition-row">
                <dt>{locale === "zh" ? "采集员" : "Collector"}</dt>
                <dd>{context.creator?.name ?? "—"}</dd>
              </div>
              <div className="definition-row">
                <dt>{locale === "zh" ? "项目" : "Program"}</dt>
                <dd>{context.program ? (locale === "zh" ? context.program.nameZh : context.program.nameEn) : "—"}</dd>
              </div>
              <div className="definition-row">
                <dt>{locale === "zh" ? "表单版本" : "Form version"}</dt>
                <dd>{context.formVersion ? `${locale === "zh" ? context.formVersion.nameZh : context.formVersion.nameEn} · v${context.formVersion.version}` : "—"}</dd>
              </div>
              <div className="definition-row">
                <dt>{locale === "zh" ? "发生时间" : "Occurred"}</dt>
                <dd>{head?.occurredAt ? new Date(head.occurredAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US") : "—"}</dd>
              </div>
              <div className="definition-row">
                <dt>{locale === "zh" ? "当前版本" : "Current version"}</dt>
                <dd>v{head?.versionNumber ?? "-"}</dd>
              </div>
              <div className="definition-row">
                <dt>{locale === "zh" ? "创建时间" : "Created"}</dt>
                <dd>
                  {new Date(record.createdAt).toLocaleString(
                    locale === "zh" ? "zh-CN" : "en-US",
                  )}
                </dd>
              </div>
            </dl>
          </section>
          {reviewHistory.length ? (
            <section className="card record-review-history">
              <div className="card-section-heading compact"><span className="card-section-icon"><AppIcon name="review" /></span><h2>{locale === "zh" ? "审批记录" : "Approval history"}</h2></div>
              <ol>
                {reviewHistory.map(({ decision, reviewer }) => (
                  <li key={decision.id}>
                    <span className="record-review-marker"><AppIcon name="check" /></span>
                    <div><strong>{workflowLabel(decision.action, locale)}</strong><p>{reviewer.name} · {new Date(decision.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}</p>{decision.annotation ? <small>{decision.annotation}</small> : null}</div>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          {attachments.length ? (
            <section className="card stack-sm">
              <h2>{locale === "zh" ? "附件" : "Attachments"}</h2>
              <AttachmentGallery attachments={attachments} locale={locale} />
            </section>
          ) : null}
          {canArchive && aiConversationArtifacts.length && identity ? (
            <AiConversationArtifactList
              artifacts={aiConversationArtifacts}
              currentUserId={identity.userId}
              locale={locale}
              onChanged={load}
              recordId={record.id}
            />
          ) : null}
        </aside>
      </div>
      {canAsk ? (
        <AiCopilotPanel
          conversationTitle={recordCitationLabel({ id: record.id, sourceKind: record.sourceKind, occurredAt: head?.occurredAt, updatedAt: record.updatedAt }, locale)}
          description={locale === "zh" ? "围绕这条记录的已批准证据进行总结、质疑和共同梳理；未批准内容不会进入回答，外部公开视角会单独标示并附链接。" : "Summarize, challenge, and co-develop findings from this record's approved evidence. Unapproved content is excluded, while any public outside perspective is labeled and linked separately."}
          locale={locale}
          recordSnapshot={canArchive ? {
            recordId: record.id,
            title: recordCitationLabel({ id: record.id, sourceKind: record.sourceKind, occurredAt: head?.occurredAt, updatedAt: record.updatedAt }, locale),
            onSaved: load,
          } : undefined}
          scope={{ recordIds: [record.id] }}
          starterPrompts={[
            locale === "zh" ? "用三句话总结这条记录的已批准证据。" : "Summarize this record's approved evidence in three sentences.",
            locale === "zh" ? "哪些陈述是事实，哪些只是推断？" : "Which statements are facts and which are inferences?",
            locale === "zh" ? "还需要补充或核实什么？" : "What still needs to be added or verified?",
          ]}
          title={locale === "zh" ? "与 ChatGPT 共创这条记录" : "Co-create this record with ChatGPT"}
        />
      ) : null}
    </div>
  );
}
