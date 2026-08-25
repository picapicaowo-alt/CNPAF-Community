"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import { ErrorState, PageHeader } from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { TaskDetailResponse } from "@/lib/task-ui";

type Program = {
  id: string;
  organizationId: string;
  nameEn: string;
  nameZh: string;
  status: string;
};
type Location = {
  id: string;
  organizationId?: string | null;
  name: string;
  region?: string | null;
};
type Template = {
  id: string;
  key: string;
  organizationId?: string | null;
  currentPublishedVersionId?: string | null;
};
type Version = {
  id: string;
  nameEn: string;
  nameZh: string;
  version: number;
  status: string;
};
type FormChoice = Version & { templateId: string };
type RegistryItem = { key: string; labelEn: string; labelZh: string };
type Member = { userId: string; name: string; email: string; status: string };

export default function NewTaskPage() {
  const { locale } = useI18n();
  const router = useRouter();
  const [copyTaskId, setCopyTaskId] = useState<string | null>();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [forms, setForms] = useState<FormChoice[]>([]);
  const [taskTypes, setTaskTypes] = useState<RegistryItem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [programId, setProgramId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [templateVersionId, setTemplateVersionId] = useState("");
  const [taskTypeKey, setTaskTypeKey] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState(0);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [openNow, setOpenNow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setCopyTaskId(new URLSearchParams(window.location.search).get("copy"));
  }, []);
  useEffect(() => {
    if (copyTaskId === undefined) return;
    Promise.all([
      apiFetch<{ programs: Program[] }>("/api/v1/programs"),
      apiFetch<{ locations: Location[] }>("/api/v1/locations"),
      apiFetch<{ templates: Template[] }>("/api/v1/templates"),
      apiFetch<{ items: RegistryItem[] }>(
        "/api/v1/config/registries/task_type?status=active",
      ),
      copyTaskId
        ? apiFetch<TaskDetailResponse>(`/api/v1/tasks/${copyTaskId}`)
        : Promise.resolve(null),
    ])
      .then(
        async ([
          programResult,
          locationResult,
          templateResult,
          taskTypeResult,
          copyResult,
        ]) => {
          const activePrograms = (programResult.programs ?? []).filter(
            (program) => program.status === "active",
          );
          const bundles = await Promise.all(
            (templateResult.templates ?? []).map((template) =>
              apiFetch<{ versions: Version[] }>(
                `/api/v1/templates/${template.id}`,
              )
                .then((bundle) => ({ template, versions: bundle.versions }))
                .catch(() => ({ template, versions: [] })),
            ),
          );
          const published = bundles.flatMap(({ template, versions }) =>
            versions
              .filter((version) => version.status === "published")
              .map((version) => ({ ...version, templateId: template.id })),
          );
          setPrograms(activePrograms);
          setLocations(locationResult.locations ?? []);
          setForms(published);
          setTaskTypes(taskTypeResult.items ?? []);
          const source = copyResult?.task;
          const copiedProgram = activePrograms.find(
            (program) => program.id === source?.programId,
          );
          const copiedForm = published.find(
            (form) => form.id === source?.templateVersionId,
          );
          const copiedType = taskTypeResult.items?.find(
            (item) => item.key === source?.taskTypeKey,
          );
          const copiedLocation = (locationResult.locations ?? []).find(
            (location) => location.id === source?.siteId,
          );
          setProgramId(copiedProgram?.id ?? activePrograms[0]?.id ?? "");
          setTemplateVersionId(copiedForm?.id ?? published[0]?.id ?? "");
          setTaskTypeKey(copiedType?.key ?? taskTypeResult.items?.[0]?.key ?? "");
          if (source) {
            setSiteId(copiedLocation?.id ?? "");
            setTitle(`${source.title}（副本）`);
            setInstructions(source.instructions ?? "");
            setPriority(source.priority);
            setOpenNow(false);
          }
        },
      )
      .catch((caught) => setError(errorMessage(caught)));
  }, [copyTaskId]);
  useEffect(() => {
    if (!programId) {
      setMembers([]);
      return;
    }
    apiFetch<{ memberships: Member[] }>(`/api/v1/programs/${programId}`)
      .then((result) => {
        setMembers(
          (result.memberships ?? []).filter(
            (member) => member.status === "active",
          ),
        );
        setAssigneeIds((current) =>
          current.filter((id) =>
            result.memberships.some((member) => member.userId === id),
          ),
        );
      })
      .catch(() => setMembers([]));
  }, [programId]);
  const selectedProgram = programs.find((program) => program.id === programId);
  const visibleLocations = useMemo(
    () =>
      locations.filter(
        (location) =>
          !selectedProgram ||
          !location.organizationId ||
          location.organizationId === selectedProgram.organizationId,
      ),
    [locations, selectedProgram],
  );
  async function create() {
    if (
      !programId ||
      !templateVersionId ||
      !taskTypeKey ||
      !title.trim() ||
      !assigneeIds.length
    )
      return;
    setSaving(true);
    setError("");
    try {
      const result = await apiFetch<{ task: { id: string } }>("/api/v1/tasks", {
        method: "POST",
        body: JSON.stringify({
          programId,
          templateVersionId,
          siteId: siteId || null,
          taskTypeKey,
          title: title.trim(),
          instructions: instructions.trim() || null,
          priority,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          opensAt: openNow ? new Date().toISOString() : null,
          closesAt: null,
          configuration: {},
          assigneeIds,
          status: openNow ? "open" : "draft",
        }),
      });
      router.replace(`/tasks/${result.task.id}`);
    } catch (caught) {
      setError(errorMessage(caught));
      setSaving(false);
    }
  }
  return (
    <div className="stack">
      <PageHeader
        eyebrow={locale === "zh" ? "任务" : "Tasks"}
        title={
          copyTaskId
            ? locale === "zh"
              ? "复制任务"
              : "Copy task"
            : locale === "zh"
              ? "创建任务"
              : "Create task"
        }
        description={
          copyTaskId
            ? locale === "zh"
              ? "已复制原任务的表单与设置；负责人、日期和状态需重新确认。"
              : "Form and settings were copied; assignees, dates, and status must be confirmed again."
            : locale === "zh"
              ? "明确采集内容、地点、截止时间与负责人员。"
              : "Define what to collect, where, by when, and who is responsible."
        }
        actions={
          <Link
            className="button button-secondary"
            href={copyTaskId ? `/tasks/${copyTaskId}` : "/tasks"}
          >
            <AppIcon name="back" />
            {locale === "zh" ? "返回" : "Back"}
          </Link>
        }
      />
      {error ? <ErrorState message={error} /> : null}
      <div className="editor-layout">
        <aside className="editor-sidebar">
          <section className="card stack-sm">
            <h2>{locale === "zh" ? "任务状态" : "Task status"}</h2>
            <label className="choice">
              <input
                checked={openNow}
                onChange={(event) => setOpenNow(event.target.checked)}
                type="checkbox"
              />
              <span>
                {locale === "zh"
                  ? "创建后立即开放"
                  : "Open immediately after creation"}
              </span>
            </label>
            <p className="muted">
              {locale === "zh"
                ? "关闭此选项会保存为草稿，之后可在任务详情中开放。"
                : "Turn this off to save a draft that can be opened later."}
            </p>
          </section>
          <section className="card stack-sm">
            <h2>{locale === "zh" ? "负责人员" : "Assignees"}</h2>
            {members.length ? (
              <div className="choice-list">
                {members.map((member) => (
                  <label className="choice" key={member.userId}>
                    <input
                      checked={assigneeIds.includes(member.userId)}
                      onChange={(event) =>
                        setAssigneeIds((current) =>
                          event.target.checked
                            ? [...current, member.userId]
                            : current.filter((id) => id !== member.userId),
                        )
                      }
                      type="checkbox"
                    />
                    <span>
                      <strong>{member.name}</strong>
                      <span className="caption" style={{ display: "block" }}>
                        {member.email}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="muted">
                {locale === "zh"
                  ? "所选项目暂无可分配成员。"
                  : "No assignable members in the selected program."}
              </p>
            )}
          </section>
        </aside>
        <main className="card stack">
          <h2>{locale === "zh" ? "任务详情" : "Task details"}</h2>
          <div className="form-grid">
            <label className="field-full">
              {locale === "zh" ? "标题" : "Title"}
              <input
                maxLength={500}
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
            </label>
            <label>
              {locale === "zh" ? "项目" : "Program"}
              <select
                onChange={(event) => {
                  setProgramId(event.target.value);
                  setSiteId("");
                }}
                value={programId}
              >
                {programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {locale === "zh" ? program.nameZh : program.nameEn}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {locale === "zh" ? "采集表单" : "Collection form"}
              <select
                onChange={(event) => setTemplateVersionId(event.target.value)}
                value={templateVersionId}
              >
                {forms.map((form) => (
                  <option key={form.id} value={form.id}>
                    {locale === "zh" ? form.nameZh : form.nameEn} · v
                    {form.version}
                  </option>
                ))}
              </select>
              {!forms.length ? (
                <span className="caption">
                  {locale === "zh" ? "尚无已发布表单。" : "No published form yet."}{" "}
                  <Link className="inline-link" href="/forms/new">
                    {locale === "zh" ? "创建表单" : "Create a form"}
                  </Link>
                </span>
              ) : null}
            </label>
            <label>
              {locale === "zh" ? "任务类型" : "Task type"}
              <select
                onChange={(event) => setTaskTypeKey(event.target.value)}
                value={taskTypeKey}
              >
                {taskTypes.map((item) => (
                  <option key={item.key} value={item.key}>
                    {locale === "zh" ? item.labelZh : item.labelEn}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="row-between">
                <span>{locale === "zh" ? "地点（可选）" : "Location (optional)"}</span>
                <Link className="inline-link" href="/locations">
                  {locale === "zh" ? "新建地点" : "New location"}
                </Link>
              </span>
              <select
                onChange={(event) => setSiteId(event.target.value)}
                value={siteId}
              >
                <option value="">
                  {locale === "zh" ? "不限定地点" : "No specific location"}
                </option>
                {visibleLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                    {location.region ? ` · ${location.region}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {locale === "zh" ? "截止时间（可选）" : "Due date (optional)"}
              <input
                onChange={(event) => setDueAt(event.target.value)}
                type="datetime-local"
                value={dueAt}
              />
            </label>
            <label>
              {locale === "zh" ? "优先级" : "Priority"}
              <input
                max={100}
                min={-100}
                onChange={(event) => setPriority(Number(event.target.value))}
                type="number"
                value={priority}
              />
            </label>
            <label className="field-full">
              {locale === "zh" ? "说明（可选）" : "Instructions (optional)"}
              <textarea
                maxLength={20000}
                onChange={(event) => setInstructions(event.target.value)}
                value={instructions}
              />
            </label>
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button
              className="button"
              disabled={
                saving ||
                !programId ||
                !templateVersionId ||
                !taskTypeKey ||
                !assigneeIds.length ||
                !title.trim()
              }
              onClick={create}
              type="button"
            >
              {saving
                ? locale === "zh"
                  ? "正在创建…"
                  : "Creating…"
                : locale === "zh"
                  ? "创建任务"
                  : "Create task"}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
