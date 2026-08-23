import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { users } from "@cnpaf/db/schema";
import { db } from "@/lib/db";
import { requirePermission, jsonError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/authorization";

export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { user, error } = await requirePermission("users.deactivate");
  if (error || !user) return error;
  const { userId } = await params;
  const body = await req.json().catch(() => ({})) as { reason?: string };
  const before = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!before) return jsonError("User not found", 404);
  if (!(await authorize({ userId: user.id, permission: "users.deactivate", resource: { organizationId: before.organizationId } })).allowed) return jsonError("Forbidden", 403);
  const [after] = await db.update(users).set({ status: "active", updatedAt: new Date() }).where(eq(users.id, userId)).returning();
  await audit({ actorId: user.id, action: "user.reactivated", entityType: "user", entityId: userId, targetUserId: userId, beforeState: before, afterState: after, reason: body.reason ?? null });
  return NextResponse.json({ user: after });
}
