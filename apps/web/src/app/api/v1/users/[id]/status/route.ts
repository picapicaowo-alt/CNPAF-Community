import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { users } from "@cnpaf/db/schema";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { jsonError, requirePermission } from "@/lib/http";
import { authorize } from "@/lib/authorization";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = (await req.json()) as { status?: string; reason?: string };
  if (!body.status || !["active", "inactive"].includes(body.status)) return jsonError("status must be active or inactive");
  const permission = body.status === "inactive" ? "users.deactivate" : "users.edit";
  const { user, error } = await requirePermission(permission);
  if (error || !user) return error;
  const { id } = await params;
  const before = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  if (!before) return jsonError("User not found", 404);
  if (!(await authorize({ userId: user.id, permission, resource: { organizationId: before.organizationId } })).allowed) return jsonError("Forbidden", 403);
  const [after] = await db.update(users).set({ status: body.status, updatedAt: new Date() }).where(eq(users.id, id)).returning();
  await audit({ actorId: user.id, action: `user.${body.status}`, entityType: "user", entityId: id, targetUserId: id, beforeState: before, afterState: after, reason: body.reason ?? null });
  return NextResponse.json({ user: after });
}
