import bcrypt from "bcryptjs";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import {
  accountActionTokens,
  auditEvents,
  sessions,
  users,
} from "@cnpaf/db/schema";
import { audit } from "../audit";
import { ApiError } from "../api-error";
import { randomToken, sha256 } from "../crypto";
import { db } from "../db";
import { queueNotification } from "./notification-delivery";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type AccountActionPurpose = "onboarding" | "password_reset";

const TOKEN_LIFETIME_MS = 1000 * 60 * 60 * 24;
const REQUEST_COOLDOWN_MS = 1000 * 60 * 5;

export async function issueAccountActionToken(
  tx: DbTransaction,
  input: {
    userId: string;
    purpose: AccountActionPurpose;
    requestedById?: string | null;
  },
) {
  const token = randomToken(32);
  const now = new Date();
  await tx.update(accountActionTokens).set({ usedAt: now }).where(and(
    eq(accountActionTokens.userId, input.userId),
    eq(accountActionTokens.purpose, input.purpose),
    isNull(accountActionTokens.usedAt),
  ));
  await tx.insert(accountActionTokens).values({
    userId: input.userId,
    purpose: input.purpose,
    tokenHash: sha256(token),
    expiresAt: new Date(now.getTime() + TOKEN_LIFETIME_MS),
    requestedById: input.requestedById ?? null,
  });
  return token;
}

export async function requestPasswordReset(email: string, requestId?: string) {
  const target = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    status: users.status,
  }).from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1)
    .then((rows) => rows[0]);
  if (!target || target.status !== "active") return { accepted: true, emailQueued: false };

  const recent = await db.select({ id: accountActionTokens.id })
    .from(accountActionTokens)
    .where(and(
      eq(accountActionTokens.userId, target.id),
      eq(accountActionTokens.purpose, "password_reset"),
      isNull(accountActionTokens.usedAt),
      gt(accountActionTokens.createdAt, new Date(Date.now() - REQUEST_COOLDOWN_MS)),
    ))
    .orderBy(desc(accountActionTokens.createdAt))
    .limit(1)
    .then((rows) => rows[0]);
  if (recent) return { accepted: true, emailQueued: false };

  return db.transaction(async (tx) => {
    const token = await issueAccountActionToken(tx, {
      userId: target.id,
      purpose: "password_reset",
      requestedById: target.id,
    });
    const queued = await queueNotification(tx, {
      userId: target.id,
      kindKey: "password_reset_requested",
      title: "Reset your CNPAF Community password",
      body: "Use the secure link below to choose a new password. If you did not request this, you can ignore this message.",
      entityType: "user",
      entityId: target.id,
      metadata: {
        actionPath: `/reset-password/${token}`,
        emailSubject: "Reset your CNPAF Community password",
        actionLabel: "Reset password",
      },
    });
    await audit({
      actorId: target.id,
      action: "account.password_reset_requested",
      entityType: "user",
      entityId: target.id,
      targetUserId: target.id,
      metadata: { requestId, channel: "email" },
    }, (values) => tx.insert(auditEvents).values(values));
    return { accepted: true, emailQueued: queued.emailStatus === "queued" };
  });
}

export async function completePasswordReset(
  token: string,
  newPassword: string,
  requestId?: string,
) {
  const tokenHash = sha256(token);
  const record = await db.select({
    token: accountActionTokens,
    userStatus: users.status,
  }).from(accountActionTokens)
    .innerJoin(users, eq(accountActionTokens.userId, users.id))
    .where(and(
      eq(accountActionTokens.tokenHash, tokenHash),
      isNull(accountActionTokens.usedAt),
      gt(accountActionTokens.expiresAt, new Date()),
    ))
    .limit(1)
    .then((rows) => rows[0]);
  if (!record || record.userStatus !== "active") {
    throw new ApiError("BAD_REQUEST", "This password link is invalid or has expired", 400);
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  return db.transaction(async (tx) => {
    const [claimed] = await tx.update(accountActionTokens).set({ usedAt: new Date() })
      .where(and(
        eq(accountActionTokens.id, record.token.id),
        isNull(accountActionTokens.usedAt),
      ))
      .returning({ id: accountActionTokens.id });
    if (!claimed) throw new ApiError("CONFLICT", "This password link has already been used", 409);
    await tx.update(users).set({
      passwordHash,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(users.id, record.token.userId));
    await tx.delete(sessions).where(eq(sessions.userId, record.token.userId));
    await audit({
      actorId: record.token.userId,
      action: record.token.purpose === "onboarding"
        ? "account.onboarding_completed"
        : "account.password_reset_completed",
      entityType: "user",
      entityId: record.token.userId,
      targetUserId: record.token.userId,
      metadata: { requestId, tokenPurpose: record.token.purpose },
    }, (values) => tx.insert(auditEvents).values(values));
    return { completed: true };
  });
}
