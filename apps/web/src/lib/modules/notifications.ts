import { and, desc, eq } from "drizzle-orm";
import { notificationPreferences, notifications, users } from "@cnpaf/db/schema";
import type { z } from "zod";
import type { notificationPreferenceBodySchema } from "@cnpaf/shared";
import { ApiError } from "../api-error";
import { db } from "../db";
import { requireActiveRegistryItem } from "../registries";

type PreferenceInput = z.infer<typeof notificationPreferenceBodySchema>;

export async function listNotifications(userId: string, status?: string | null) {
  return db.select().from(notifications).where(
    status ? and(eq(notifications.userId, userId), eq(notifications.status, status)) : eq(notifications.userId, userId),
  ).orderBy(desc(notifications.createdAt)).limit(200);
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const [notification] = await db.update(notifications).set({
    status: "read",
    readAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId))).returning();
  if (!notification) throw new ApiError("NOT_FOUND", "Notification not found", 404);
  return notification;
}

export async function getNotificationPreferences(userId: string) {
  return db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
}

export async function saveNotificationPreference(userId: string, input: PreferenceInput) {
  const user = (await db.select({ organizationId: users.organizationId }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user) throw new ApiError("NOT_FOUND", "User not found", 404);
  await requireActiveRegistryItem("notification_kind", input.kindKey, user.organizationId);
  const [preference] = await db.insert(notificationPreferences).values({ userId, ...input })
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.kindKey],
      set: { ...input, updatedAt: new Date() },
    }).returning();
  return preference;
}
