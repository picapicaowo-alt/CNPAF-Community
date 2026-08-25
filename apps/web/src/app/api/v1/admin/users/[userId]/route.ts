import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auditEvents, sessions, users } from "@cnpaf/db/schema";
import { adminUserUpdateBodySchema } from "@cnpaf/shared";
import { db } from "@/lib/db";
import { requireAnyPermission, requireUser, jsonError } from "@/lib/http";
import { getUserAccess } from "@/lib/access-admin";
import { audit } from "@/lib/audit";
import { authorize, authorizeAny } from "@/lib/authorization";

type Context = { params: Promise<{ userId: string }> };

export async function GET(_req: Request, { params }: Context) {
  const { user, error } = await requireAnyPermission(["people.view", "users.view"]);
  if (error) return error;
  const { userId } = await params;
  const access = await getUserAccess(userId);
  if (access && !(await authorizeAny({ userId: user.id, permissions: ["people.view", "users.view"], resource: { organizationId: access.user.organizationId } })).allowed) return jsonError("Forbidden", 403);
  return access ? NextResponse.json(access) : jsonError("User not found", 404);
}

export async function PATCH(req: Request, { params }: Context) {
  const { user, error } = await requireUser();
  if (error || !user) return error;
  if (user.mustChangePassword) return jsonError("Password change required", 403);
  const parsed = adminUserUpdateBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { userId } = await params;
  const before = (await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    organizationId: users.organizationId,
    locale: users.locale,
    status: users.status,
    mustChangePassword: users.mustChangePassword,
    passwordChangedAt: users.passwordChangedAt,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
  }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!before) return jsonError("User not found", 404);
  if (!(await authorizeAny({ userId: user.id, permissions: ["people.edit_profile", "users.edit"], resource: { organizationId: before.organizationId } })).allowed) return jsonError("Forbidden", 403);
  if (parsed.data.status !== undefined && !(await authorize({ userId: user.id, permission: "users.deactivate", resource: { organizationId: before.organizationId } })).allowed) return jsonError("Forbidden", 403);
  const after = await db.transaction(async (tx) => {
    const [updated] = await tx.update(users).set({ ...parsed.data, updatedAt: new Date() }).where(eq(users.id, userId)).returning({
      id: users.id,
      email: users.email,
      name: users.name,
      organizationId: users.organizationId,
      locale: users.locale,
      status: users.status,
      mustChangePassword: users.mustChangePassword,
      passwordChangedAt: users.passwordChangedAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    });
    if (parsed.data.status !== undefined) await tx.delete(sessions).where(eq(sessions.userId, userId));
    await audit({ actorId: user.id, action: "user.updated", entityType: "user", entityId: userId, targetUserId: userId, beforeState: before, afterState: updated }, (values) => tx.insert(auditEvents).values(values));
    return updated;
  });
  return NextResponse.json({ user: after });
}
