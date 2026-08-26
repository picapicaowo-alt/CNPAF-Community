"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { AiCopilotPanel } from "@/components/AiCopilotPanel";
import { useI18n } from "@/components/LocaleProvider";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  StatusPill,
} from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";

type Report = { id: string; title: string; status: string; updatedAt: string };
type Version = {
  id: string;
  versionNumber: number;
  status: string;
  title: string;
};
type Section = {
  id: string;
  sectionKey: string;
  title: string;
  content: string;
  sortOrder: number;
  aiSuggestion?: string | null;
  aiSuggestionStatus: string;
  lastEditedBy?: { name: string } | null;
  updatedAt: string;
};
type Bundle = {
  report: Report;
  versions: Version[];
  headVersion: Version | null;
  sections: Section[];
  sourceDataset: {
    dataset: { id: string; name: string };
    version: { id: string; versionNumber: number; recordCount: number; contentHash: string };
  } | null;
};

export default function ReportEditorPage() {
  const { locale } = useI18n();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Bundle | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [saveState, setSaveState] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try {
      const [bundle, me] = await Promise.all([
        apiFetch<Bundle>(`/api/v1/reports/${id}`),
        apiFetch<{ permissions: string[] }>("/api/v1/auth/me"),
      ]);
      setData(bundle);
      setPermissions(me.permissions ?? []);
      const first = bundle.sections[0];
      setSelectedId((current) =>
        bundle.sections.some((section) => section.id === current)
          ? current
          : (first?.id ?? ""),
      );
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  const selected = useMemo(
    () => data?.sections.find((section) => section.id === selectedId) ?? null,
    [data, selectedId],
  );
  useEffect(() => {
    setDraftTitle(selected?.title ?? "");
    setDraftContent(selected?.content ?? "");
    setSaveState("");
  }, [selected]);
  const editable = Boolean(
    data?.headVersion?.status === "draft" &&
      permissions.includes("reports.edit"),
  );
  const canAsk = permissions.some((permission) => ["chat.ask_collect", "ask_collect.use"].includes(permission));
  async function save() {
    if (!selected || !draftTitle.trim() || !editable) return;
    setBusy(true);
    setError("");
    setSaveState(locale === "zh" ? "正在保存" : "Saving");
    try {
      await apiFetch(`/api/v1/report-sections/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: draftTitle.trim(),
          content: draftContent,
        }),
      });
      await load();
      setSaveState(locale === "zh" ? "已保存" : "Saved");
    } catch (caught) {
      setError(errorMessage(caught));
      setSaveState("");
    } finally {
      setBusy(false);
    }
  }
  async function addSection() {
    if (!data?.headVersion || !editable) return;
    const title = prompt(locale === "zh" ? "新章节标题" : "New section title");
    if (!title?.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<{ section: Section }>(
        `/api/v1/report-versions/${data.headVersion.id}/sections`,
        {
          method: "POST",
          body: JSON.stringify({
            sectionKey: `section-${crypto.randomUUID().slice(0, 8)}`,
            title: title.trim(),
            content: "",
            sortOrder: data.sections.length,
          }),
        },
      );
      await load();
      setSelectedId(result.section.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function duplicate() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<{ section: Section }>(
        `/api/v1/report-sections/${selected.id}/duplicate`,
        {
          method: "POST",
          body: JSON.stringify({
            title: `${selected.title} (${locale === "zh" ? "副本" : "copy"})`,
          }),
        },
      );
      await load();
      setSelectedId(result.section.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !selected ||
      !confirm(locale === "zh" ? "移除此章节？" : "Remove this section?")
    )
      return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/v1/report-sections/${selected.id}`, {
        method: "DELETE",
      });
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (
      !data?.headVersion ||
      !confirm(
        locale === "zh"
          ? "发布当前报告版本？发布后内容将不可修改。"
          : "Publish this report version? Its content will become immutable.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/v1/report-versions/${data.headVersion.id}/publish`, {
        method: "POST",
      });
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function generateAiDraft() {
    if (!selected || !editable) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/v1/report-sections/${selected.id}/ai-draft`, {
        method: "POST",
        body: JSON.stringify({
          instruction:
            locale === "zh"
              ? `使用已绑定的 Dataset 证据为“${selected.title}”章节起草一份谨慎、可追溯的初稿。`
              : `Draft a cautious, traceable ${selected.title} section using the bound Dataset evidence.`,
          workflowVersionId: null,
          idempotencyKey: `report-editor-${selected.id}-${crypto.randomUUID()}`,
        }),
      });
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function resolveAiSuggestion(action: "accept" | "dismiss") {
    if (!selected || !editable) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/v1/report-sections/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ aiSuggestionAction: action }),
      });
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  if (!data && !error)
    return (
      <>
        <PageHeader title={locale === "zh" ? "报告编辑器" : "Report editor"} />
        <LoadingState rows={6} />
      </>
    );
  return (
    <div className="stack">
      <PageHeader
        eyebrow={locale === "zh" ? "报告编辑器" : "Report editor"}
        title={data?.report.title ?? (locale === "zh" ? "报告" : "Report")}
        description={
          data?.headVersion
            ? `${locale === "zh" ? "版本" : "Version"} ${data.headVersion.versionNumber} · ${data.headVersion.status}`
            : undefined
        }
        actions={
          <>
            <Link className="button button-secondary" href="/reports">
              <AppIcon name="back" />
              {locale === "zh" ? "返回报告" : "Reports"}
            </Link>
            {editable && permissions.includes("reports.publish") ? (
              <button
                className="button"
                disabled={busy}
                onClick={publish}
                type="button"
              >
                <AppIcon name="check" />
                {locale === "zh" ? "发布" : "Publish"}
              </button>
            ) : null}
          </>
        }
      />
      {error ? <ErrorState message={error} retry={load} /> : null}
      {data?.sourceDataset ? (
        <div className="feedback feedback-info">
          <span>
            {locale === "zh" ? "来源 Dataset" : "Source Dataset"}: {" "}
            <Link href={`/data/${data.sourceDataset.dataset.id}?versionId=${data.sourceDataset.version.id}`}>
              <strong>{data.sourceDataset.dataset.name} · v{data.sourceDataset.version.versionNumber}</strong>
            </Link>
            {` · ${data.sourceDataset.version.recordCount} ${locale === "zh" ? "条冻结记录" : "frozen records"}`}
          </span>
        </div>
      ) : null}
      {!editable && data ? (
        <div className="feedback feedback-info">
          <span>
            {locale === "zh"
              ? "这是已发布的只读版本。需要修改时，请先创建新的草稿版本。"
              : "This is a published read-only version. Create a new draft version before editing."}
          </span>
        </div>
      ) : null}
      {data ? (
        <div className="editor-layout">
          <aside className="editor-sidebar">
            <section className="card">
              <div className="row-between">
                <h2>{locale === "zh" ? "章节" : "Sections"}</h2>
                <StatusPill
                  tone={
                    data.headVersion?.status === "published" ? "green" : "amber"
                  }
                >
                  {data.headVersion?.status ?? "—"}
                </StatusPill>
              </div>
              <div className="section-picker">
                {data.sections.map((section, index) => (
                  <button
                    className={selectedId === section.id ? "active" : ""}
                    key={section.id}
                    onClick={() => setSelectedId(section.id)}
                    type="button"
                  >
                    <span>
                      {index + 1}. {section.title}
                    </span>
                    <span className="caption">{section.content.length}</span>
                  </button>
                ))}
              </div>
              {editable ? (
                <button
                  className="button button-secondary button-wide button-small"
                  disabled={busy}
                  onClick={addSection}
                  type="button"
                >
                  <AppIcon name="plus" />
                  {locale === "zh" ? "添加章节" : "Add section"}
                </button>
              ) : null}
            </section>
            <section className="card stack-sm">
              <h3>{locale === "zh" ? "版本" : "Versions"}</h3>
              {data.versions.map((version) => (
                <div className="row-between" key={version.id}>
                  <span className="muted">v{version.versionNumber}</span>
                  <StatusPill
                    tone={version.status === "published" ? "green" : "amber"}
                  >
                    {version.status}
                  </StatusPill>
                </div>
              ))}
            </section>
          </aside>
          <main className="editor-canvas">
            {selected ? (
              <section className="card editor-section">
                <div className="editor-toolbar">
                  <div>
                    <div className="eyebrow">{selected.sectionKey}</div>
                    <h2>{locale === "zh" ? "编辑章节" : "Edit section"}</h2>
                  </div>
                  <div className="editor-toolbar-group">
                    {saveState ? (
                      <span className="save-state">{saveState}</span>
                    ) : null}
                    {editable ? (
                      <>
                        <button
                          className="button button-secondary button-small"
                          disabled={busy}
                          onClick={duplicate}
                          type="button"
                        >
                          {locale === "zh" ? "复制" : "Duplicate"}
                        </button>
                        <button
                          className="button button-ghost button-small"
                          disabled={busy || data.sections.length <= 1}
                          onClick={remove}
                          type="button"
                        >
                          {locale === "zh" ? "移除" : "Remove"}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                <label>
                  {locale === "zh" ? "章节标题" : "Section title"}
                  <input
                    disabled={!editable}
                    maxLength={500}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    value={draftTitle}
                  />
                </label>
                <label>
                  {locale === "zh" ? "内容" : "Content"}
                  <textarea
                    disabled={!editable}
                    onChange={(event) => setDraftContent(event.target.value)}
                    placeholder={
                      locale === "zh"
                        ? "使用清晰语言编写，并引用可验证证据…"
                        : "Write clearly and cite verifiable evidence…"
                    }
                    style={{ minHeight: 380 }}
                    value={draftContent}
                  />
                </label>
                <div className="row-between mobile-stack">
                  <span className="caption">
                    {selected.lastEditedBy
                      ? `${locale === "zh" ? "最后编辑" : "Last edited by"} ${selected.lastEditedBy.name}`
                      : ""}
                  </span>
                  {editable ? (
                    <button
                      className="button"
                      disabled={busy || !draftTitle.trim()}
                      onClick={save}
                      type="button"
                    >
                      {busy
                        ? locale === "zh"
                          ? "正在保存…"
                          : "Saving…"
                        : locale === "zh"
                          ? "保存章节"
                          : "Save section"}
                    </button>
                  ) : null}
                </div>
                {selected.aiSuggestion ? (
                  <div className="feedback feedback-info report-ai-suggestion">
                    <div>
                      <strong>
                        {locale === "zh"
                          ? "AI 建议草稿"
                          : "AI draft suggestion"}
                      </strong>
                      <p className="pre-wrap">{selected.aiSuggestion}</p>
                      {editable ? (
                        <div className="row">
                          <button
                            className="button button-small"
                            disabled={busy}
                            onClick={() => resolveAiSuggestion("accept")}
                            type="button"
                          >
                            <AppIcon name="check" />
                            {locale === "zh" ? "采纳为章节内容" : "Accept into section"}
                          </button>
                          <button
                            className="button button-ghost button-small"
                            disabled={busy}
                            onClick={() => resolveAiSuggestion("dismiss")}
                            type="button"
                          >
                            {locale === "zh" ? "放弃建议" : "Dismiss"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : editable && data.sourceDataset && canAsk ? (
                  <button
                    className="button button-secondary button-wide"
                    disabled={busy}
                    onClick={generateAiDraft}
                    type="button"
                  >
                    <AppIcon name="sparkles" />
                    {locale === "zh" ? "用 Dataset 证据生成本章初稿" : "Draft this section from Dataset evidence"}
                  </button>
                ) : null}
              </section>
            ) : (
              <div className="card">
                <p className="muted">
                  {locale === "zh"
                    ? "选择或添加一个章节。"
                    : "Select or add a section."}
                </p>
              </div>
            )}
          </main>
        </div>
      ) : null}
      {data?.sourceDataset && canAsk ? (
        <AiCopilotPanel
          conversationTitle={`${data.report.title}${selected ? ` · ${selected.title}` : ""}`}
          datasetVersionId={data.sourceDataset.version.id}
          description={locale === "zh" ? "ChatGPT 只读取报告绑定的冻结 Dataset。你可以讨论结构、核实表述，并把回答直接用于当前章节。" : "ChatGPT reads only the report's frozen Dataset. Discuss structure, verify wording, and use an answer in the current section."}
          key={`${data.sourceDataset.version.id}:${selected?.id ?? "report"}`}
          locale={locale}
          onUseAnswer={editable && selected ? (answer) => setDraftContent((current) => current.trim() ? `${current.trim()}\n\n${answer}` : answer) : undefined}
          starterPrompts={[
            locale === "zh" ? `为“${selected?.title ?? data.report.title}”提出一个有证据支持的章节结构。` : `Propose an evidence-backed structure for “${selected?.title ?? data.report.title}”.`,
            locale === "zh" ? "检查当前论述中可能过度推断的地方。" : "Check the current argument for possible overclaiming.",
            locale === "zh" ? "从 Dataset 中找出最能支持本节的证据。" : "Find the strongest Dataset evidence for this section.",
          ]}
          title={locale === "zh" ? "与 ChatGPT 共创报告" : "Co-create the report with ChatGPT"}
        />
      ) : null}
    </div>
  );
}
