"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import { ErrorState, PageHeader } from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";

type Program = {
  id: string;
  organizationId: string;
  nameEn: string;
  nameZh: string;
  status: string;
};

export default function NewReportPage() {
  const { locale } = useI18n();
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState("");
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programId, setProgramId] = useState("");
  const [title, setTitle] = useState("");
  const [sectionTitles, setSectionTitles] = useState([""]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    Promise.all([
      apiFetch<{ user: { organizationId?: string | null } }>("/api/v1/auth/me"),
      apiFetch<{ programs: Program[] }>("/api/v1/programs"),
    ])
      .then(([me, result]) => {
        setOrganizationId(me.user.organizationId ?? "");
        setPrograms(
          (result.programs ?? []).filter(
            (program) => program.status === "active",
          ),
        );
      })
      .catch((caught) => setError(errorMessage(caught)));
  }, []);
  async function create() {
    if (
      !organizationId ||
      !title.trim() ||
      sectionTitles.some((section) => !section.trim())
    )
      return;
    setSaving(true);
    setError("");
    try {
      const result = await apiFetch<{ report: { id: string } }>(
        "/api/v1/reports",
        {
          method: "POST",
          body: JSON.stringify({
            organizationId,
            programId: programId || null,
            reportTemplateVersionId: null,
            sourceReportArtifactId: null,
            title: title.trim(),
            filters: programId ? { programIds: [programId] } : {},
            evidencePolicy: { approvedOnly: true, researchUseEligible: true },
            sections: sectionTitles.map((section, index) => ({
              sectionKey: `section-${index + 1}`,
              title: section.trim(),
              content: "",
              sortOrder: index,
            })),
          }),
        },
      );
      router.replace(`/reports/${result.report.id}/edit`);
    } catch (caught) {
      setError(errorMessage(caught));
      setSaving(false);
    }
  }
  return (
    <div className="stack">
      <PageHeader
        eyebrow={locale === "zh" ? "报告中心" : "Report center"}
        title={locale === "zh" ? "新建报告" : "New report"}
        description={
          locale === "zh"
            ? "先确定范围和结构，之后再逐段加入证据与内容。"
            : "Set the scope and structure first, then add evidence and content section by section."
        }
        actions={
          <Link className="button button-secondary" href="/reports">
            <AppIcon name="back" />
            {locale === "zh" ? "返回" : "Back"}
          </Link>
        }
      />
      {error ? <ErrorState message={error} /> : null}
      <div className="content-aside">
        <section className="card stack">
          <h2>{locale === "zh" ? "报告设置" : "Report setup"}</h2>
          <label>
            {locale === "zh" ? "报告标题" : "Report title"}
            <input
              maxLength={500}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={
                locale === "zh"
                  ? "输入清晰、具体的标题"
                  : "Enter a clear, specific title"
              }
              value={title}
            />
          </label>
          <label>
            {locale === "zh" ? "项目范围（可选）" : "Program scope (optional)"}
            <select
              onChange={(event) => {
                setProgramId(event.target.value);
                const selected = programs.find(
                  (program) => program.id === event.target.value,
                );
                if (selected) setOrganizationId(selected.organizationId);
              }}
              value={programId}
            >
              <option value="">
                {locale === "zh"
                  ? "组织内全部已授权证据"
                  : "All authorized evidence in organization"}
              </option>
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {locale === "zh" ? program.nameZh : program.nameEn}
                </option>
              ))}
            </select>
          </label>
          <div className="feedback feedback-info">
            <span>
              {locale === "zh"
                ? "数据政策固定为：只使用已批准、可用于研究的证据。"
                : "Evidence policy is fixed to approved, research-eligible evidence only."}
            </span>
          </div>
        </section>
        <aside className="card stack">
          <h2>{locale === "zh" ? "发布前检查" : "Before publishing"}</h2>
          <p className="muted">
            {locale === "zh"
              ? "每一节都可以独立保存。发布时会冻结当前版本，后续修改需创建新版本。"
              : "Each section saves independently. Publishing freezes the current version; later edits require a new version."}
          </p>
        </aside>
      </div>
      <section className="card stack">
        <div className="row-between">
          <div>
            <h2>{locale === "zh" ? "报告结构" : "Report structure"}</h2>
            <p className="muted">
              {locale === "zh"
                ? "添加需要编写的章节，顺序可在编辑器中继续调整。"
                : "Add the sections to write; their order can be refined in the editor."}
            </p>
          </div>
          <button
            className="button button-secondary button-small"
            onClick={() => setSectionTitles((current) => [...current, ""])}
            type="button"
          >
            <AppIcon name="plus" />
            {locale === "zh" ? "添加章节" : "Add section"}
          </button>
        </div>
        <div className="stack-sm">
          {sectionTitles.map((section, index) => (
            <div className="field-row" key={index}>
              <label>
                {locale === "zh" ? `章节 ${index + 1}` : `Section ${index + 1}`}
                <input
                  onChange={(event) =>
                    setSectionTitles((current) =>
                      current.map((value, currentIndex) =>
                        currentIndex === index ? event.target.value : value,
                      ),
                    )
                  }
                  placeholder={locale === "zh" ? "章节标题" : "Section title"}
                  value={section}
                />
              </label>
              <button
                className="button button-ghost"
                disabled={sectionTitles.length === 1}
                onClick={() =>
                  setSectionTitles((current) =>
                    current.filter((_, currentIndex) => currentIndex !== index),
                  )
                }
                type="button"
              >
                {locale === "zh" ? "移除" : "Remove"}
              </button>
            </div>
          ))}
        </div>
      </section>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button
          className="button"
          disabled={
            saving ||
            !organizationId ||
            !title.trim() ||
            sectionTitles.some((section) => !section.trim())
          }
          onClick={create}
          type="button"
        >
          {saving
            ? locale === "zh"
              ? "正在创建…"
              : "Creating…"
            : locale === "zh"
              ? "创建并开始编辑"
              : "Create and start editing"}
          <AppIcon name="arrow" />
        </button>
      </div>
    </div>
  );
}
