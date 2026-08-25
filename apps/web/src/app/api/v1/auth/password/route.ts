import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { auditEvents, sessions, users } from "@cnpaf/db/schema";
import { changePasswordBodySchema } from "@cnpaf/shared";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/http";
import { destroySession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { ApiError, apiErrorResponse, requestId } from "@/lib/api-error";

export async function POST(req: Request) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requireUser();
    if (error || !user) return error;
    const body = changePasswordBodySchema.parse(await req.json());
    const current = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
    if (!current || !(await bcrypt.compare(body.currentPassword, current.passwordHash))) {
      throw new ApiError("BAD_REQUEST", "Current password is incorrect", 400);
    }
    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    await db.transaction(async (tx) => {
      await tx.update(users).set({
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(users.id, user.id));
      await tx.delete(sessions).where(eq(sessions.userId, user.id));
      await audit({
        actorId: user.id,
        action: "account.password_changed",
        entityType: "user",
        entityId: user.id,
        targetUserId: user.id,
        metadata: { requestId: traceId },
      }, (values) => tx.insert(auditEvents).values(values));
    });
    await destroySession();
    return NextResponse.json({ ok: true, reauthenticationRequired: true });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
