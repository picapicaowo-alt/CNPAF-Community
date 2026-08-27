import { and, asc, eq } from "drizzle-orm";
import { auditEvents, institutions, users } from "@cnpaf/db/schema";
import type { z } from "zod";
import type {
  institutionCreateBodySchema,
  institutionUpdateBodySchema,
} from "@cnpaf/shared";
import { ApiError } from "../api-error";
import { audit } from "../audit";
import { authorize } from "../authorization";
import { db } from "../db";

type InstitutionCreate = z.infer<typeof institutionCreateBodySchema>;
type InstitutionUpdate = z.infer<typeof institutionUpdateBodySchema>;

async function actorOrganization(actorId: string) {
  const actor = await db
    .select({ organizationId: users.organizationId })
    .from(users)
    .where(eq(users.id, actorId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!actor?.organizationId) {
    throw new ApiError("BAD_REQUEST", "An organization-scoped account is required", 400);
  }
  return actor.organizationId;
}

async function requirePermission(actorId: string, permission: string) {
  const organizationId = await actorOrganization(actorId);
  const allowed = await authorize({
    userId: actorId,
    permission,
    resource: { organizationId },
  });
  if (!allowed.allowed) {
    throw new ApiError("FORBIDDEN", "Institutions are outside the assigned scope", 403);
  }
  return organizationId;
}

export async function listInstitutions(actorId: string) {
  const organizationId = await actorOrganization(actorId);
  const resource = { organizationId };
  const canView =
    (await authorize({ userId: actorId, permission: "people.view", resource })).allowed ||
    (await authorize({ userId: actorId, permission: "users.view", resource })).allowed;
  if (!canView) {
    throw new ApiError("FORBIDDEN", "Institutions are outside the assigned scope", 403);
  }
  return db
    .select()
    .from(institutions)
    .where(eq(institutions.organizationId, organizationId))
    .orderBy(asc(institutions.name));
}

export async function createInstitution(
  actorId: string,
  input: InstitutionCreate,
  requestId?: string,
) {
  const organizationId = await requirePermission(actorId, "people.edit_affiliation");
  const existing = await db
    .select()
    .from(institutions)
    .where(and(eq(institutions.organizationId, organizationId), eq(institutions.name, input.name)))
    .limit(1)
    .then((rows) => rows[0]);
  if (existing) {
    throw new ApiError("CONFLICT", "A school or institution with this name already exists", 409);
  }
  return db.transaction(async (tx) => {
    const [institution] = await tx
      .insert(institutions)
      .values({ ...input, organizationId, createdById: actorId })
      .returning();
    await audit({
      actorId,
      action: "institution.created",
      entityType: "institution",
      entityId: institution.id,
      afterState: institution,
      metadata: { requestId },
    }, (values) => tx.insert(auditEvents).values(values));
    return institution;
  });
}

export async function updateInstitution(
  actorId: string,
  institutionId: string,
  input: InstitutionUpdate,
  requestId?: string,
) {
  const organizationId = await requirePermission(actorId, "people.edit_affiliation");
  const before = await db
    .select()
    .from(institutions)
    .where(and(eq(institutions.id, institutionId), eq(institutions.organizationId, organizationId)))
    .limit(1)
    .then((rows) => rows[0]);
  if (!before) throw new ApiError("NOT_FOUND", "School or institution not found", 404);
  return db.transaction(async (tx) => {
    const [after] = await tx
      .update(institutions)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(institutions.id, institutionId))
      .returning();
    await audit({
      actorId,
      action: "institution.updated",
      entityType: "institution",
      entityId: institutionId,
      beforeState: before,
      afterState: after,
      metadata: { requestId },
    }, (values) => tx.insert(auditEvents).values(values));
    return after;
  });
}
