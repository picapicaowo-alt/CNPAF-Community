import { auditEvents } from "@cnpaf/db/schema";
import { db } from "./db";

export async function audit(input: {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  targetUserId?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  reason?: string | null;
}) {
  await db.insert(auditEvents).values({
    actorId: input.actorId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    targetUserId: input.targetUserId ?? null,
    beforeState: input.beforeState,
    afterState: input.afterState,
    reason: input.reason ?? null,
    metadata: input.metadata ?? {},
  });
}
