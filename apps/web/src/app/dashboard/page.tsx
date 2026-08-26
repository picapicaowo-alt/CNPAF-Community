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

type Me = {
  user: { name: string };
  roles: Array<{ key: string; nameEn: string; nameZh: string }>;
  permissions: string[];
};
type ReviewItem = {
  id: string;
  itemType: string;
  title: string;
  status: string;
  updatedAt: string;
};
type RecordRow = {
  id: string;
  reviewStatus: string;
  researchUseStatus?: string;
};
type ReportRow = { id: string; status: string };

export default function DashboardPage() {
  const { locale } = useI18n();
  const [me, setMe] = useState<Me | null>(null);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
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
      const canReadTasks = identity.permissions.includes("tasks.view");
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
        reportResult,
        localDrafts,
      ] =
        await Promise.all([
          canReadTasks
            ? apiFetch<{ tasks: TaskSummary[] }>("/api/v1/tasks/today")
            : Promise.resolve({ tasks: [] }),
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
          identity.permissions.includes("reports.view")
            ? apiFetch<{ reports: ReportRow[] }>("/api/v1/reports")
            : Promise.resolve({ reports: [] }),
          listLocalDrafts().catch(() => []),
        ]);
      setTasks(taskResult.tasks ?? []);
      setReviewItems(reviewResult.items ?? []);
      setRecords(recordResult.records ?? []);
      setNotifications(notificationResult.notifications ?? []);
      setReports(reportResult.reports ?? []);
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
  const roleKey = me?.roles?.[0]?.key ?? "volunteer";
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
      ? `${hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好"}，${me?.roles?.[0]?.nameZh ?? me?.user.name ?? ""}`
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

  const openNotification = (notificationId: string) => {
    setNotifications((current) =>
      current.filter((notification) => notification.id !== notificationId),
    );
    void apiFetch(`/api/v1/notifications/${notificationId}/read`, {
      method: "POST",
    });
  };

  if (roleKey === "winston_research") {
    const researchReady = records.filter(
      (record) => record.researchUseStatus === "approved_for_research",
    ).length;
    const publishedReports = reports.filter(
      (report) => report.status === "published",
    ).length;
    return (
      <div className="stack stakeholder-home">
        <PageHeader
          title={locale === "zh" ? "研究入口" : "Research access"}
          description={
            locale === "zh"
              ? "查看已批准证据、研究洞察与可共享成果。"
              : "Explore approved evidence, research insights, and shareable outputs."
          }
        />
        <NotificationPanel
          locale={locale}
          notifications={notifications}
          onOpen={openNotification}
        />
        <section className="role-home-hero">
          <Link className="role-home-primary" href="/insights">
            <span className="role-home-label">
              {locale === "zh" ? "授权证据范围" : "Authorized evidence"}
            </span>
            <strong>{records.length}</strong>
            <span>
              {locale === "zh"
                ? "从已审核证据开始探索变化、关注点与缺口"
                : "Start with reviewed evidence, changes, concerns, and gaps"}
            </span>
            <span className="role-home-link">
              {locale === "zh" ? "打开洞察" : "Open insights"}
              <AppIcon name="arrow" />
            </span>
          </Link>
          <div className="role-home-side">
            <Link className="role-home-stat" href="/records">
              <span>{locale === "zh" ? "可用于研究" : "Research ready"}</span>
              <strong>{researchReady}</strong>
              <AppIcon name="arrow" />
            </Link>
            <Link className="role-home-stat" href="/reports">
              <span>{locale === "zh" ? "已发布报告" : "Published reports"}</span>
              <strong>{publishedReports}</strong>
              <AppIcon name="arrow" />
            </Link>
          </div>
        </section>
        <section>
          <div className="section-title">
            <h2>{locale === "zh" ? "研究资源" : "Research resources"}</h2>
          </div>
          <div className="role-home-links">
            {[
              {
                href: "/data",
                icon: "data" as const,
                title: locale === "zh" ? "数据集与下载" : "Datasets and downloads",
                detail: locale === "zh" ? "使用受控导出继续分析" : "Continue analysis with controlled exports",
              },
              {
                href: "/insights/gaps",
                icon: "insights" as const,
                title: locale === "zh" ? "证据缺口" : "Evidence gaps",
                detail: locale === "zh" ? "识别仍需补充的来源与范围" : "Identify sources and scopes that need more evidence",
              },
              {
                href: "/reports",
                icon: "reports" as const,
                title: locale === "zh" ? "研究报告" : "Research reports",
                detail: locale === "zh" ? "查看人工编辑与发布的成果" : "Read human-authored, published findings",
              },
            ].map((item) => (
              <Link className="role-home-link-row" href={item.href} key={item.href}>
                <span className="attention-icon"><AppIcon name={item.icon} /></span>
                <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                <AppIcon name="arrow" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    );
  }

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
          onOpen={openNotification}
        />
        {currentTask ? (
          <Link
            className="current-task-card card card-interactive"
            href={`/tasks/${currentTask.id}`}
          >
            <div className="current-task-layout">
              <div className="current-task-copy">
                <StatusPill tone="blue">
                  {taskDate(currentTask.dueAt ?? currentTask.opensAt, locale)}
                </StatusPill>
                <div className="current-task-heading">
                  <h2>{currentTask.location?.name ?? currentTask.title}</h2>
                  <p className="muted">{currentTask.title}</p>
                </div>
                <div className="caption">
                  {currentTask.location?.address ??
                    currentTask.form[locale === "zh" ? "nameZh" : "nameEn"]}
                </div>
              </div>
              <span className="current-task-action button">
                {currentTask.myAssignment?.status === "in_progress"
                  ? locale === "zh"
                    ? "继续任务"
                    : "Continue task"
                  : locale === "zh"
                    ? "开始任务"
                    : "Start task"}
                <AppIcon name="arrow" />
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
  const researchReady = records.filter(
    (record) => record.researchUseStatus === "approved_for_research",
  ).length;
  const adminView = roleKey === "admin";
  const researchView = roleKey === "research_lead";
  const operationsView = roleKey === "operations_reviewer";
  const defaultAttentionItems = [
    {
      href: "/review",
      icon: "review" as const,
      count: reviewItems.length,
      label: locale === "zh" ? "待人工审核" : "Records need review",
      detail:
        locale === "zh"
          ? "核对来源、附件与隐私标记"
          : "Verify sources, attachments, and privacy flags",
      action: locale === "zh" ? "进入审核" : "Open review",
      priority: reviewItems.length > 0,
    },
    {
      href: "/tasks",
      icon: "tasks" as const,
      count: tasks.length,
      label: locale === "zh" ? "今日到期任务" : "Tasks due today",
      detail:
        locale === "zh"
          ? "检查采集进度与人员安排"
          : "Check collection progress and assignments",
      action: locale === "zh" ? "查看任务" : "View tasks",
      priority: false,
    },
    {
      href: "/records",
      icon: "records" as const,
      count: needsUpdate,
      label: locale === "zh" ? "需补充的提交" : "Submissions need an update",
      detail:
        locale === "zh"
          ? "退回采集人补齐缺失证据"
          : "Return incomplete evidence to collectors",
      action: locale === "zh" ? "打开记录" : "Open records",
      priority: needsUpdate > 0,
    },
  ];
  const researchAttentionItems = [
    {
      href: "/records",
      icon: "records" as const,
      count: researchReady,
      label: locale === "zh" ? "可用于研究的证据" : "Evidence ready for research",
      detail: locale === "zh" ? "查看已批准进入研究范围的记录" : "Review records approved for research use",
      action: locale === "zh" ? "查看证据" : "View evidence",
      priority: false,
    },
    {
      href: "/insights/gaps",
      icon: "insights" as const,
      count: needsUpdate,
      label: locale === "zh" ? "需要补齐的证据" : "Evidence gaps to close",
      detail: locale === "zh" ? "定位不完整来源与采集覆盖缺口" : "Locate incomplete sources and coverage gaps",
      action: locale === "zh" ? "查看缺口" : "View gaps",
      priority: needsUpdate > 0,
    },
    {
      href: "/reports",
      icon: "reports" as const,
      count: reports.length,
      label: locale === "zh" ? "研究报告" : "Research reports",
      detail: locale === "zh" ? "整理证据并维护报告版本" : "Synthesize evidence and maintain report versions",
      action: locale === "zh" ? "打开报告" : "Open reports",
      priority: false,
    },
  ];
  const attentionItems = researchView
    ? researchAttentionItems
    : defaultAttentionItems;
  const homeTitle = adminView
    ? locale === "zh" ? "系统管理" : "System administration"
    : researchView
      ? locale === "zh" ? "研究工作台" : "Research workspace"
      : locale === "zh" ? "审核工作台" : "Review workspace";
  const homeDescription = adminView
    ? locale === "zh"
      ? "先查看系统待办，再进入人员、表单与配置管理。"
      : "Review system work, then manage people, forms, and configuration."
    : researchView
      ? locale === "zh"
        ? "从可用证据、缺口和报告出发，决定下一步研究工作。"
        : "Start with usable evidence, gaps, and reports to direct the next research step."
      : locale === "zh"
        ? "优先核对风险和缺失证据，再协调今天的采集任务。"
        : "Review risky or incomplete evidence first, then coordinate today's collection work.";
  return (
    <div className={`stack staff-command ${adminView ? "staff-command-admin" : "staff-command-evidence"}`}>
      <PageHeader
        title={homeTitle}
        description={homeDescription}
      />
      <NotificationPanel
        locale={locale}
        notifications={notifications}
        onOpen={openNotification}
      />
      <section>
        <div className="section-title">
          <h2>
            {researchView
              ? locale === "zh" ? "研究优先事项" : "Research priorities"
              : locale === "zh" ? "处置队列" : "Action queue"}
          </h2>
          <span className="caption">
            {researchView
              ? locale === "zh" ? "按研究可用性组织" : "Organized by research readiness"
              : locale === "zh" ? "按证据风险排序" : "Ordered by evidence risk"}
          </span>
        </div>
        <div className="attention-register">
          {attentionItems.map((item, index) => (
            <Link
              className={`attention-row ${item.priority ? "is-priority" : ""}`}
              href={item.href}
              key={item.href}
            >
              <span className="attention-sequence">0{index + 1}</span>
              <span className="attention-icon" aria-hidden="true">
                <AppIcon name={item.icon} />
              </span>
              <span className="attention-copy">
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </span>
              <strong className="attention-count">{item.count}</strong>
              <span className="attention-action">
                {item.action}
                <AppIcon name="arrow" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="section-title">
          <h2>
            {operationsView
              ? locale === "zh" ? "今日审核与采集" : "Today's review and collection"
              : locale === "zh" ? "今天" : "Today"}
          </h2>
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
