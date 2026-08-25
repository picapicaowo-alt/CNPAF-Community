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
import {
  NotificationPanel,
  type InAppNotification,
} from "@/features/notifications/NotificationPanel";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { listLocalDrafts, type LocalDraft } from "@/lib/offline";
import {
  taskDate,
  taskStatusLabel,
  taskTone,
  type TaskSummary,
} from "@/lib/task-ui";

type Me = { user: { name: string }; permissions: string[] };
type ReviewItem = {
  id: string;
  itemType: string;
  title: string;
  status: string;
  updatedAt: string;
};
type RecordRow = { id: string; reviewStatus: string };

export default function DashboardPage() {
  const { locale } = useI18n();
  const [me, setMe] = useState<Me | null>(null);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [drafts, setDrafts] = useState<LocalDraft[]>([]);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const identity = await apiFetch<Me>("/api/v1/auth/me");
      setMe(identity);
      const canReview = identity.permissions.includes("review.view");
      const canReadRecords = identity.permissions.some((key) =>
        ["records.view", "records.view_own", "records.view_approved"].includes(
          key,
        ),
      );
      const [
        taskResult,
        reviewResult,
        recordResult,
        notificationResult,
        localDrafts,
      ] =
        await Promise.all([
          apiFetch<{ tasks: TaskSummary[] }>("/api/v1/tasks/today"),
          canReview
            ? apiFetch<{ items: ReviewItem[] }>("/api/v1/review/inbox")
            : Promise.resolve({ items: [] }),
          canReadRecords
            ? apiFetch<{ records: RecordRow[] }>("/api/v1/records")
            : Promise.resolve({ records: [] }),
          identity.permissions.includes("notifications.view")
            ? apiFetch<{ notifications: InAppNotification[] }>(
                "/api/v1/notifications?status=unread",
              )
            : Promise.resolve({ notifications: [] }),
          listLocalDrafts().catch(() => []),
        ]);
      setTasks(taskResult.tasks ?? []);
      setReviewItems(reviewResult.items ?? []);
      setRecords(recordResult.records ?? []);
      setNotifications(notificationResult.notifications ?? []);
      setDrafts(localDrafts ?? []);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const permissions = useMemo(() => new Set(me?.permissions ?? []), [me]);
  const staffView =
    permissions.has("review.view") || permissions.has("tasks.create");
  const currentTask =
    tasks.find((task) => task.myAssignment?.status === "in_progress") ??
    tasks[0];
  const nextTasks = currentTask
    ? tasks.filter((task) => task.id !== currentTask.id).slice(0, 2)
    : [];
  const pendingDrafts = drafts.filter(
    (draft) => draft.syncStatus !== "synced",
  ).length;
  const hour = new Date().getHours();
  const greeting =
    locale === "zh"
      ? `${hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好"}，${me?.user.name ?? ""}`
      : `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, ${me?.user.name ?? ""}`;

  if (loading)
    return (
      <>
        <PageHeader title={locale === "zh" ? "首页" : "Home"} />
        <LoadingState rows={5} />
      </>
    );
  if (error)
    return (
      <>
        <PageHeader title={locale === "zh" ? "首页" : "Home"} />
        <ErrorState message={error} retry={load} />
      </>
    );

  if (!staffView) {
    return (
      <div className="stack">
        <PageHeader
          title={locale === "zh" ? "今天" : "Today"}
          description={greeting}
        />
        <NotificationPanel
          locale={locale}
          notifications={notifications}
          onOpen={(notificationId) => {
            setNotifications((current) =>
              current.filter((notification) => notification.id !== notificationId),
            );
            void apiFetch(`/api/v1/notifications/${notificationId}/read`, {
              method: "POST",
            });
          }}
        />
        {currentTask ? (
          <Link
            className="card card-interactive"
            href={`/tasks/${currentTask.id}`}
          >
            <div className="row-between mobile-stack">
              <div className="stack-sm">
                <StatusPill tone="blue">
                  {taskDate(currentTask.dueAt ?? currentTask.opensAt, locale)}
                </StatusPill>
                <div>
                  <h2>{currentTask.location?.name ?? currentTask.title}</h2>
                  <p className="muted">{currentTask.title}</p>
                </div>
                <div className="caption">
                  {currentTask.location?.address ??
                    currentTask.form[locale === "zh" ? "nameZh" : "nameEn"]}
                </div>
              </div>
              <span className="button">
                {currentTask.myAssignment?.status === "in_progress"
                  ? locale === "zh"
                    ? "继续"
                    : "Continue"
                  : locale === "zh"
                    ? "开始"
                    : "Start"}
              </span>
            </div>
          </Link>
        ) : (
          <EmptyState
            icon="tasks"
            title={locale === "zh" ? "今天没有任务" : "No tasks today"}
            description={
              locale === "zh"
                ? "新的采集任务会显示在这里。"
                : "New collection assignments will appear here."
            }
          />
        )}

        {nextTasks.length ? (
          <section>
            <div className="section-title">
              <h2>{locale === "zh" ? "接下来" : "Next"}</h2>
            </div>
            <div className="stack-sm">
              {nextTasks.map((task) => (
                <Link
                  className="card card-compact card-interactive row-between"
                  href={`/tasks/${task.id}`}
                  key={task.id}
                >
                  <div>
                    <div className="list-row-title">
                      {task.location?.name ?? task.title}
                    </div>
                    <div className="list-row-subtitle">
                      {taskDate(task.dueAt ?? task.opensAt, locale)}
                    </div>
                  </div>
                  <AppIcon
                    name="arrow"
                    style={{ width: 18, height: 18, color: "var(--muted)" }}
                  />
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <Link className="feedback feedback-info" href="/capture">
          <strong>{locale === "zh" ? "+ 快速采集" : "+ Quick capture"}</strong>
          <span className="caption">
            {locale === "zh"
              ? "记录未分配的现场情况"
              : "Record something that was not assigned"}
          </span>
        </Link>
        <div
          className={`feedback ${pendingDrafts ? "feedback-warning" : "feedback-success"}`}
          role="status"
        >
          <div>
            <strong>
              {pendingDrafts
                ? locale === "zh"
                  ? "等待同步"
                  : "Waiting to sync"
                : locale === "zh"
                  ? "所有内容已保存"
                  : "Everything saved"}
            </strong>
            <p>
              {pendingDrafts
                ? `${pendingDrafts} ${locale === "zh" ? "条记录将在联网后同步" : "record(s) will sync when online"}`
                : locale === "zh"
                  ? "本机没有待同步内容"
                  : "Nothing is waiting on this device"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const needsUpdate = records.filter(
    (record) => record.reviewStatus === "needs_completion",
  ).length;
  return (
    <div className="stack">
      <PageHeader
        title={locale === "zh" ? "首页" : "Home"}
        description={
          locale === "zh"
            ? "所有需要你关注的工作，都在一个地方。"
            : "Everything that needs your attention, in one place."
        }
      />
      <NotificationPanel
        locale={locale}
        notifications={notifications}
        onOpen={(notificationId) => {
          setNotifications((current) =>
            current.filter((notification) => notification.id !== notificationId),
          );
          void apiFetch(`/api/v1/notifications/${notificationId}/read`, {
            method: "POST",
          });
        }}
      />
      <section>
        <div className="section-title">
          <h2>{locale === "zh" ? "需要关注" : "Needs your attention"}</h2>
        </div>
        <div className="grid-3">
          <Link className="card stat-card card-interactive" href="/review">
            <div className="stat-value">{reviewItems.length}</div>
            <div className="stat-label">
              {locale === "zh" ? "待人工审核" : "Records need review"}
            </div>
            <div className="stat-link">
              {locale === "zh" ? "打开审核 →" : "Review now →"}
            </div>
          </Link>
          <Link className="card stat-card card-interactive" href="/tasks">
            <div className="stat-value">{tasks.length}</div>
            <div className="stat-label">
              {locale === "zh" ? "今日到期任务" : "Tasks due today"}
            </div>
            <div className="stat-link">
              {locale === "zh" ? "查看任务 →" : "View tasks →"}
            </div>
          </Link>
          <Link className="card stat-card card-interactive" href="/records">
            <div className="stat-value">{needsUpdate}</div>
            <div className="stat-label">
              {locale === "zh" ? "需补充的提交" : "Submissions need an update"}
            </div>
            <div className="stat-link">
              {locale === "zh" ? "打开记录 →" : "Open records →"}
            </div>
          </Link>
        </div>
      </section>

      <section>
        <div className="section-title">
          <h2>{locale === "zh" ? "今天" : "Today"}</h2>
        </div>
        <div className="content-aside">
          <div className="list-panel">
            {tasks.length ? (
              tasks.slice(0, 3).map((task) => (
                <Link
                  className="list-row"
                  href={`/tasks/${task.id}`}
                  key={task.id}
                >
                  <div>
                    <div className="list-row-title">
                      {task.location?.name ?? task.title}
                    </div>
                    <div className="list-row-subtitle">
                      {taskDate(task.dueAt ?? task.opensAt, locale)}
                    </div>
                  </div>
                  <div className="muted">{task.title}</div>
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
                </Link>
              ))
            ) : (
              <EmptyState
                icon="tasks"
                title={locale === "zh" ? "今天没有任务" : "No tasks today"}
                description={
                  locale === "zh"
                    ? "可以从任务页面安排新的采集工作。"
                    : "Schedule new collection work from Tasks."
                }
              />
            )}
          </div>
          <div className="card stack-sm">
            <h3>{locale === "zh" ? "快捷操作" : "Quick actions"}</h3>
            {permissions.has("tasks.create") ? (
              <Link className="button button-wide" href="/tasks/new">
                {locale === "zh" ? "分配任务" : "Assign task"}
              </Link>
            ) : null}
            {permissions.has("templates.create") ? (
              <Link
                className="button button-secondary button-wide"
                href="/forms/new"
              >
                {locale === "zh" ? "创建表单" : "Create form"}
              </Link>
            ) : null}
            {permissions.has("people.create_account") ? (
              <Link
                className="button button-secondary button-wide"
                href="/people/new"
              >
                {locale === "zh" ? "创建账号" : "Create account"}
              </Link>
            ) : null}
            {permissions.has("analytics.view") ||
            permissions.has("insights.view") ? (
              <Link
                className="button button-secondary button-wide"
                href="/insights"
              >
                {locale === "zh" ? "查看洞察" : "View insights"}
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
