import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import { StatusPill } from "@/components/ui";
import { taskDate } from "@/lib/task-ui";

export type InAppNotification = {
  id: string;
  kindKey: string;
  title: string;
  body: string;
  entityType?: string | null;
  entityId?: string | null;
  status: string;
  createdAt: string;
};

export function NotificationPanel({
  locale,
  notifications,
  onOpen,
}: {
  locale: "zh" | "en";
  notifications: InAppNotification[];
  onOpen: (notificationId: string) => void;
}) {
  if (!notifications.length) return null;
  return (
    <section className="stack-sm">
      <div className="section-title">
        <h2>{locale === "zh" ? "通知" : "Notifications"}</h2>
        <StatusPill tone="amber">{notifications.length}</StatusPill>
      </div>
      {notifications.slice(0, 5).map((notification) => (
        <Link
          className="card card-compact card-interactive row-between mobile-stack"
          href={notificationHref(notification)}
          key={notification.id}
          onClick={() => onOpen(notification.id)}
        >
          <span>
            <strong>{notificationTitle(notification, locale)}</strong>
            <span className="caption" style={{ display: "block" }}>
              {notification.body}
            </span>
          </span>
          <span className="row">
            <span className="caption">{taskDate(notification.createdAt, locale)}</span>
            <AppIcon name="arrow" />
          </span>
        </Link>
      ))}
    </section>
  );
}

function notificationHref(notification: InAppNotification) {
  if (notification.entityType === "record" && notification.entityId)
    return `/records/${notification.entityId}`;
  if (notification.entityType === "task" && notification.entityId)
    return `/tasks/${notification.entityId}`;
  return "/dashboard";
}

function notificationTitle(
  notification: InAppNotification,
  locale: "zh" | "en",
) {
  if (locale === "en") return notification.title;
  return (
    {
      task_assigned: "收到新任务",
      task_reassigned: "任务已重新分配",
      record_needs_completion: "提交需要补充",
      record_approved: "提交已批准",
    }[notification.kindKey] ?? notification.title
  );
}
