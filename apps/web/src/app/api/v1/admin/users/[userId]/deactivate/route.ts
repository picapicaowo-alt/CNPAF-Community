import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { sessions, users } from "@cnpaf/db/schema";
import { db } from "@/lib/db";
import { requirePermission, jsonError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/authorization";

export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { user, error } = await requirePermission("users.deactivate");
  if (error || !user) return error;
  const { userId } = await params;
  if (userId === user.id) return jsonError("You cannot deactivate your own active session", 409);
  const body = await req.json().catch(() => ({})) as { reason?: string };
  const before = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!before) return jsonError("User not found", 404);
  if (!(await authorize({ userId: user.id, permission: "users.deactivate", resource: { organizationId: before.organizationId } })).allowed) return jsonError("Forbidden", 403);
  const [after] = await db.transaction(async (tx) => {
    const rows = await tx.update(users).set({ status: "inactive", updatedAt: new Date() }).where(eq(users.id, userId)).returning();
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    return rows;
  });
  await audit({ actorId: user.id, action: "user.deactivated", entityType: "user", entityId: userId, targetUserId: userId, beforeState: before, afterState: after, reason: body.reason ?? null });
  return NextResponse.json({ user: after });
}
