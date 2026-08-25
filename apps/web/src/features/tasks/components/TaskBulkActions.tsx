"use client";

import { useEffect, useMemo, useState } from "react";
import { getProgram } from "@/features/programs/api";
import type { ProgramMembership } from "@/features/programs/types";
import { errorMessage } from "@/lib/api-client";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";
import type { TaskSummary } from "@/lib/task-ui";
import { bulkMutateTasks, type TaskBulkAction } from "../api";

type Props = {
  canAssign: boolean;
  canEdit: boolean;
  locale: "zh" | "en";
  onCompleted: () => Promise<void>;
  selectedTasks: TaskSummary[];
};

export function TaskBulkActions({
  canAssign,
  canEdit,
  locale,
  onCompleted,
  selectedTasks,
}: Props) {
  const [members, setMembers] = useState<ProgramMembership[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const programIds = useMemo(
    () => [...new Set(selectedTasks.map((task) => task.programId))],
    [selectedTasks],
  );
  const selectedProgramId = programIds.length === 1 ? programIds[0]! : "";
  const oneProgram = Boolean(selectedProgramId);

  useEffect(() => {
    let active = true;
    setAssigneeIds([]);
    setMembers([]);
    if (!canAssign || !oneProgram) return;
    setError("");
    getProgram(selectedProgramId)
      .then((program) => {
        if (active)
          setMembers(
            program.memberships.filter(
              (membership) => membership.status === "active",
            ),
          );
      })
      .catch((caught) => active && setError(errorMessage(caught)));
    return () => {
      active = false;
    };
  }, [canAssign, oneProgram, selectedProgramId]);

  if (!selectedTasks.length) return null;
  const taskIds = selectedTasks.map((task) => task.id);
  const canOpen = selectedTasks.every((task) => task.status === "draft");
  const canClose = selectedTasks.every((task) => task.status === "open");
  const canArchive = selectedTasks.every((task) =>
    ["draft", "closed", "cancelled"].includes(task.status),
  );
  const canRemind = selectedTasks.every((task) => task.status === "open");

  async function run(input: TaskBulkAction) {
    const unfinishedAssignments = selectedTasks.flatMap((task) =>
      task.assignments.filter((assignment) =>
        ["assigned", "in_progress"].includes(assignment.status),
      ),
    ).length;
    if (
      ["close", "archive"].includes(input.action) &&
      !window.confirm(
        locale === "zh"
          ? `确定对 ${selectedTasks.length} 个任务执行此操作？${input.action === "close" && unfinishedAssignments ? `仍有 ${unfinishedAssignments} 个负责人未完成。` : ""}`
          : `Apply this action to ${selectedTasks.length} tasks?${input.action === "close" && unfinishedAssignments ? ` ${unfinishedAssignments} assignee(s) are unfinished.` : ""}`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const { result } = await bulkMutateTasks(input);
      setFeedback(
        locale === "zh"
          ? `已处理 ${result.taskCount} 个任务${result.assignmentsCreated !== undefined ? `，新增 ${result.assignmentsCreated} 个分配` : ""}${result.notificationsCreated !== undefined ? `，发送 ${result.notificationsCreated} 条提醒` : ""}。`
          : `Processed ${result.taskCount} tasks${result.assignmentsCreated !== undefined ? ` and created ${result.assignmentsCreated} assignments` : ""}${result.notificationsCreated !== undefined ? ` and sent ${result.notificationsCreated} reminders` : ""}.`,
      );
      setAssigneeIds([]);
      await onCompleted();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack-sm">
      <div className="row-between mobile-stack">
        <div>
          <h2>{locale === "zh" ? "批量操作" : "Bulk actions"}</h2>
          <p className="caption">
            {locale === "zh"
              ? `已选择 ${selectedTasks.length} 个任务`
              : `${selectedTasks.length} tasks selected`}
          </p>
        </div>
        <div className="row">
          {canEdit ? (
            <>
              <button
                className="button button-secondary button-small"
                disabled={busy || !canOpen}
                onClick={() => void run({ action: "open", taskIds })}
                type="button"
              >
                {locale === "zh" ? "批量开放" : "Open"}
              </button>
              <button
                className="button button-secondary button-small"
                disabled={busy || !canClose}
                onClick={() => void run({ action: "close", taskIds })}
                type="button"
              >
                {locale === "zh" ? "批量关闭" : "Close"}
              </button>
              <button
                className="button button-secondary button-small"
                disabled={busy || !canArchive}
                onClick={() => void run({ action: "archive", taskIds })}
                type="button"
              >
                {locale === "zh" ? "批量归档" : "Archive"}
              </button>
            </>
          ) : null}
          {canAssign ? (
            <button
              className="button button-secondary button-small"
              disabled={busy || !canRemind}
              onClick={() => void run({ action: "remind", taskIds })}
              type="button"
            >
              {locale === "zh" ? "发送提醒" : "Send reminders"}
            </button>
          ) : null}
        </div>
      </div>
      {canAssign ? (
        <div className="row mobile-stack">
          <div className="field" style={{ flex: 1 }}>
            <span>{locale === "zh" ? "增派项目成员（可多选）" : "Add assignees"}</span>
            <MultiSelectDropdown
              disabled={busy || !oneProgram}
              locale={locale}
              onChange={setAssigneeIds}
              options={members.map((member) => ({
                value: member.userId,
                label: member.name,
                description: member.email,
              }))}
              placeholder={
                oneProgram
                  ? locale === "zh"
                    ? "选择一人或多人…"
                    : "Select one or more…"
                  : locale === "zh"
                    ? "批量增派要求任务属于同一项目"
                    : "Bulk assignment requires one program"
              }
              values={assigneeIds}
            />
          </div>
          <button
            className="button button-small"
            disabled={busy || !assigneeIds.length || !oneProgram}
            onClick={() =>
              void run({ action: "assign", taskIds, assigneeIds })
            }
            style={{ alignSelf: "end" }}
            type="button"
          >
            {locale === "zh"
              ? `批量增派${assigneeIds.length ? ` ${assigneeIds.length} 人` : ""}`
              : `Assign${assigneeIds.length ? ` ${assigneeIds.length}` : ""}`}
          </button>
        </div>
      ) : null}
      {error ? <div className="feedback feedback-error">{error}</div> : null}
      {feedback ? (
        <div className="feedback feedback-success">{feedback}</div>
      ) : null}
    </section>
  );
}
