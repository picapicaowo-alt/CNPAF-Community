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
import { taskDate, taskTone, type TaskSummary } from "@/lib/task-ui";

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
  const visible = useMemo(
    () =>
      tasks.filter((task) => {
        if (filter === "all") return true;
        return task.status === filter || task.myAssignment?.status === filter;
      }),
    [filter, tasks],
  );

  return (
    <div className="stack">
      <PageHeader
        title={locale === "zh" ? "任务" : "Tasks"}
        description={
          locale === "zh"
            ? "规划由谁、在何时何地采集什么。"
            : "Plan who collects what, where, and when."
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
            {item === "all"
              ? locale === "zh"
                ? "全部"
                : "All"
              : item.replaceAll("_", " ")}
          </button>
        ))}
      </div>
      {loading ? (
        <LoadingState rows={5} />
      ) : error ? (
        <ErrorState message={error} retry={load} />
      ) : visible.length ? (
        <div className="list-panel">
          <div className="list-panel-title">
            {locale === "zh" ? "任务列表" : "Tasks"}
          </div>
          {visible.map((task) => (
            <Link className="list-row" href={`/tasks/${task.id}`} key={task.id}>
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
                  {(task.myAssignment?.status ?? task.status).replaceAll(
                    "_",
                    " ",
                  )}
                </StatusPill>
                <span className="list-row-arrow">
                  <AppIcon name="arrow" />
                </span>
              </div>
            </Link>
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
