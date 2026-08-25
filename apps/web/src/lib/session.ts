import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { sessions, users } from "@cnpaf/db/schema";
import type { UserRole } from "@cnpaf/shared";
import { db } from "./db";
import { randomToken, sha256 } from "./crypto";
import { useSecureSessionCookies } from "@/config/server";

export const SESSION_COOKIE = "cnpaf_session";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string | null;
  locale: string;
  mustChangePassword: boolean;
  passwordChangedAt: Date | null;
  avatarUrl: string | null;
};

export async function createSession(userId: string): Promise<string> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    expiresAt,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: useSecureSessionCookies(),
    path: "/",
    expires: expiresAt,
  });
  return token;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  }
  jar.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({
      sessionExpires: sessions.expiresAt,
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      organizationId: users.organizationId,
      locale: users.locale,
      status: users.status,
      mustChangePassword: users.mustChangePassword,
      passwordChangedAt: users.passwordChangedAt,
      avatarStorageKey: users.avatarStorageKey,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, sha256(token)))
    .limit(1);
  const row = rows[0];
  if (!row || row.status !== "active" || row.sessionExpires < new Date()) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as UserRole,
    organizationId: row.organizationId,
    locale: row.locale,
    mustChangePassword: row.mustChangePassword,
    passwordChangedAt: row.passwordChangedAt,
    avatarUrl: row.avatarStorageKey ? "/api/v1/account/avatar" : null,
  };
}

export async function invalidateUserSessions(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
