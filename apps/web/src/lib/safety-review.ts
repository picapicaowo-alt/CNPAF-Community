import { and, desc, eq } from "drizzle-orm";
import { auditEvents, records, safetyFlags } from "@cnpaf/db/schema";
import type { z } from "zod";
import type { safetyResolveBodySchema } from "@cnpaf/shared";
import { db } from "./db";
import { evaluateAuthorization, getAccessContext } from "./authorization";
import { audit } from "./audit";
import { ApiError } from "./api-error";

type SafetyResolution = z.infer<typeof safetyResolveBodySchema>;

export async function listSafetyQueue(userId: string) {
  const rows = await db.select({ flag: safetyFlags, record: records }).from(safetyFlags).innerJoin(records, eq(safetyFlags.recordId, records.id)).orderBy(desc(safetyFlags.createdAt));
  const context = await getAccessContext(userId);
  return rows.filter(({ record }) => evaluateAuthorization(context, "safety.view", {
    organizationId: record.organizationId,
    programId: record.programId,
    siteId: record.siteId,
    serviceKey: record.sourceKind,
    researchUse: record.researchUseStatus,
  }).allowed);
}

export async function resolveSafetyFlag(id: string, actorId: string, body: SafetyResolution) {
  const row = (await db.select({ flag: safetyFlags, record: records }).from(safetyFlags)
    .innerJoin(records, eq(safetyFlags.recordId, records.id)).where(eq(safetyFlags.id, id)).limit(1))[0];
  if (!row) throw new ApiError("NOT_FOUND", "Safety flag not found", 404);
  const access = await getAccessContext(actorId);
  if (!evaluateAuthorization(access, "safety.resolve", {
    organizationId: row.record.organizationId,
    programId: row.record.programId,
    siteId: row.record.siteId,
    serviceKey: row.record.sourceKind,
    researchUse: row.record.researchUseStatus,
  }).allowed) throw new ApiError("FORBIDDEN", "Safety flag is outside the assigned scope", 403);
  if (row.flag.status !== "open") throw new ApiError("INVALID_TRANSITION", "Safety flag has already been resolved", 409);
  return db.transaction(async (tx) => {
    const [after] = await tx.update(safetyFlags).set({
      status: body.resolution === "escalated" ? "escalated" : "resolved",
      resolution: body.resolution,
      resolutionNotes: body.notes,
      resolvedById: actorId,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(safetyFlags.id, id), eq(safetyFlags.status, "open"))).returning();
    if (!after) throw new ApiError("CONFLICT", "Safety flag changed concurrently", 409);
    await audit({ actorId, action: "safety.resolved", entityType: "safety_flag", entityId: id, beforeState: row.flag, afterState: after, reason: body.notes ?? null }, (values) => tx.insert(auditEvents).values(values));
    return after;
  });
}
