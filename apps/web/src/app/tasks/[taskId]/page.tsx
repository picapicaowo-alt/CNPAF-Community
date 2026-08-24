"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  StatusPill,
} from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { taskDate, taskTone, type TaskDetailResponse } from "@/lib/task-ui";

export default function TaskDetailPage() {
  const { locale } = useI18n();
  const params = useParams<{ taskId: string }>();
  const router = useRouter();
  const [data, setData] = useState<TaskDetailResponse | null>(null);
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(
        await apiFetch<TaskDetailResponse>(`/api/v1/tasks/${params.taskId}`),
      );
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [params.taskId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function start() {
    setBusy(true);
    setError("");
    try {
      if (data?.myAssignment?.status === "assigned")
        await apiFetch(`/api/v1/tasks/${params.taskId}/start`, {
          method: "POST",
        });
      router.push(`/tasks/${params.taskId}/collect`);
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  async function decline() {
    if (!data?.myAssignment || !declineReason.trim()) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(
        `/api/v1/tasks/${params.taskId}/assignments/${data.myAssignment.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: "declined",
            declineReason: declineReason.trim(),
          }),
        },
      );
      await load();
      setDeclining(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!data && !error)
    return (
      <>
        <PageHeader title={locale === "zh" ? "任务" : "Task"} />
        <LoadingState rows={4} />
      </>
    );
  if (!data)
    return (
      <>
        <PageHeader title={locale === "zh" ? "任务" : "Task"} />
        <ErrorState message={error} retry={load} />
      </>
    );
  const { task, myAssignment, assignments } = data;
  const assignedNames = assignments
    .map((assignment) => assignment.assigneeName)
    .filter(Boolean)
    .join(" · ");
  const canWork =
    myAssignment &&
    ["assigned", "in_progress"].includes(myAssignment.status) &&
    task.status === "open";

  return (
    <div className="stack">
      <Link className="inline-link" href="/tasks">
        <AppIcon name="back" />
        {locale === "zh" ? "返回任务" : "Back to tasks"}
      </Link>
      <PageHeader
        title={task.location?.name ?? task.title}
        description={task.title}
        actions={
          <StatusPill tone={taskTone(myAssignment?.status ?? task.status)}>
            {(myAssignment?.status ?? task.status).replaceAll("_", " ")}
          </StatusPill>
        }
      />
      {error ? <ErrorState message={error} /> : null}
      <div className="content-aside">
        <div className="stack">
          <div className="card form-grid">
            <div>
              <div className="caption">{locale === "zh" ? "时间" : "When"}</div>
              <strong>{taskDate(task.dueAt ?? task.opensAt, locale)}</strong>
            </div>
            <div>
              <div className="caption">
                {locale === "zh" ? "地点" : "Where"}
              </div>
              <strong>
                {task.location?.address ??
                  task.location?.name ??
                  (locale === "zh" ? "未指定" : "Not specified")}
              </strong>
            </div>
            <div className="field-full">
              <div className="caption">
                {locale === "zh" ? "任务说明" : "What to do"}
              </div>
              <p style={{ margin: "6px 0 0" }}>
                {task.instructions ||
                  (locale === "zh"
                    ? "按照所附表单完成采集。"
                    : "Complete the attached form for this assignment.")}
              </p>
            </div>
          </div>
          <div className="card row-between mobile-stack">
            <div>
              <div className="caption">
                {locale === "zh" ? "采集表单" : "Collection form"}
              </div>
              <h2 style={{ marginTop: 6 }}>
                {task.form[locale === "zh" ? "nameZh" : "nameEn"]}
              </h2>
              <div className="muted">
                v{task.form.versionNumber} ·{" "}
                {locale === "zh" ? "可离线使用" : "available offline"}
              </div>
            </div>
            <Link
              className="button button-secondary"
              href={`/tasks/${task.id}/collect?preview=1`}
            >
              {locale === "zh" ? "预览" : "Preview"}
            </Link>
          </div>
          {assignedNames ? (
            <div className="feedback feedback-info">
              <div>
                <strong>{locale === "zh" ? "已分配" : "Assigned"}</strong>
                <p>{assignedNames}</p>
              </div>
            </div>
          ) : null}
        </div>
        <aside className="card stack-sm">
          {canWork ? (
            <button
              className="button button-wide"
              disabled={busy}
              onClick={start}
              type="button"
            >
              {myAssignment.status === "in_progress"
                ? locale === "zh"
                  ? "继续任务"
                  : "Continue task"
                : locale === "zh"
                  ? "开始任务"
                  : "Start task"}
            </button>
          ) : null}
          {myAssignment &&
          ["assigned", "in_progress"].includes(myAssignment.status) ? (
            <button
              className="button button-secondary button-wide"
              onClick={() => setDeclining((value) => !value)}
              type="button"
            >
              {locale === "zh" ? "我无法完成此任务" : "I can’t do this task"}
            </button>
          ) : null}
          {declining ? (
            <div className="stack-sm">
              <label>
                {locale === "zh" ? "原因" : "Reason"}
                <textarea
                  value={declineReason}
                  onChange={(event) => setDeclineReason(event.target.value)}
                  placeholder={
                    locale === "zh" ? "请简要说明原因" : "Briefly explain why"
                  }
                />
              </label>
              <button
                className="button button-danger"
                disabled={busy || !declineReason.trim()}
                onClick={decline}
                type="button"
              >
                {locale === "zh" ? "确认拒绝" : "Decline task"}
              </button>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
