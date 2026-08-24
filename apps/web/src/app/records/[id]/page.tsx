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
import { apiFetch, errorMessage } from "@/lib/api-client";

export default function RecordDetail() {
  const { t, locale } = useI18n();
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setData(
        await apiFetch<Record<string, unknown>>(`/api/v1/records/${params.id}`),
      );
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
  const attachments =
    (data.attachments as {
      id: string;
      kind: string;
      originalName?: string | null;
      status: string;
    }[]) ?? [];
  const head = versions[0];

  async function download() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/records/${params.id}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "json" }),
      });
      if (!response.ok) throw new Error("Download failed");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `record-${params.id}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <PageHeader
        eyebrow={`${locale === "zh" ? "记录" : "Record"} ${record.id.slice(0, 8).toUpperCase()}`}
        title={record.sourceKind}
        description={`${locale === "zh" ? "更新于" : "Updated"} ${new Date(record.updatedAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}`}
        actions={
          <>
            <Link className="button button-secondary" href="/records">
              <AppIcon name="back" />
              {locale === "zh" ? "返回" : "Back"}
            </Link>
            <button
              className="button"
              disabled={busy}
              onClick={download}
              type="button"
            >
              <AppIcon name="download" />
              JSON
            </button>
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
        <StatusPill tone="blue">{record.aiStatus}</StatusPill>
        <StatusPill>{record.researchUseStatus}</StatusPill>
      </div>
      <div className="detail-grid">
        <main className="stack">
          <section className="card">
            <h2>{t.qualitative}</h2>
            <p className="pre-wrap">
              {head?.qualitative ||
                (locale === "zh"
                  ? "未填写叙述内容。"
                  : "No narrative was supplied.")}
            </p>
          </section>
          {head?.structured && Object.keys(head.structured).length ? (
            <section className="card stack-sm">
              <h2>{locale === "zh" ? "结构化回答" : "Structured answers"}</h2>
              <pre className="code-preview">
                {JSON.stringify(head.structured, null, 2)}
              </pre>
            </section>
          ) : null}
          {findings.length ? (
            <section className="card stack">
              <h2>{locale === "zh" ? "已提取发现" : "Extracted findings"}</h2>
              {findings.map((finding, index) => (
                <div className="evidence" key={index}>
                  <StatusPill tone="violet">{finding.kind}</StatusPill>
                  <p className="pre-wrap" style={{ marginTop: 8 }}>
                    {finding.statement}
                  </p>
                </div>
              ))}
            </section>
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
        </main>
        <aside className="stack-sm">
          <section className="card">
            <h2>{locale === "zh" ? "记录信息" : "Record details"}</h2>
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
              {attachments.map((attachment) => (
                <div className="row-between" key={attachment.id}>
                  <span>
                    <strong>
                      {attachment.originalName ?? attachment.kind}
                    </strong>
                    <span className="caption" style={{ display: "block" }}>
                      {attachment.status}
                    </span>
                  </span>
                  <StatusPill>{attachment.kind}</StatusPill>
                </div>
              ))}
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
