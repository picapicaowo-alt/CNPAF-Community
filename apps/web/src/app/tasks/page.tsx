"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusPill,
} from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { TaskBulkActions } from "@/features/tasks/components/TaskBulkActions";
import {
  taskDate,
  taskStatusLabel,
  taskTone,
  type TaskSummary,
} from "@/lib/task-ui";

const filters = [
  "all",
  "assigned",
  "open",
  "in_progress",
  "completed",
] as const;

export default function TasksPage() {
  const { locale } = useI18n();
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [programId, setProgramId] = useState("");
  const [templateVersionId, setTemplateVersionId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const me = await apiFetch<{ permissions: string[] }>("/api/v1/auth/me");
      setPermissions(me.permissions ?? []);
      const endpoint = me.permissions.some((key) =>
        ["tasks.create", "tasks.assign", "tasks.edit"].includes(key),
      )
        ? "/api/v1/tasks"
        : "/api/v1/tasks/my";
      const result = await apiFetch<{ tasks: TaskSummary[] }>(endpoint);
      setTasks(result.tasks ?? []);
      setSelectedIds((current) =>
        current.filter((id) => result.tasks.some((task) => task.id === id)),
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  const canCreate = permissions.includes("tasks.create");
  const canAssign = permissions.includes("tasks.assign");
  const canEdit = permissions.includes("tasks.edit");
  const filterOptions = useMemo(() => {
    const programs = new Map<string, TaskSummary["program"]>();
    const forms = new Map<string, TaskSummary["form"]>();
    const locations = new Map<
      string,
      NonNullable<TaskSummary["location"]>
    >();
    const assignees = new Map<
      string,
      { id: string; name?: string; email?: string }
    >();
    for (const task of tasks) {
      programs.set(task.program.id, task.program);
      forms.set(task.templateVersionId, task.form);
      if (task.location) locations.set(task.location.id, task.location);
      for (const assignment of task.assignments ?? []) {
        assignees.set(assignment.assigneeId, {
          id: assignment.assigneeId,
          name: assignment.assigneeName,
          email: assignment.assigneeEmail,
        });
      }
    }
    return {
      programs: [...programs.values()],
      forms: [...forms.values()],
      locations: [...locations.values()],
      assignees: [...assignees.values()],
    };
  }, [tasks]);
  const visible = useMemo(
    () =>
      tasks.filter((task) => {
        if (
          filter !== "all" &&
          task.status !== filter &&
          task.myAssignment?.status !== filter
        )
          return false;
        if (programId && task.programId !== programId) return false;
        if (
          templateVersionId &&
          task.templateVersionId !== templateVersionId
        )
          return false;
        if (locationId && task.siteId !== locationId) return false;
        if (
          assigneeId &&
          !(task.assignments ?? []).some(
            (assignment) => assignment.assigneeId === assigneeId,
          )
        )
          return false;
        const due = task.dueAt ? new Date(task.dueAt) : null;
        if (dueFrom && (!due || due < new Date(`${dueFrom}T00:00:00`)))
          return false;
        if (dueTo && (!due || due > new Date(`${dueTo}T23:59:59.999`)))
          return false;
        const normalizedQuery = query.trim().toLocaleLowerCase();
        if (!normalizedQuery) return true;
        const searchable = [
          task.title,
          task.instructions,
          task.program.nameEn,
          task.program.nameZh,
          task.form.nameEn,
          task.form.nameZh,
          task.location?.name,
          task.location?.region,
          ...(task.assignments ?? []).flatMap((assignment) => [
            assignment.assigneeName,
            assignment.assigneeEmail,
          ]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase();
        return searchable.includes(normalizedQuery);
      }),
    [
      assigneeId,
      dueFrom,
      dueTo,
      filter,
      locationId,
      programId,
      query,
      tasks,
      templateVersionId,
    ],
  );

  function resetFilters() {
    setQuery("");
    setProgramId("");
    setTemplateVersionId("");
    setLocationId("");
    setAssigneeId("");
    setDueFrom("");
    setDueTo("");
  }
  const selectedTasks = useMemo(
    () => tasks.filter((task) => selectedIds.includes(task.id)),
    [selectedIds, tasks],
  );
  const visibleIds = visible.map((task) => task.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const activeFilterCount = [
    query.trim(),
    programId,
    templateVersionId,
    locationId,
    assigneeId,
    dueFrom,
    dueTo,
  ].filter(Boolean).length;

  function toggleVisible() {
    setSelectedIds((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])],
    );
  }

  return (
    <div className="stack">
      <PageHeader
        title={locale === "zh" ? "任务" : "Tasks"}
        description={
          canCreate
            ? locale === "zh"
              ? "规划由谁、在何时何地采集什么。"
              : "Plan who collects what, where, and when."
            : locale === "zh"
              ? "查看并完成分配给你的采集任务。"
              : "View and complete your assigned collection tasks."
        }
        actions={
          canCreate ? (
            <Link className="button" href="/tasks/new">
              <AppIcon name="plus" />
              {locale === "zh" ? "新建任务" : "New task"}
            </Link>
          ) : undefined
        }
      />
      <div className="tabs" role="tablist">
        {filters.map((item) => (
          <button
            className={`tab${filter === item ? " active" : ""}`}
            key={item}
            onClick={() => setFilter(item)}
            type="button"
          >
            {taskStatusLabel(item, locale)}
          </button>
        ))}
      </div>
      {!loading && !error && tasks.length ? (
        <section className={`card task-filter-card${filtersOpen ? " expanded" : ""}`}>
          <button
            aria-expanded={filtersOpen}
            className="task-filter-toggle"
            onClick={() => setFiltersOpen((current) => !current)}
            type="button"
          >
            <span className="task-filter-toggle-icon">
              <AppIcon name="filter" />
            </span>
            <span className="task-filter-toggle-copy">
              <strong>{locale === "zh" ? "筛选任务" : "Filter tasks"}</strong>
              <span>
                {locale === "zh"
                  ? `显示 ${visible.length} / ${tasks.length} 个任务`
                  : `Showing ${visible.length} of ${tasks.length} tasks`}
              </span>
            </span>
            {activeFilterCount ? (
              <span className="task-filter-count">
                {locale === "zh"
                  ? `${activeFilterCount} 项已应用`
                  : `${activeFilterCount} applied`}
              </span>
            ) : null}
            <span className="task-filter-action">
              {filtersOpen
                ? locale === "zh"
                  ? "收起"
                  : "Collapse"
                : locale === "zh"
                  ? "展开"
                  : "Expand"}
              <span aria-hidden="true">⌄</span>
            </span>
          </button>
          {filtersOpen ? (
            <div className="task-filter-content stack-sm">
              <div className="row-between">
                <span className="caption">
                  {locale === "zh"
                    ? "按项目、表单、地点、负责人或截止日期缩小范围"
                    : "Narrow by program, form, location, assignee, or due date"}
                </span>
                <button
                  className="button button-secondary button-small"
                  disabled={!activeFilterCount}
                  onClick={resetFilters}
                  type="button"
                >
                  {locale === "zh" ? "重置筛选" : "Reset filters"}
                </button>
              </div>
              <div className="form-grid">
            <label className="field-full">
              {locale === "zh" ? "搜索" : "Search"}
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  locale === "zh"
                    ? "标题、地点、表单或负责人"
                    : "Title, location, form, or assignee"
                }
                type="search"
                value={query}
              />
            </label>
            <label>
              {locale === "zh" ? "项目" : "Program"}
              <select
                onChange={(event) => setProgramId(event.target.value)}
                value={programId}
              >
                <option value="">{locale === "zh" ? "全部项目" : "All programs"}</option>
                {filterOptions.programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {locale === "zh" ? program.nameZh : program.nameEn}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {locale === "zh" ? "表单版本" : "Form version"}
              <select
                onChange={(event) => setTemplateVersionId(event.target.value)}
                value={templateVersionId}
              >
                <option value="">{locale === "zh" ? "全部表单" : "All forms"}</option>
                {filterOptions.forms.map((form) => (
                  <option key={form.templateVersionId} value={form.templateVersionId}>
                    {locale === "zh" ? form.nameZh : form.nameEn} · v{form.versionNumber}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {locale === "zh" ? "地点" : "Location"}
              <select
                onChange={(event) => setLocationId(event.target.value)}
                value={locationId}
              >
                <option value="">{locale === "zh" ? "全部地点" : "All locations"}</option>
                {filterOptions.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {locale === "zh" ? "负责人" : "Assignee"}
              <select
                onChange={(event) => setAssigneeId(event.target.value)}
                value={assigneeId}
              >
                <option value="">{locale === "zh" ? "全部负责人" : "All assignees"}</option>
                {filterOptions.assignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>
                    {assignee.name ?? assignee.email ?? assignee.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {locale === "zh" ? "截止日期从" : "Due from"}
              <input
                onChange={(event) => setDueFrom(event.target.value)}
                type="date"
                value={dueFrom}
              />
            </label>
            <label>
              {locale === "zh" ? "截止日期到" : "Due to"}
              <input
                onChange={(event) => setDueTo(event.target.value)}
                type="date"
                value={dueTo}
              />
            </label>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
      {canAssign || canEdit ? (
        <TaskBulkActions
          canAssign={canAssign}
          canEdit={canEdit}
          locale={locale}
          onCompleted={async () => {
            await load();
          }}
          selectedTasks={selectedTasks}
        />
      ) : null}
      {loading ? (
        <LoadingState rows={5} />
      ) : error ? (
        <ErrorState message={error} retry={load} />
      ) : visible.length ? (
        <div className="list-panel">
          <div className="list-panel-title row-between">
            <span>{locale === "zh" ? "任务列表" : "Tasks"}</span>
            {canAssign || canEdit ? (
              <label className="choice">
                <input
                  checked={allVisibleSelected}
                  onChange={toggleVisible}
                  type="checkbox"
                />
                <span>
                  {locale === "zh" ? "选择当前结果" : "Select visible"}
                </span>
              </label>
            ) : null}
          </div>
          {visible.map((task) => (
            <div
              className={`task-select-row${canAssign || canEdit ? "" : " no-selector"}`}
              key={task.id}
            >
              {canAssign || canEdit ? (
                <input
                  aria-label={
                    locale === "zh"
                      ? `选择任务 ${task.title}`
                      : `Select task ${task.title}`
                  }
                  checked={selectedIds.includes(task.id)}
                  onChange={(event) =>
                    setSelectedIds((current) =>
                      event.target.checked
                        ? [...new Set([...current, task.id])]
                        : current.filter((id) => id !== task.id),
                    )
                  }
                  type="checkbox"
                />
              ) : null}
              <Link
                className="task-select-row-link"
                href={`/tasks/${task.id}`}
              >
                <div>
                  <div className="list-row-subtitle">
                    {taskDate(task.dueAt ?? task.opensAt, locale)}
                  </div>
                  <div className="list-row-title">
                    {task.location?.name ?? task.title}
                  </div>
                </div>
                <div>{task.title}</div>
                <div className="muted">
                  {task.form[locale === "zh" ? "nameZh" : "nameEn"]}
                </div>
                <div className="row">
                  <StatusPill
                    tone={taskTone(task.myAssignment?.status ?? task.status)}
                  >
                    {taskStatusLabel(
                      task.myAssignment?.status ?? task.status,
                      locale,
                    )}
                  </StatusPill>
                  <span className="list-row-arrow">
                    <AppIcon name="arrow" />
                  </span>
                </div>
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="tasks"
          title={locale === "zh" ? "没有符合条件的任务" : "No matching tasks"}
          description={
            locale === "zh"
              ? "尝试切换筛选条件，或创建一个新任务。"
              : "Try another filter or create a new task."
          }
          action={
            canCreate ? (
              <Link className="button" href="/tasks/new">
                {locale === "zh" ? "新建任务" : "New task"}
              </Link>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
