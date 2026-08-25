"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  StatusPill,
} from "@/components/ui";
import { FieldAnswersPanel } from "@/features/records/FieldAnswersPanel";
import type { RecordFieldAnswer } from "@/features/records/types";
import { downloadRecord } from "@/features/records/api";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { AttachmentSummary } from "@cnpaf/shared";
import { AttachmentGallery } from "@/features/attachments/components/AttachmentGallery";

function readableKey(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function RecordDetail() {
  const { t, locale } = useI18n();
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [identity, setIdentity] = useState<{
    userId: string;
    permissions: string[];
  } | null>(null);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<"download" | "analysis" | "">("");

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
          actions={
            <Link className="button button-secondary" href="/records">
              <AppIcon name="back" />
              {locale === "zh" ? "返回" : "Back"}
            </Link>
          }
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
      createdAt: string;
    }[]) ?? [];
  const notes = (data.notes as { body: string }[]) ?? [];
  const findings =
    (data.findings as { kind: string; statement: string }[]) ?? [];
  const run = data.run as
    | { id: string; status: string; createdAt: string; completedAt?: string | null }
    | null
    | undefined;
  const attachments = (data.attachments as AttachmentSummary[]) ?? [];
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

  return (
    <div className="stack">
      <PageHeader
        eyebrow={`${locale === "zh" ? "记录" : "Record"} ${record.id.slice(0, 8).toUpperCase()}`}
        title={readableKey(record.sourceKind)}
        description={`${locale === "zh" ? "更新于" : "Updated"} ${new Date(record.updatedAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}`}
        actions={
          <>
            <Link className="button button-secondary" href="/records">
              <AppIcon name="back" />
              {locale === "zh" ? "返回" : "Back"}
            </Link>
            <button
              className="button"
              disabled={busyAction === "download"}
              onClick={download}
              type="button"
            >
              <AppIcon name="download" />
              JSON
            </button>
            {canCorrect && record.taskId ? (
              <Link className="button" href={`/tasks/${record.taskId}/collect`}>
                {locale === "zh" ? "补充并重新提交" : "Update and resubmit"}
              </Link>
            ) : null}
          </>
        }
      />
      {error ? <ErrorState message={error} /> : null}
      <div className="row">
        <StatusPill
          tone={record.reviewStatus === "approved" ? "green" : "amber"}
        >
          {record.reviewStatus}
        </StatusPill>
        <StatusPill tone={record.privacyStatus === "flagged" ? "red" : "green"}>
          {record.privacyStatus}
        </StatusPill>
        <StatusPill>{record.researchUseStatus}</StatusPill>
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
          {head?.structured && Object.keys(head.structured).length ? (
            <details className="advanced-panel record-raw-data">
              <summary>
                {locale === "zh" ? "查看原始结构化数据" : "View raw structured data"}
              </summary>
              <pre className="code-preview">{JSON.stringify(head.structured, null, 2)}</pre>
            </details>
          ) : null}
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
                <dd>{record.recordStatus}</dd>
              </div>
              <div className="definition-row">
                <dt>{locale === "zh" ? "当前版本" : "Current version"}</dt>
                <dd>v{head?.versionNumber ?? "—"}</dd>
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
          {attachments.length ? (
            <section className="card stack-sm">
              <h2>{locale === "zh" ? "附件" : "Attachments"}</h2>
              <AttachmentGallery attachments={attachments} locale={locale} />
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
