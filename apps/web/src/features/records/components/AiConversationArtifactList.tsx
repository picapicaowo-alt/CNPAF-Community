"use client";

import { useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { apiFetch, errorMessage } from "@/lib/api-client";

export type AiConversationArtifactSummary = {
  id: string;
  conversationId: string;
  title: string;
  status: string;
  currentRevision: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  version: {
    id: string;
    revisionNumber: number;
    mimeType: string;
    byteSize: number;
    contentSha256: string;
    messageCount: number;
    sourceCount: number;
    createdAt: string;
  };
};

function formatBytes(value: number) {
  return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KB`;
}

export function AiConversationArtifactList({
  artifacts,
  currentUserId,
  locale,
  onChanged,
  recordId,
}: {
  artifacts: AiConversationArtifactSummary[];
  currentUserId: string;
  locale: "zh" | "en";
  onChanged: () => Promise<void>;
  recordId: string;
}) {
  const [busy, setBusy] = useState("");
  const [editingId, setEditingId] = useState("");
  const [archiveId, setArchiveId] = useState("");
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  async function update(artifactId: string, body: Record<string, unknown>) {
    setBusy(artifactId);
    setError("");
    try {
      await apiFetch(`/api/v1/records/${recordId}/ai-conversation-artifacts/${artifactId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setEditingId("");
      setArchiveId("");
      setReason("");
      await onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="card ai-conversation-artifacts">
      <div className="card-section-heading compact">
        <span className="card-section-icon"><AppIcon name="file" /></span>
        <div>
          <h2>{locale === "zh" ? "AI 对话记录" : "AI conversation records"}</h2>
          <p>{locale === "zh" ? "Markdown 快照保留历史版本；更新不会覆盖原记录。" : "Markdown snapshots keep prior revisions; updates never overwrite history."}</p>
        </div>
      </div>
      {error ? <div className="feedback feedback-error" role="alert">{error}</div> : null}
      <div className="ai-artifact-list">
        {artifacts.map((artifact) => {
          const canManage = artifact.createdById === currentUserId;
          const isEditing = editingId === artifact.id;
          const isArchiving = archiveId === artifact.id;
          return (
            <article className="ai-artifact-item" key={artifact.id}>
              <div className="ai-artifact-main">
                <span className="ai-artifact-file-icon"><AppIcon name="file" /></span>
                <div>
                  {isEditing ? (
                    <label className="ai-artifact-title-field">
                      <span>{locale === "zh" ? "显示标题" : "Display title"}</span>
                      <input maxLength={140} onChange={(event) => setTitle(event.target.value)} value={title} />
                    </label>
                  ) : <strong>{artifact.title}</strong>}
                  <p>
                    v{artifact.version.revisionNumber} · {artifact.version.messageCount} {locale === "zh" ? "条消息" : "messages"} · {artifact.version.sourceCount} {locale === "zh" ? "个来源" : "sources"} · {formatBytes(artifact.version.byteSize)}
                  </p>
                  <small>{new Date(artifact.version.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}</small>
                </div>
              </div>
              {isArchiving ? (
                <div className="ai-artifact-archive-form">
                  <label>
                    {locale === "zh" ? "归档原因" : "Archive reason"}
                    <textarea maxLength={500} onChange={(event) => setReason(event.target.value)} rows={2} value={reason} />
                  </label>
                  <div className="row">
                    <button className="button button-danger button-small" disabled={busy === artifact.id || !reason.trim()} onClick={() => void update(artifact.id, { action: "archive", reason })} type="button">{locale === "zh" ? "确认归档" : "Confirm archive"}</button>
                    <button className="button button-ghost button-small" disabled={busy === artifact.id} onClick={() => { setArchiveId(""); setReason(""); }} type="button">{locale === "zh" ? "取消" : "Cancel"}</button>
                  </div>
                </div>
              ) : (
                <div className="ai-artifact-actions">
                  <a className="button button-secondary button-small" href={`/api/v1/records/${recordId}/ai-conversation-artifacts/${artifact.id}/download`}><AppIcon name="download" />{locale === "zh" ? "下载 Markdown" : "Download Markdown"}</a>
                  {canManage && isEditing ? (
                    <>
                      <button className="button button-small" disabled={busy === artifact.id || !title.trim()} onClick={() => void update(artifact.id, { action: "rename", title })} type="button">{locale === "zh" ? "保存标题" : "Save title"}</button>
                      <button className="button button-ghost button-small" disabled={busy === artifact.id} onClick={() => setEditingId("")} type="button">{locale === "zh" ? "取消" : "Cancel"}</button>
                    </>
                  ) : canManage ? (
                    <>
                      <button className="button button-secondary button-small" disabled={busy === artifact.id} onClick={() => void update(artifact.id, { action: "refresh" })} type="button"><AppIcon name="copy" />{locale === "zh" ? "更新快照" : "Update snapshot"}</button>
                      <button className="button button-ghost button-small" disabled={busy === artifact.id} onClick={() => { setEditingId(artifact.id); setTitle(artifact.title); }} type="button"><AppIcon name="edit" />{locale === "zh" ? "改标题" : "Rename"}</button>
                      <button className="button button-ghost button-small" disabled={busy === artifact.id} onClick={() => setArchiveId(artifact.id)} type="button"><AppIcon name="trash" />{locale === "zh" ? "归档" : "Archive"}</button>
                    </>
                  ) : null}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
