import { desc, eq } from "drizzle-orm";
import { records, safetyFlags } from "@cnpaf/db/schema";
import type { z } from "zod";
import type { safetyResolveBodySchema } from "@cnpaf/shared";
import { db } from "./db";
import { evaluateAuthorization, getAccessContext } from "./authorization";
import { audit } from "./audit";

type SafetyResolution = z.infer<typeof safetyResolveBodySchema>;

export async function listSafetyQueue(userId: string) {
  const rows = await db.select({ flag: safetyFlags, record: records }).from(safetyFlags).innerJoin(records, eq(safetyFlags.recordId, records.id)).orderBy(desc(safetyFlags.createdAt));
  const context = await getAccessContext(userId);
  return rows.filter(({ record }) => evaluateAuthorization(context, "safety.view", {
    organizationId: record.organizationId,
    siteId: record.siteId,
    serviceKey: record.sourceKind,
    researchUse: record.researchUseStatus,
  }).allowed);
}

export async function resolveSafetyFlag(id: string, actorId: string, body: SafetyResolution) {
  const before = (await db.select().from(safetyFlags).where(eq(safetyFlags.id, id)).limit(1))[0];
  if (!before) throw new Error("Safety flag not found");
  const [after] = await db.update(safetyFlags).set({
    status: body.resolution === "escalated" ? "escalated" : "resolved",
    resolution: body.resolution,
    resolutionNotes: body.notes,
    resolvedById: actorId,
    resolvedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(safetyFlags.id, id)).returning();
  await audit({ actorId, action: "safety.resolved", entityType: "safety_flag", entityId: id, beforeState: before, afterState: after, reason: body.notes ?? null });
  return after;
}
