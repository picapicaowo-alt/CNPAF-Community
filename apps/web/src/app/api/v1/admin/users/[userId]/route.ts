import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { users } from "@cnpaf/db/schema";
import { adminUserUpdateBodySchema } from "@cnpaf/shared";
import { db } from "@/lib/db";
import { requirePermission, jsonError } from "@/lib/http";
import { getUserAccess } from "@/lib/access-admin";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/authorization";

type Context = { params: Promise<{ userId: string }> };

export async function GET(_req: Request, { params }: Context) {
  const { user, error } = await requirePermission("users.view");
  if (error) return error;
  const { userId } = await params;
  const access = await getUserAccess(userId);
  if (access && !(await authorize({ userId: user.id, permission: "users.view", resource: { organizationId: access.user.organizationId } })).allowed) return jsonError("Forbidden", 403);
  return access ? NextResponse.json(access) : jsonError("User not found", 404);
}

export async function PATCH(req: Request, { params }: Context) {
  const { user, error } = await requirePermission("users.edit");
  if (error || !user) return error;
  const parsed = adminUserUpdateBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { userId } = await params;
  const before = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!before) return jsonError("User not found", 404);
  if (!(await authorize({ userId: user.id, permission: "users.edit", resource: { organizationId: before.organizationId } })).allowed) return jsonError("Forbidden", 403);
  if (parsed.data.organizationId !== undefined && !(await authorize({ userId: user.id, permission: "users.edit", resource: { organizationId: parsed.data.organizationId } })).allowed) return jsonError("Forbidden for destination organization", 403);
  const [after] = await db.update(users).set({ ...parsed.data, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
  await audit({ actorId: user.id, action: "user.updated", entityType: "user", entityId: userId, targetUserId: userId, beforeState: before, afterState: after });
  return NextResponse.json({ user: after });
}
