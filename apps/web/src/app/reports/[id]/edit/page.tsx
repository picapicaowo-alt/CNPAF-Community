"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
                  <div className="feedback feedback-info">
                    <div>
                      <strong>
                        {locale === "zh"
                          ? "AI 建议草稿"
                          : "AI draft suggestion"}
                      </strong>
                      <p className="pre-wrap">{selected.aiSuggestion}</p>
                    </div>
                  </div>
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
    </div>
  );
}
