import { and, eq } from "drizzle-orm";
import {
  jobs,
  notificationEmailDeliveries,
  notificationPreferences,
  notifications,
  tasks,
  users,
} from "@cnpaf/db/schema";
import { getNotificationEmailRuntimeConfig } from "@/config/server";
import { db } from "@/lib/db";
import { sendGmailMessage } from "@/lib/gmail";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type TaskNotificationInput = {
  userId: string;
  kindKey: "task_assigned" | "task_reassigned" | "task_reminder";
  title: string;
  body: string;
  taskId: string;
  metadata?: Record<string, unknown>;
};

export type NotificationInput = {
  userId: string;
  kindKey:
    | TaskNotificationInput["kindKey"]
    | "group_membership_changed"
    | "program_membership_changed"
    | "access_changed"
    | "affiliation_changed";
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

export async function queueTaskNotification(
  tx: DbTransaction,
  input: TaskNotificationInput,
) {
  return queueNotification(tx, {
    ...input,
    entityType: "task",
    entityId: input.taskId,
  });
}

export async function queueNotification(
  tx: DbTransaction,
  input: NotificationInput,
) {
  const [recipient, preference] = await Promise.all([
    tx.select({ email: users.email, status: users.status })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1)
      .then((rows) => rows[0]),
    tx.select()
      .from(notificationPreferences)
      .where(and(
        eq(notificationPreferences.userId, input.userId),
        eq(notificationPreferences.kindKey, input.kindKey),
      ))
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  if (!recipient || recipient.status !== "active") {
    return { notification: null, emailStatus: "recipient_inactive" as const };
  }

  const inAppEnabled = preference?.inAppEnabled ?? true;
  const [notification] = await tx.insert(notifications).values({
    userId: input.userId,
    kindKey: input.kindKey,
    title: input.title,
    body: input.body,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    status: inAppEnabled ? "unread" : "read",
    readAt: inAppEnabled ? null : new Date(),
    metadata: input.metadata ?? {},
  }).returning();

  const config = getNotificationEmailRuntimeConfig();
  if (!config.enabled) return { notification, emailStatus: "disabled" as const };
  const emailEnabled = preference?.emailEnabled ?? true;
  const recipientDomain = recipient.email.split("@").at(-1)?.toLowerCase();
  const canDeliver = emailEnabled && Boolean(
    recipientDomain && config.allowedRecipientDomains.has(recipientDomain),
  );
  const [delivery] = await tx.insert(notificationEmailDeliveries).values({
    notificationId: notification.id,
    provider: config.provider,
    recipientEmail: recipient.email,
    status: canDeliver ? "queued" : "skipped",
    lastError: emailEnabled ? (canDeliver ? null : "recipient_domain_not_allowed") : "email_preference_disabled",
  }).returning();
  if (!canDeliver) return { notification, delivery, emailStatus: "skipped" as const };

  await tx.insert(jobs).values({
    kind: "send_notification_email",
    payload: { deliveryId: delivery.id },
    status: "queued",
    maxAttempts: 3,
    idempotencyKey: `notification-email:${notification.id}`,
  }).onConflictDoNothing({ target: jobs.idempotencyKey });
  return { notification, delivery, emailStatus: "queued" as const };
}

export async function runNotificationEmailDelivery(deliveryId: string) {
  const row = await db.select({
    delivery: notificationEmailDeliveries,
    notification: notifications,
    recipientName: users.name,
    recipientStatus: users.status,
  })
    .from(notificationEmailDeliveries)
    .innerJoin(notifications, eq(notificationEmailDeliveries.notificationId, notifications.id))
    .innerJoin(users, eq(notifications.userId, users.id))
    .where(eq(notificationEmailDeliveries.id, deliveryId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!row) throw new Error("Notification email delivery not found");
  if (row.delivery.status === "sent" || row.delivery.status === "skipped") return;
  if (row.recipientStatus !== "active") {
    await db.update(notificationEmailDeliveries).set({
      status: "skipped",
      lastError: "recipient_inactive",
      updatedAt: new Date(),
    }).where(eq(notificationEmailDeliveries.id, deliveryId));
    return;
  }

  await db.update(notificationEmailDeliveries).set({
    status: "sending",
    attempts: row.delivery.attempts + 1,
    lastError: null,
    updatedAt: new Date(),
  }).where(eq(notificationEmailDeliveries.id, deliveryId));
  try {
    const task = row.notification.entityType === "task" && row.notification.entityId
      ? await db.select().from(tasks).where(eq(tasks.id, row.notification.entityId)).limit(1).then((rows) => rows[0])
      : undefined;
    const message = task ? buildTaskEmail({
      recipientName: row.recipientName,
      recipientEmail: row.delivery.recipientEmail,
      notificationKind: row.notification.kindKey,
      notificationBody: row.notification.body,
      task,
    }) : buildGeneralNotificationEmail({
      recipientName: row.recipientName,
      recipientEmail: row.delivery.recipientEmail,
      notificationTitle: row.notification.title,
      notificationBody: row.notification.body,
      metadata: row.notification.metadata,
    });
    const result = await sendGmailMessage(message);
    await db.update(notificationEmailDeliveries).set({
      status: "sent",
      providerMessageId: result.providerMessageId,
      sentAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(notificationEmailDeliveries.id, deliveryId));
  } catch (error) {
    await db.update(notificationEmailDeliveries).set({
      status: "failed",
      lastError: error instanceof Error ? error.message : "Gmail delivery failed",
      updatedAt: new Date(),
    }).where(eq(notificationEmailDeliveries.id, deliveryId));
    throw error;
  }
}

function buildTaskEmail({
  recipientName,
  recipientEmail,
  notificationKind,
  notificationBody,
  task,
}: {
  recipientName: string;
  recipientEmail: string;
  notificationKind: string;
  notificationBody: string;
  task: typeof tasks.$inferSelect;
}) {
  const config = getNotificationEmailRuntimeConfig();
  if (!config.enabled) throw new Error("Gmail notification delivery is disabled");
  const taskUrl = `${config.appBaseUrl}/tasks/${task.id}`;
  const due = task.dueAt
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(task.dueAt)
    : "Not set";
  const isReminder = notificationKind === "task_reminder";
  const subject = `${isReminder ? "Task reminder" : "New task assigned"}: ${task.title}`;
  const greeting = `Hello ${recipientName},`;
  const action = "View task";
  const dueLabel = "Due";
  const text = [
    greeting,
    "",
    notificationBody,
    "",
    task.title,
    `${dueLabel}: ${due}`,
    task.instructions ?? "",
    "",
    `${action}: ${taskUrl}`,
  ].filter((line) => line !== "").join("\n");
  const html = `<!doctype html><html><body style="font-family:Arial,'PingFang SC',sans-serif;color:#17324d;line-height:1.55"><div style="max-width:620px;margin:0 auto;padding:24px"><p>${escapeHtml(greeting)}</p><p>${escapeHtml(notificationBody)}</p><div style="border-left:4px solid #036eb7;padding:14px 18px;background:#f5f9fc"><h2 style="margin:0 0 8px;font-size:20px">${escapeHtml(task.title)}</h2><p style="margin:0"><strong>${escapeHtml(dueLabel)}:</strong> ${escapeHtml(due)}</p>${task.instructions ? `<p style="margin:8px 0 0">${escapeHtml(task.instructions)}</p>` : ""}</div><p style="margin-top:22px"><a href="${escapeHtml(taskUrl)}" style="display:inline-block;background:#036eb7;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">${escapeHtml(action)}</a></p></div></body></html>`;
  return { to: recipientEmail, subject, text, html };
}

function buildGeneralNotificationEmail({
  recipientName,
  recipientEmail,
  notificationTitle,
  notificationBody,
  metadata,
}: {
  recipientName: string;
  recipientEmail: string;
  notificationTitle: string;
  notificationBody: string;
  metadata: unknown;
}) {
  const config = getNotificationEmailRuntimeConfig();
  if (!config.enabled) throw new Error("Gmail notification delivery is disabled");
  const record = metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {};
  const subject = typeof record.emailSubject === "string"
    ? record.emailSubject
    : `[CNPAF] ${notificationTitle}`;
  const actionPath = typeof record.actionPath === "string" && record.actionPath.startsWith("/")
    ? record.actionPath
    : "/notifications";
  const actionUrl = `${config.appBaseUrl}${actionPath}`;
  const greeting = `Hello ${recipientName},`;
  const text = [greeting, "", notificationBody, "", `Review this update: ${actionUrl}`].join("\n");
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#17324d;line-height:1.55"><div style="max-width:620px;margin:0 auto;padding:24px"><p>${escapeHtml(greeting)}</p><h2 style="font-size:20px">${escapeHtml(notificationTitle)}</h2><p>${escapeHtml(notificationBody)}</p><p style="margin-top:22px"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#036eb7;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Review this update</a></p></div></body></html>`;
  return { to: recipientEmail, subject, text, html };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}
