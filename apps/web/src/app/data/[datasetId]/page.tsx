"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { AiPromptComposer } from "@/components/AiPromptComposer";
import { AskMarkdownMessage } from "@/components/AskMarkdownMessage";
import { AiSourceList, type AiDisplaySource } from "@/components/AiSourceList";
import { useI18n } from "@/components/LocaleProvider";
import { ErrorState, LoadingState, StatusPill } from "@/components/ui";
import {
  archiveDataset,
  downloadDataset,
  fetchDatasetDetail,
  revokeDatasetShare,
  shareDataset,
} from "@/features/datasets/api";
import type { DatasetDetail } from "@/features/datasets/types";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { OpenAiModelId } from "@/lib/openai-model-catalog";
import { AttachmentGallery } from "@/features/attachments/components/AttachmentGallery";
import { recordCitationLabel } from "@/features/records/display";

type WorkspaceTab = "analysis" | "records" | "report";
type AskMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  metadata?: {
    attachments?: Array<{ id: string; name: string; mimeType: string; byteSize: number }>;
    modelName?: string;
  };
};
type AskSource = AiDisplaySource & {
  messageId: string;
  sourceId: string;
};
type AskBundle = {
  conversation: { id: string; title?: string | null };
  messages: AskMessage[];
  sources: AskSource[];
};

const reportSections = [
  {
    sectionKey: "executive-summary",
    titleZh: "执行摘要",
    titleEn: "Executive summary",
    instructionZh: "根据该数据集中的已批准证据，起草一份简洁的执行摘要，标明关键数量、趋势和证据边界。",
    instructionEn: "Draft a concise executive summary from the approved evidence in this dataset, noting key quantities, patterns, and evidence limits.",
  },
  {
    sectionKey: "key-findings",
    titleZh: "主要发现",
    titleEn: "Key findings",
    instructionZh: "归纳数据集中最重要的主题、共性和差异，每个实质性结论都必须依据可验证的已批准证据。",
    instructionEn: "Synthesize the most important themes, commonalities, and differences. Ground every substantive conclusion in verifiable approved evidence.",
  },
  {
    sectionKey: "gaps-next-steps",
    titleZh: "数据缺口与后续建议",
    titleEn: "Data gaps and next steps",
    instructionZh: "指出当前证据不足、需要进一步核实的问题，并给出谨慎的后续数据采集建议。",
    instructionEn: "Identify evidence gaps and questions requiring verification, then propose cautious next-step data collection actions.",
  },
] as const;

function shortHash(value?: string | null) {
  return value ? `${value.slice(0, 10)}…${value.slice(-6)}` : "—";
}

export default function DatasetWorkspacePage() {
  const { locale } = useI18n();
  const router = useRouter();
  const { datasetId } = useParams<{ datasetId: string }>();
  const [detail, setDetail] = useState<DatasetDetail | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("analysis");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [conversation, setConversation] = useState<AskBundle | null>(null);
  const [question, setQuestion] = useState("");
  const [createdReportId, setCreatedReportId] = useState("");
  const [reportNotice, setReportNotice] = useState("");
  const [recipientLabel, setRecipientLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const [includeMedia, setIncludeMedia] = useState(false);
  const [model, setModel] = useState<OpenAiModelId>("gpt-5.6-terra");
  const [files, setFiles] = useState<File[]>([]);
  const [privacyAttested, setPrivacyAttested] = useState(false);

  const load = useCallback(async (versionId?: string) => {
    setLoading(true);
    setError("");
    try {
      const [result, me] = await Promise.all([
        fetchDatasetDetail(datasetId, versionId),
        apiFetch<{ permissions: string[] }>("/api/v1/auth/me"),
      ]);
      setDetail(result);
      setPermissions(me.permissions ?? []);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [datasetId]);

  useEffect(() => {
    const versionId = new URLSearchParams(window.location.search).get("versionId");
    void load(versionId ?? undefined);
  }, [load]);

  const sourcesByMessage = useMemo(() => {
    const map = new Map<string, AskSource[]>();
    for (const source of conversation?.sources ?? []) {
      map.set(source.messageId, [...(map.get(source.messageId) ?? []), source]);
    }
    return map;
  }, [conversation]);

  if (loading && !detail) return <LoadingState rows={6} />;
  if (!detail)
    return (
      <ErrorState
        message={error || (locale === "zh" ? "无法加载数据集" : "Unable to load dataset")}
        retry={() => load()}
      />
    );

  const { dataset, selectedVersion } = detail;
  const active = dataset.status === "active";
  const canAsk =
    active &&
    dataset.dataClassification === "approved_evidence" &&
    selectedVersion?.status === "ready" &&
    permissions.some((permission) =>
      ["chat.ask_collect", "ask_collect.use"].includes(permission),
    );
  const canReport =
    active &&
    dataset.dataClassification === "approved_evidence" &&
    selectedVersion?.status === "ready" &&
    permissions.includes("reports.edit");
  const canShare = active && permissions.includes("datasets.share");
  const canArchive = active && permissions.includes("datasets.archive");
  const hasMedia = detail.mediaSummary.total > 0;

  async function changeVersion(versionId: string) {
    setConversationId("");
    setConversation(null);
    setCreatedReportId("");
    setReportNotice("");
    setIncludeMedia(false);
    await load(versionId);
    router.replace(`/data/${datasetId}?versionId=${versionId}`);
  }

  async function loadConversation(id: string) {
    setConversation(
      await apiFetch<AskBundle>(`/api/v1/ask-collect/conversations/${id}`),
    );
  }

  async function ask(nextQuestion = question, selectedFiles = files) {
    const content = nextQuestion.trim();
    if (!content || !selectedVersion || !canAsk) return;
    setBusy("ask");
    setError("");
    try {
      let id = conversationId;
      if (!id) {
        const result = await apiFetch<{ conversation: { id: string } }>(
          "/api/v1/ask-collect/conversations",
          {
            method: "POST",
            body: JSON.stringify({
              title: `${dataset.name} ${locale === "zh" ? "AI 分析" : "AI analysis"}`,
              datasetVersionId: selectedVersion.id,
              includeMedia,
              scope: {},
            }),
          },
        );
        id = result.conversation.id;
        setConversationId(id);
      }
      if (selectedFiles.length) {
        const formData = new FormData();
        formData.set("content", content);
        formData.set("modelName", model);
        formData.set("privacyAttested", String(privacyAttested));
        for (const file of selectedFiles) formData.append("files", file);
        await apiFetch(`/api/v1/ask-collect/conversations/${id}/messages`, {
          method: "POST",
          body: formData,
        });
      } else {
        await apiFetch(`/api/v1/ask-collect/conversations/${id}/messages`, {
          method: "POST",
          body: JSON.stringify({ content, modelName: model, privacyAttested: false }),
        });
      }
      setQuestion("");
      setFiles([]);
      setPrivacyAttested(false);
      await loadConversation(id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  async function generateInitialReport() {
    if (!selectedVersion || !canReport) return;
    setBusy("report");
    setError("");
    setReportNotice("");
    try {
      const result = await apiFetch<{
        report: { id: string };
        sections: Array<{ id: string; sectionKey: string }>;
      }>("/api/v1/reports", {
        method: "POST",
        body: JSON.stringify({
          organizationId: dataset.organizationId,
          programId: dataset.programId ?? null,
          reportTemplateVersionId: null,
          sourceReportArtifactId: null,
          sourceDatasetVersionId: selectedVersion.id,
          title: `${dataset.name}${locale === "zh" ? "—初步报告" : " — Initial report"}`,
          filters: {},
          evidencePolicy: { approvedOnly: true, researchUseEligible: true },
          sections: reportSections.map((section, index) => ({
            sectionKey: section.sectionKey,
            title: locale === "zh" ? section.titleZh : section.titleEn,
            content: "",
            sortOrder: index,
          })),
        }),
      });
      const drafts = await Promise.allSettled(
        result.sections.map((section) => {
          const definition = reportSections.find(
            (item) => item.sectionKey === section.sectionKey,
          )!;
          return apiFetch(`/api/v1/report-sections/${section.id}/ai-draft`, {
            method: "POST",
            body: JSON.stringify({
              instruction:
                locale === "zh" ? definition.instructionZh : definition.instructionEn,
              workflowVersionId: null,
              idempotencyKey: `dataset-${selectedVersion.id}-${section.id}`,
              includeMedia,
            }),
          });
        }),
      );
      setCreatedReportId(result.report.id);
      setActiveTab("report");
      setReportNotice(
        drafts.some((draft) => draft.status === "rejected")
          ? locale === "zh"
            ? "报告已创建，部分 AI 章节需在编辑器中重新生成。"
            : "The report was created; some AI sections need to be regenerated in the editor."
          : locale === "zh"
            ? "AI 初稿已生成，请打开报告审阅和采纳。"
            : "AI drafts are ready. Open the report to review and accept them.",
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  async function runDownload(format: "csv" | "json") {
    if (!selectedVersion) return;
    setBusy(`download-${format}`);
    setError("");
    try {
      await downloadDataset(dataset, format, selectedVersion.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  async function createShare() {
    if (!selectedVersion) return;
    setBusy("share");
    setError("");
    setShareLink("");
    try {
      const result = await shareDataset({
        datasetId,
        datasetVersionId: selectedVersion.id,
        recipientLabel: recipientLabel.trim() || null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      setShareLink(`${window.location.origin}/shared-datasets/${result.token}`);
      setRecipientLabel("");
      setExpiresAt("");
      await load(selectedVersion.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  async function revoke(shareId: string) {
    if (!selectedVersion) return;
    setBusy(shareId);
    setError("");
    try {
      await revokeDatasetShare(shareId);
      await load(selectedVersion.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  async function archive() {
    if (!archiveReason.trim()) return;
    setBusy("archive");
    setError("");
    try {
      await archiveDataset(datasetId, archiveReason.trim());
      setArchiveReason("");
      await load(selectedVersion?.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  const promptSuggestions = locale === "zh"
    ? ["总结这批数据的主要发现", "比较不同地点的共性与差异", "指出数据缺口和需要进一步核实的事项"]
    : ["Summarize the main findings", "Compare commonalities and differences across locations", "Identify data gaps that require verification"];

  return (
    <div className="stack dataset-workspace-page">
      <header className="dataset-workspace-header">
        <div className="dataset-title-row">
          <div>
            <div className="row dataset-title-meta">
              <StatusPill tone={active ? "green" : "neutral"}>
                {active ? (locale === "zh" ? "可用" : "Active") : dataset.status}
              </StatusPill>
              <span>{selectedVersion ? `v${selectedVersion.versionNumber}` : "—"}</span>
              <span>
                {dataset.dataClassification === "approved_evidence"
                  ? locale === "zh" ? "已批准证据" : "Approved evidence"
                  : locale === "zh" ? "受限数据" : "Restricted data"}
              </span>
            </div>
            <h1>{dataset.name}</h1>
            <p>{dataset.description || (locale === "zh" ? "从现有记录中勾选成组的数据集" : "A dataset grouped from existing records")}</p>
          </div>
          <div className="row dataset-header-actions">
            <button className="button button-secondary" disabled={busy.startsWith("download")} onClick={() => runDownload("csv")} type="button">
              <AppIcon name="download" />{locale === "zh" ? "导出" : "Export"}
            </button>
            {canReport ? (
              <button className="button" disabled={busy === "report"} onClick={generateInitialReport} type="button">
                <AppIcon name="reports" />
                {busy === "report"
                  ? locale === "zh" ? "正在生成…" : "Generating…"
                  : locale === "zh" ? "生成初步报告" : "Generate initial report"}
              </button>
            ) : null}
          </div>
        </div>
        <div className="dataset-summary-bar">
          <span><strong>{selectedVersion?.recordCount ?? 0}</strong>{locale === "zh" ? "条记录" : "records"}</span>
          <span><strong>{new Set(detail.records.map((record) => record.site?.id).filter(Boolean)).size}</strong>{locale === "zh" ? "个地点" : "locations"}</span>
          <span><strong>{new Set(detail.records.map((record) => record.collector.id)).size}</strong>{locale === "zh" ? "位采集人" : "collectors"}</span>
          <span><strong>{detail.mediaSummary.total}</strong>{locale === "zh" ? "个附件" : "attachments"}</span>
          <span><strong>{new Date(dataset.updatedAt).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US")}</strong>{locale === "zh" ? "最近更新" : "last updated"}</span>
        </div>
      </header>

      {error ? <ErrorState message={error} retry={() => load(selectedVersion?.id)} /> : null}

      <nav className="dataset-workspace-tabs" aria-label={locale === "zh" ? "数据集工作区" : "Dataset workspace"}>
        {([
          ["analysis", locale === "zh" ? "AI 分析" : "AI analysis", "sparkles"],
          ["records", locale === "zh" ? `记录 (${detail.records.length})` : `Records (${detail.records.length})`, "records"],
          ["report", locale === "zh" ? "初步报告" : "Initial report", "reports"],
        ] as const).map(([key, label, icon]) => (
          <button className={activeTab === key ? "active" : ""} key={key} onClick={() => setActiveTab(key)} type="button">
            <AppIcon name={icon} />{label}
          </button>
        ))}
      </nav>

      {activeTab === "analysis" ? (
        <div className="dataset-analysis-layout">
          <section className="card dataset-ai-panel">
            <div className="dataset-ai-heading">
              <span className="dataset-ai-avatar"><AppIcon name="sparkles" /></span>
              <div><h2>{locale === "zh" ? "与数据集 AI 分析员对话" : "Chat with the dataset analyst"}</h2><p>{locale === "zh" ? `内部结论以 ${selectedVersion?.recordCount ?? 0} 条已冻结记录中的已批准证据${includeMedia ? "和已确认附件" : ""}为准；AI 可检索公开来源补充视角，并附上链接。` : `Internal findings remain grounded in approved evidence${includeMedia ? " and confirmed attachments" : ""} from these ${selectedVersion?.recordCount ?? 0} frozen records. AI may add linked public sources for outside perspective.`}</p></div>
            </div>
            <div className="dataset-chat-messages" aria-live="polite">
              {!conversation?.messages.length ? (
                <div className="dataset-ai-welcome">
                  <strong>{locale === "zh" ? "你想先了解什么？" : "What would you like to understand first?"}</strong>
                  <p>{locale === "zh" ? "我可以帮你归纳发现、比较地点、识别缺口，并为初步报告准备结构。" : "I can summarize findings, compare locations, identify gaps, and prepare a structure for an initial report."}</p>
                  <div className="dataset-prompt-grid">
                    {promptSuggestions.map((prompt) => <button disabled={!canAsk || busy === "ask"} key={prompt} onClick={() => void ask(prompt)} type="button">{prompt}<AppIcon name="arrow" /></button>)}
                  </div>
                </div>
              ) : conversation.messages.map((message) => (
                <article className={`dataset-chat-message ${message.role}`} key={message.id}>
                  <AskMarkdownMessage
                    content={message.content}
                    locale={locale}
                    sources={sourcesByMessage.get(message.id) ?? []}
                  />
                  {message.metadata?.attachments?.length ? (
                    <div className="ai-message-attachments">
                      {message.metadata.attachments.map((attachment) => (
                        <span key={attachment.id}><AppIcon name={attachment.mimeType.startsWith("image/") ? "image" : "file"} size={15} />{attachment.name}</span>
                      ))}
                    </div>
                  ) : null}
                  <AiSourceList locale={locale} sources={sourcesByMessage.get(message.id) ?? []} />
                </article>
              ))}
              {busy === "ask" ? <div className="dataset-ai-thinking"><span /><span /><span />{locale === "zh" ? "正在检索内部证据与外部视角…" : "Reviewing internal evidence and external context…"}</div> : null}
            </div>
            <div className="dataset-chat-compose">
              {hasMedia ? (
                <label className="dataset-media-consent">
                  <input
                    checked={includeMedia}
                    disabled={!canAsk || busy === "ask"}
                    onChange={(event) => {
                      setIncludeMedia(event.target.checked);
                      setConversationId("");
                      setConversation(null);
                    }}
                    type="checkbox"
                  />
                  <span>
                    <strong>{locale === "zh" ? "将已审查附件纳入本次 AI 分析" : "Include reviewed attachments in this AI analysis"}</strong>
                    <span>{locale === "zh"
                      ? "勾选后，已通过隐私检查的图片、PDF、DOCX、XLSX、CSV 和文本文件可发送给配置的 AI 服务；音频和视频仍只供查看或下载。"
                      : "When selected, privacy-reviewed images, PDFs, DOCX, XLSX, CSV, and text files may be sent to the configured AI service. Audio and video remain view/download only."}</span>
                  </span>
                </label>
              ) : null}
              <AiPromptComposer
                disabled={!canAsk}
                files={files}
                locale={locale}
                model={model}
                onFilesChange={setFiles}
                onModelChange={setModel}
                onPrivacyAttestedChange={setPrivacyAttested}
                onSubmit={() => void ask(question, files)}
                onValueChange={setQuestion}
                placeholder={canAsk ? (locale === "zh" ? "询问这个数据集，或上传文件一起分析…" : "Ask about this dataset or attach files to analyze…") : !active ? (locale === "zh" ? "数据集已归档，AI 分析不可用" : "This dataset is archived; AI analysis is unavailable") : dataset.dataClassification !== "approved_evidence" ? (locale === "zh" ? "受限数据不可用于此 AI 工作流" : "Restricted data cannot be used in this AI workflow") : (locale === "zh" ? "当前账号没有 AI 问答权限" : "AI Q&A is not available for this account")}
                privacyAttested={privacyAttested}
                scopeNote={locale === "zh" ? "已锁定当前数据集版本" : "Locked to this Dataset Version"}
                sending={busy === "ask"}
                value={question}
              />
            </div>
          </section>
          <aside className="card dataset-context-panel">
            <div><span className="eyebrow">{locale === "zh" ? "分析范围" : "Analysis scope"}</span><h2>{locale === "zh" ? "数据集上下文" : "Dataset context"}</h2></div>
            <dl><div><dt>{locale === "zh" ? "版本" : "Version"}</dt><dd>v{selectedVersion?.versionNumber ?? "—"}</dd></div><div><dt>{locale === "zh" ? "记录" : "Records"}</dt><dd>{selectedVersion?.recordCount ?? 0}</dd></div><div><dt>{locale === "zh" ? "附件" : "Attachments"}</dt><dd>{detail.mediaSummary.total} ({locale === "zh" ? `图片 ${detail.mediaSummary.images} · 文档 ${detail.mediaSummary.documents}` : `Images ${detail.mediaSummary.images} · Documents ${detail.mediaSummary.documents}`})</dd></div><div><dt>{locale === "zh" ? "分类" : "Classification"}</dt><dd>{dataset.dataClassification === "approved_evidence" ? (locale === "zh" ? "已批准证据" : "Approved evidence") : (locale === "zh" ? "受限数据" : "Restricted data")}</dd></div><div><dt>SHA-256</dt><dd className="mono-small">{shortHash(selectedVersion?.contentHash)}</dd></div></dl>
            <div className="dataset-context-note"><AppIcon name="check" /><span><strong>{locale === "zh" ? "可追溯回答" : "Traceable answers"}</strong>{locale === "zh" ? "AI 回答会区分内部证据与外部参考，外部来源附可点击链接。" : "AI answers distinguish internal evidence from external references and link every external source."}</span></div>
            {canReport ? <button className="button button-secondary button-wide" disabled={busy === "report"} onClick={generateInitialReport} type="button"><AppIcon name="reports" />{locale === "zh" ? "用这批数据生成报告" : "Generate a report"}</button> : null}
          </aside>
        </div>
      ) : null}

      {activeTab === "records" ? (
        <section className="card stack dataset-records-panel">
          <div className="row-between"><div><h2>{locale === "zh" ? "数据集中的记录" : "Records in this dataset"}</h2><p className="muted">{locale === "zh" ? "每一行都锁定创建数据集时的精确记录版本。" : "Each row is pinned to the exact record version captured at creation."}</p></div><button className="button button-secondary button-small" onClick={() => runDownload("csv")} type="button"><AppIcon name="download" />CSV</button></div>
          <div className="table-shell"><div className="table-scroll"><table className="data-table"><thead><tr><th>#</th><th>{locale === "zh" ? "记录" : "Record"}</th><th>{locale === "zh" ? "地点" : "Location"}</th><th>{locale === "zh" ? "项目" : "Program"}</th><th>{locale === "zh" ? "采集人" : "Collector"}</th><th>{locale === "zh" ? "附件" : "Attachments"}</th><th>{locale === "zh" ? "发生时间" : "Occurred"}</th></tr></thead><tbody>{detail.records.map((record) => <tr key={record.recordVersionId}><td>{record.ordinal + 1}</td><td><Link className="table-link" href={`/records/${record.id}`}>{recordCitationLabel(record, locale)}</Link></td><td><strong>{record.site?.name ?? "—"}</strong></td><td>{locale === "zh" ? record.program?.nameZh : record.program?.nameEn}</td><td>{record.collector.name ?? record.collector.id.slice(0, 8)}</td><td>{record.attachments.length ? <AttachmentGallery attachments={record.attachments} compact locale={locale} /> : "—"}</td><td>{record.occurredAt ? new Date(record.occurredAt).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US") : "—"}</td></tr>)}</tbody></table></div></div>
        </section>
      ) : null}

      {activeTab === "report" ? (
        <section className="card dataset-report-panel">
          <span className="dataset-report-icon"><AppIcon name="reports" /></span>
          <div><span className="eyebrow">{locale === "zh" ? "从数据到报告" : "From data to report"}</span><h2>{createdReportId ? (locale === "zh" ? "初步报告已准备好" : "Initial report is ready") : (locale === "zh" ? "生成可编辑的初步报告" : "Generate an editable initial report")}</h2><p>{reportNotice || (locale === "zh" ? "AI 以当前冻结的 Dataset Version 为内部证据基础，并可引用有链接的公开来源补充背景。生成后需由人工审阅和采纳。" : "AI grounds the draft in this frozen Dataset Version and may cite linked public sources for additional context. Human review is required.")}</p></div>
          <div className="dataset-report-outline">{reportSections.map((section, index) => <div key={section.sectionKey}><span>{index + 1}</span><strong>{locale === "zh" ? section.titleZh : section.titleEn}</strong></div>)}</div>
          {!createdReportId && hasMedia ? (
            <label className="dataset-media-consent">
              <input checked={includeMedia} disabled={!canReport || busy === "report"} onChange={(event) => setIncludeMedia(event.target.checked)} type="checkbox" />
              <span><strong>{locale === "zh" ? "将已审查附件纳入报告初稿" : "Include reviewed attachments in the report draft"}</strong><span>{locale === "zh" ? "勾选后，支持的图片和文档会发送给报告模型；音频与视频仍不会发送。" : "When selected, supported images and documents are sent to the report model; audio and video are still excluded."}</span></span>
            </label>
          ) : null}
          {createdReportId ? <Link className="button" href={`/reports/${createdReportId}/edit`}><AppIcon name="arrow" />{locale === "zh" ? "打开报告并审阅 AI 初稿" : "Open report and review AI drafts"}</Link> : canReport ? <button className="button" disabled={busy === "report"} onClick={generateInitialReport} type="button"><AppIcon name="sparkles" />{busy === "report" ? (locale === "zh" ? "正在生成初稿…" : "Generating drafts…") : (locale === "zh" ? "生成初步报告" : "Generate initial report")}</button> : null}
        </section>
      ) : null}

      <details className="card dataset-governance-panel">
        <summary><span><AppIcon name="settings" /><strong>{locale === "zh" ? "版本、分享与数据管理" : "Versions, sharing, and data management"}</strong></span><span className="caption">{locale === "zh" ? "高级设置" : "Advanced"}</span></summary>
        <div className="stack dataset-governance-content">
          <div className="row-between mobile-stack"><label>{locale === "zh" ? "当前版本" : "Current version"}<select onChange={(event) => void changeVersion(event.target.value)} value={selectedVersion?.id ?? ""}>{detail.versions.map((version) => <option key={version.id} value={version.id}>v{version.versionNumber} · {version.recordCount} {locale === "zh" ? "条" : "records"}</option>)}</select></label><div className="row"><button className="button button-secondary button-small" onClick={() => runDownload("csv")} type="button">CSV</button><button className="button button-secondary button-small" onClick={() => runDownload("json")} type="button">JSON</button></div></div>
          {permissions.includes("datasets.share") ? <section className="dataset-management-section stack-sm"><div><h3>{locale === "zh" ? "受控分享" : "Controlled sharing"}</h3><p className="muted">{locale === "zh" ? "分享链接始终锁定当前 Dataset Version。" : "Share links always pin the current Dataset Version."}</p></div>{canShare ? <div className="field-grid"><label>{locale === "zh" ? "接收方标签" : "Recipient label"}<input onChange={(event) => setRecipientLabel(event.target.value)} value={recipientLabel} /></label><label>{locale === "zh" ? "到期时间（可选）" : "Expiry (optional)"}<input onChange={(event) => setExpiresAt(event.target.value)} type="datetime-local" value={expiresAt} /></label><div className="field-action"><button className="button button-secondary" disabled={busy === "share"} onClick={createShare} type="button">{locale === "zh" ? "创建分享链接" : "Create share link"}</button></div></div> : null}{shareLink ? <div className="feedback feedback-info"><input readOnly value={shareLink} /><button className="button button-secondary button-small" onClick={() => navigator.clipboard.writeText(shareLink)} type="button">{locale === "zh" ? "复制" : "Copy"}</button></div> : null}{detail.shares.filter((share) => share.status === "active").map((share) => <div className="row-between" key={share.id}><span>{share.recipientLabel || (locale === "zh" ? "未命名接收方" : "Unnamed recipient")}</span><button className="button button-ghost button-small" disabled={busy === share.id} onClick={() => revoke(share.id)} type="button">{locale === "zh" ? "撤销" : "Revoke"}</button></div>)}</section> : null}
          {canArchive ? <section className="dataset-management-section stack-sm"><h3>{locale === "zh" ? "归档数据集" : "Archive dataset"}</h3><textarea onChange={(event) => setArchiveReason(event.target.value)} placeholder={locale === "zh" ? "填写归档原因（必填）" : "Archive reason (required)"} rows={2} value={archiveReason} /><button className="button button-secondary button-small" disabled={busy === "archive" || !archiveReason.trim()} onClick={archive} type="button">{locale === "zh" ? "归档数据集" : "Archive dataset"}</button></section> : null}
        </div>
      </details>
    </div>
  );
}
