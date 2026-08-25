"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StatusPill } from "@/components/ui";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";
import { getProgram } from "@/features/programs/api";
import type { ProgramMembership } from "@/features/programs/types";
import { apiFetch, errorMessage } from "@/lib/api-client";
import {
  taskStatusLabel,
  taskTone,
  type TaskAssignment,
  type TaskSummary,
} from "@/lib/task-ui";
import {
  addTaskAssignees,
  transitionTaskAssignment,
  updateTask,
} from "../api";

type LocationChoice = {
  id: string;
  organizationId?: string | null;
  name: string;
  canonicalStatus: string;
};

type RegistryItem = { key: string; labelEn: string; labelZh: string };

type Props = {
  task: Omit<TaskSummary, "myAssignment" | "assignments">;
  assignments: TaskAssignment[];
  locale: "zh" | "en";
  onChanged: () => Promise<void>;
};

export function TaskManagementPanel({
  task,
  assignments,
  locale,
  onChanged,
}: Props) {
  const [canManage, setCanManage] = useState(false);
  const [members, setMembers] = useState<ProgramMembership[]>([]);
  const [locations, setLocations] = useState<LocationChoice[]>([]);
  const [taskTypes, setTaskTypes] = useState<RegistryItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [canManageTaskTypes, setCanManageTaskTypes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [draft, setDraft] = useState(() => taskDraft(task));

  useEffect(() => setDraft(taskDraft(task)), [task]);
  useEffect(() => {
    let active = true;
    apiFetch<{ permissions: string[] }>("/api/v1/auth/me")
      .then(async ({ permissions }) => {
        const allowed = permissions.includes("tasks.edit");
        if (!active) return;
        setCanManage(allowed);
        setCanManageTaskTypes(permissions.includes("services.manage"));
        if (!allowed) return;
        const [program, locationResult, typeResult] = await Promise.all([
          getProgram(task.programId),
          apiFetch<{ locations: LocationChoice[] }>("/api/v1/locations"),
          apiFetch<{ items: RegistryItem[] }>(
            "/api/v1/config/registries/task_type?status=active",
          ),
        ]);
        if (!active) return;
        setMembers(
          program.memberships.filter((membership) => membership.status === "active"),
        );
        setLocations(
          locationResult.locations.filter(
            (location) =>
              location.canonicalStatus !== "merged" &&
              (!location.organizationId ||
                location.organizationId === task.organizationId),
          ),
        );
        setTaskTypes(typeResult.items ?? []);
      })
      .catch((caught) => active && setError(errorMessage(caught)));
    return () => {
      active = false;
    };
  }, [task.organizationId, task.programId]);

  const assignedUserIds = useMemo(
    () => new Set(assignments.map((assignment) => assignment.assigneeId)),
    [assignments],
  );
  const availableMembers = members.filter(
    (member) => !assignedUserIds.has(member.userId),
  );
  const activeAssignments = assignments.filter((assignment) =>
    ["assigned", "in_progress"].includes(assignment.status),
  );
  const acceptsAssignments = ["draft", "open"].includes(task.status);

  if (!canManage) return null;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  function changeDraft<Key extends keyof typeof draft>(
    key: Key,
    value: (typeof draft)[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!draft.title.trim() || !draft.taskTypeKey) return;
    await run(() =>
      updateTask(task.id, {
        title: draft.title.trim(),
        instructions: draft.instructions.trim() || null,
        taskTypeKey: draft.taskTypeKey,
        siteId: draft.siteId || null,
        priority: Number(draft.priority),
        dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : null,
      }),
    );
    setEditing(false);
  }

  async function transition(status: "open" | "closed" | "cancelled" | "archived") {
    if (
      status === "closed" &&
      activeAssignments.length &&
      !window.confirm(
        locale === "zh"
          ? `仍有 ${activeAssignments.length} 个负责人未完成。确定关闭任务吗？`
          : `${activeAssignments.length} assignee(s) are unfinished. Close this task anyway?`,
      )
    ) {
      return;
    }
    await run(() => updateTask(task.id, { status }));
  }

  async function addAssignee() {
    if (!selectedAssigneeIds.length) return;
    await run(() => addTaskAssignees(task.id, selectedAssigneeIds));
    setSelectedAssigneeIds([]);
  }

  return (
    <section className="card stack">
      <div className="row-between mobile-stack">
        <div>
          <div className="caption">
            {locale === "zh" ? "协调员操作" : "Coordinator controls"}
          </div>
          <h2>{locale === "zh" ? "管理任务" : "Manage task"}</h2>
        </div>
        <div className="row">
          <Link
            className="button button-secondary button-small"
            href={`/tasks/new?copy=${task.id}`}
          >
            {locale === "zh" ? "复制任务" : "Copy task"}
          </Link>
          <button
            className="button button-secondary button-small"
            disabled={busy}
            onClick={() => setEditing((value) => !value)}
            type="button"
          >
            {editing
              ? locale === "zh"
                ? "取消编辑"
                : "Cancel editing"
              : locale === "zh"
                ? "编辑"
                : "Edit"}
          </button>
          {task.status === "draft" ? (
            <button
              className="button button-small"
              disabled={busy}
              onClick={() => void transition("open")}
              type="button"
            >
              {locale === "zh" ? "开放任务" : "Open task"}
            </button>
          ) : null}
          {task.status === "open" ? (
            <button
              className="button button-small"
              disabled={busy}
              onClick={() => void transition("closed")}
              type="button"
            >
              {locale === "zh" ? "关闭任务" : "Close task"}
            </button>
          ) : null}
          {["draft", "open"].includes(task.status) ? (
            <button
              className="button button-danger button-small"
              disabled={busy}
              onClick={() => void transition("cancelled")}
              type="button"
            >
              {locale === "zh" ? "取消任务" : "Cancel task"}
            </button>
          ) : null}
          {["closed", "cancelled"].includes(task.status) ? (
            <button
              className="button button-secondary button-small"
              disabled={busy}
              onClick={() => void transition("archived")}
              type="button"
            >
              {locale === "zh" ? "归档" : "Archive"}
            </button>
          ) : null}
        </div>
      </div>
      {error ? <div className="feedback feedback-error">{error}</div> : null}
      {editing ? (
        <div className="form-grid form-fieldset">
          <label className="field-full">
            {locale === "zh" ? "任务标题" : "Task title"}
            <input
              maxLength={500}
              onChange={(event) => changeDraft("title", event.target.value)}
              value={draft.title}
            />
          </label>
          <div className="field">
            <div className="row-between">
              <label htmlFor={`task-type-${task.id}`}>
                {locale === "zh" ? "任务类型" : "Task type"}
              </label>
              {canManageTaskTypes ? (
                <Link
                  className="inline-link"
                  href="/settings/configuration?registry=task_type"
                >
                  {locale === "zh" ? "管理任务类型" : "Manage task types"}
                </Link>
              ) : null}
            </div>
            <select
              id={`task-type-${task.id}`}
              onChange={(event) => changeDraft("taskTypeKey", event.target.value)}
              value={draft.taskTypeKey}
            >
              {taskTypes.map((item) => (
                <option key={item.key} value={item.key}>
                  {locale === "zh" ? item.labelZh : item.labelEn}
                </option>
              ))}
            </select>
            {taskTypes.length <= 1 ? (
              <span className="caption">
                {locale === "zh"
                  ? "目前只有一个可用任务类型；新增配置后即可在这里切换。"
                  : "Only one task type is active; add another configuration to switch it here."}
              </span>
            ) : null}
          </div>
          <label>
            {locale === "zh" ? "地点" : "Location"}
            <select
              onChange={(event) => changeDraft("siteId", event.target.value)}
              value={draft.siteId}
            >
              <option value="">{locale === "zh" ? "不限定地点" : "No location"}</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {locale === "zh" ? "截止时间" : "Due date"}
            <input
              onChange={(event) => changeDraft("dueAt", event.target.value)}
              type="datetime-local"
              value={draft.dueAt}
            />
          </label>
          <label>
            {locale === "zh" ? "优先级" : "Priority"}
            <input
              max={100}
              min={-100}
              onChange={(event) => changeDraft("priority", event.target.value)}
              type="number"
              value={draft.priority}
            />
          </label>
          <label className="field-full">
            {locale === "zh" ? "说明" : "Instructions"}
            <textarea
              maxLength={20_000}
              onChange={(event) => changeDraft("instructions", event.target.value)}
              value={draft.instructions}
            />
          </label>
          <div className="field-full">
            <button
              className="button"
              disabled={busy || !draft.title.trim() || !draft.taskTypeKey}
              onClick={() => void save()}
              type="button"
            >
              {locale === "zh" ? "保存修改" : "Save changes"}
            </button>
          </div>
        </div>
      ) : null}
      <div className="stack-sm">
        <div className="row-between mobile-stack">
          <h3>{locale === "zh" ? "负责人进度" : "Assignee progress"}</h3>
          <div className="row">
            <div style={{ minWidth: 260 }}>
              <MultiSelectDropdown
                disabled={busy || !acceptsAssignments || !availableMembers.length}
                locale={locale}
                onChange={setSelectedAssigneeIds}
                options={availableMembers.map((member) => ({
                  value: member.userId,
                  label: member.name,
                  description: member.email,
                }))}
                placeholder={
                  locale === "zh" ? "选择新增负责人…" : "Choose assignees…"
                }
                values={selectedAssigneeIds}
              />
            </div>
            <button
              className="button button-small"
              disabled={busy || !acceptsAssignments || !selectedAssigneeIds.length}
              onClick={() => void addAssignee()}
              type="button"
            >
              {locale === "zh"
                ? `增派${selectedAssigneeIds.length ? ` ${selectedAssigneeIds.length} 人` : ""}`
                : `Assign${selectedAssigneeIds.length ? ` ${selectedAssigneeIds.length}` : ""}`}
            </button>
          </div>
        </div>
        {!availableMembers.length ? (
          <p className="caption">
            {locale === "zh" ? "没有其他可分配的项目成员。" : "No other program members are available."}{" "}
            <Link className="inline-link" href="/programs">
              {locale === "zh" ? "管理项目成员" : "Manage program members"}
            </Link>
          </p>
        ) : null}
        <div className="choice-list">
          {assignments.map((assignment) => (
            <div className="choice row-between mobile-stack" key={assignment.id}>
              <span>
                <strong>{assignment.assigneeName ?? assignment.assigneeEmail}</strong>
                {assignment.declineReason ? (
                  <span className="caption" style={{ display: "block" }}>
                    {locale === "zh" ? "拒绝原因" : "Decline reason"}: {assignment.declineReason}
                  </span>
                ) : null}
              </span>
              <span className="row">
                <StatusPill tone={taskTone(assignment.status)}>
                  {taskStatusLabel(assignment.status, locale)}
                </StatusPill>
                {assignment.recordId ? (
                  <Link className="inline-link" href={`/records/${assignment.recordId}`}>
                    {locale === "zh" ? "查看提交" : "View submission"}
                  </Link>
                ) : null}
                {["assigned", "in_progress"].includes(assignment.status) ? (
                  <button
                    className="button button-ghost button-small"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        transitionTaskAssignment(task.id, assignment.id, "cancelled"),
                      )
                    }
                    type="button"
                  >
                    {locale === "zh" ? "取消分配" : "Unassign"}
                  </button>
                ) : null}
                {acceptsAssignments &&
                ["declined", "cancelled"].includes(assignment.status) ? (
                  <button
                    className="button button-secondary button-small"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        transitionTaskAssignment(task.id, assignment.id, "assigned"),
                      )
                    }
                    type="button"
                  >
                    {locale === "zh" ? "重新分配" : "Reassign"}
                  </button>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function taskDraft(
  task: Omit<TaskSummary, "myAssignment" | "assignments">,
) {
  return {
    title: task.title,
    instructions: task.instructions ?? "",
    taskTypeKey: task.taskTypeKey,
    siteId: task.siteId ?? "",
    dueAt: toLocalDateTime(task.dueAt),
    priority: String(task.priority),
  };
}

function toLocalDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
