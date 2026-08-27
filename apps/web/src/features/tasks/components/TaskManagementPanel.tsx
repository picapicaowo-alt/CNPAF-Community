"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StatusPill } from "@/components/ui";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";
import { getProgram } from "@/features/programs/api";
import type { ProgramMembership } from "@/features/programs/types";
import { localizedLocationName } from "@/features/locations/model";
import { apiFetch, errorMessage } from "@/lib/api-client";
import {
  taskStatusLabel,
  taskTone,
  type TaskAssignment,
  type TaskRecurrence,
  type TaskSummary,
} from "@/lib/task-ui";
import {
  addTaskAssignees,
  sendTaskNotification,
  transitionTaskAssignment,
  updateTask,
  updateTaskRecurrenceStatus,
} from "../api";

type LocationChoice = {
  id: string;
  organizationId?: string | null;
  name: string;
  nameEn?: string | null;
  nameZh?: string | null;
  canonicalStatus: string;
};

type RegistryItem = { key: string; labelEn: string; labelZh: string };
type Template = {
  id: string;
  organizationId?: string | null;
  currentPublishedVersionId?: string | null;
};
type FormChoice = {
  id: string;
  nameEn: string;
  nameZh: string;
  version: number;
};

type Props = {
  task: Omit<TaskSummary, "myAssignment" | "assignments">;
  assignments: TaskAssignment[];
  recurrence: TaskRecurrence | null;
  locale: "zh" | "en";
  onChanged: () => Promise<void>;
};

export function TaskManagementPanel({
  task,
  assignments,
  recurrence,
  locale,
  onChanged,
}: Props) {
  const [canManage, setCanManage] = useState(false);
  const [members, setMembers] = useState<ProgramMembership[]>([]);
  const [locations, setLocations] = useState<LocationChoice[]>([]);
  const [taskTypes, setTaskTypes] = useState<RegistryItem[]>([]);
  const [priorityLevels, setPriorityLevels] = useState<RegistryItem[]>([]);
  const [forms, setForms] = useState<FormChoice[]>([]);
  const [editing, setEditing] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationResult, setNotificationResult] = useState("");
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
        const [
          program,
          locationResult,
          typeResult,
          priorityResult,
          templateResult,
        ] = await Promise.all([
          getProgram(task.programId),
          apiFetch<{ locations: LocationChoice[] }>("/api/v1/locations"),
          apiFetch<{ items: RegistryItem[] }>(
            "/api/v1/config/registries/task_type?status=active",
          ),
          apiFetch<{ items: RegistryItem[] }>(
            "/api/v1/config/registries/priority_level?status=active",
          ),
          apiFetch<{ templates: Template[] }>("/api/v1/templates"),
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
        setPriorityLevels(priorityResult.items ?? []);
        const formBundles = await Promise.all(
          (templateResult.templates ?? [])
            .filter(
              (template) =>
                !template.organizationId ||
                template.organizationId === task.organizationId,
            )
            .map((template) =>
              apiFetch<{ versions: FormChoice[] }>(
                `/api/v1/templates/${template.id}`,
              )
                .then((bundle) => ({ template, versions: bundle.versions }))
                .catch(() => ({ template, versions: [] as FormChoice[] })),
            ),
        );
        if (!active) return;
        const publishedForms = formBundles.flatMap(({ template, versions }) =>
          versions.filter(
            (version) => version.id === template.currentPublishedVersionId,
          ),
        );
        if (!publishedForms.some((form) => form.id === task.templateVersionId)) {
          publishedForms.unshift({
            id: task.templateVersionId,
            nameEn: task.form.nameEn,
            nameZh: task.form.nameZh,
            version: task.form.versionNumber,
          });
        }
        setForms(publishedForms);
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
  const canChangeForm =
    acceptsAssignments &&
    !assignments.some(
      (assignment) =>
        ["in_progress", "completed"].includes(assignment.status) ||
        Boolean(assignment.recordId),
    );

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
        templateVersionId: draft.templateVersionId,
        siteId: draft.siteId || null,
        priority: draft.priority || null,
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

  async function notifyAssignees() {
    setBusy(true);
    setError("");
    setNotificationResult("");
    try {
      const { result } = await sendTaskNotification(task.id, {
        message: notificationMessage.trim() || null,
      });
      setNotificationResult(
        locale === "zh"
          ? result.emailConfigured
            ? `已向 ${result.notificationsCreated} 位负责人发送站内通知，${result.emailQueued} 封邮件已进入发送队列。`
            : `已向 ${result.notificationsCreated} 位负责人发送站内通知；Gmail 尚未启用。`
          : result.emailConfigured
            ? `In-app notifications sent to ${result.notificationsCreated} assignee(s); ${result.emailQueued} email(s) queued.`
            : `In-app notifications sent to ${result.notificationsCreated} assignee(s); Gmail is not enabled.`,
      );
      setNotificationMessage("");
      setNotifying(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
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
          {task.status === "open" ? (
            <button
              aria-expanded={notifying}
              className="button button-secondary button-small"
              disabled={busy || !activeAssignments.length}
              onClick={() => setNotifying((value) => !value)}
              type="button"
            >
              {locale === "zh" ? "发送通知" : "Send notification"}
            </button>
          ) : null}
          {recurrence && recurrence.status !== "ended" ? (
            <button
              className="button button-secondary button-small"
              disabled={busy}
              onClick={() => void run(() => updateTaskRecurrenceStatus(
                task.id,
                recurrence.status === "active" ? "paused" : "active",
              ))}
              type="button"
            >
              {recurrence.status === "active"
                ? locale === "zh" ? "暂停重复" : "Pause recurrence"
                : locale === "zh" ? "恢复重复" : "Resume recurrence"}
            </button>
          ) : null}
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
      {notificationResult ? <div className="feedback feedback-info">{notificationResult}</div> : null}
      {notifying ? (
        <div className="notification-compose form-fieldset stack-sm">
          <div>
            <strong>{locale === "zh" ? "提醒所有未完成的负责人" : "Notify all unfinished assignees"}</strong>
            <p className="caption">
              {locale === "zh"
                ? "系统会发送站内通知；如已启用 Gmail，同一内容也会发到成员邮箱。"
                : "The same reminder is sent in-app and, when enabled, through Gmail."}
            </p>
          </div>
          <label>
            {locale === "zh" ? "附加说明（可选）" : "Additional message (optional)"}
            <textarea
              maxLength={4000}
              onChange={(event) => setNotificationMessage(event.target.value)}
              placeholder={locale === "zh" ? "例如：请在活动开始前完成确认。" : "For example: Please confirm before the activity starts."}
              value={notificationMessage}
            />
          </label>
          <div className="row">
            <button
              className="button button-small"
              disabled={busy}
              onClick={() => void notifyAssignees()}
              type="button"
            >
              {busy
                ? locale === "zh" ? "正在发送…" : "Sending…"
                : locale === "zh" ? "发送提醒" : "Send reminder"}
            </button>
            <button
              className="button button-ghost button-small"
              disabled={busy}
              onClick={() => setNotifying(false)}
              type="button"
            >
              {locale === "zh" ? "取消" : "Cancel"}
            </button>
          </div>
        </div>
      ) : null}
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
                  {localizedLocationName(location, locale)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-full">
            {locale === "zh" ? "采集表单" : "Collection form"}
            <select
              disabled={!canChangeForm}
              onChange={(event) =>
                changeDraft("templateVersionId", event.target.value)
              }
              value={draft.templateVersionId}
            >
              {forms.map((form) => (
                <option key={form.id} value={form.id}>
                  {locale === "zh" ? form.nameZh : form.nameEn} · v{form.version}
                </option>
              ))}
            </select>
            <span className="caption">
              {canChangeForm
                ? locale === "zh"
                  ? "可在采集开始前替换为其他已发布表单。"
                  : "You can switch to another published form before collection begins."
                : locale === "zh"
                  ? "已有负责人开始采集，表单版本已锁定以保护现有数据。"
                  : "Collection has started, so this form version is locked to protect existing data."}
            </span>
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
            <span className="row-between">
              <span>
                {locale === "zh" ? "优先级（可选）" : "Priority (optional)"}
              </span>
              {canManageTaskTypes ? (
                <Link
                  className="inline-link"
                  href="/settings/configuration?registry=priority_level"
                >
                  {locale === "zh" ? "管理选项" : "Manage options"}
                </Link>
              ) : null}
            </span>
            <select
              onChange={(event) => changeDraft("priority", event.target.value)}
              value={draft.priority}
            >
              <option value="">
                {locale === "zh" ? "未设置" : "Not set"}
              </option>
              {draft.priority &&
              !priorityLevels.some((item) => item.key === draft.priority) ? (
                <option value={draft.priority}>
                  {draft.priority} · {locale === "zh" ? "已移除" : "Removed"}
                </option>
              ) : null}
              {priorityLevels.map((item) => (
                <option key={item.key} value={item.key}>
                  {locale === "zh" ? item.labelZh : item.labelEn}
                </option>
              ))}
            </select>
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
    templateVersionId: task.templateVersionId,
    siteId: task.siteId ?? "",
    dueAt: toLocalDateTime(task.dueAt),
    priority: task.priority ?? "",
  };
}

function toLocalDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
