import { and, desc, eq, inArray } from "drizzle-orm";
import { auditEvents, programMemberships, programs, users } from "@cnpaf/db/schema";
import type { z } from "zod";
import type { programCreateBodySchema, programMembershipBodySchema, programMembershipBulkBodySchema, programUpdateBodySchema } from "@cnpaf/shared";
import { db } from "../db";
import { audit } from "../audit";
import { ApiError } from "../api-error";
import { authorize, evaluateAuthorization, getAccessContext } from "../authorization";
import { requireActiveRegistryItem } from "../registries";
import { queueNotification } from "./notification-delivery";

type ProgramCreate = z.infer<typeof programCreateBodySchema>;
type ProgramUpdate = z.infer<typeof programUpdateBodySchema>;
type MembershipCreate = z.infer<typeof programMembershipBodySchema>;
type MembershipBulkCreate = z.infer<typeof programMembershipBulkBodySchema>;

const PROGRAM_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ["active", "archived"],
  active: ["completed", "archived"],
  completed: ["archived"],
  archived: [],
};

function resource(program: typeof programs.$inferSelect) {
  return { organizationId: program.organizationId, programId: program.id };
}

async function requireProgram(actorId: string, programId: string, permission: string) {
  const program = (await db.select().from(programs).where(eq(programs.id, programId)).limit(1))[0];
  if (!program) throw new ApiError("NOT_FOUND", "Program not found", 404);
  if (!(await authorize({ userId: actorId, permission, resource: resource(program) })).allowed) {
    throw new ApiError("FORBIDDEN", "Program is outside the assigned scope", 403);
  }
  return program;
}

export async function listPrograms(actorId: string) {
  const [access, rows] = await Promise.all([
    getAccessContext(actorId),
    db.select().from(programs).orderBy(desc(programs.updatedAt)),
  ]);
  return rows.filter((program) => evaluateAuthorization(access, "programs.view", resource(program)).allowed);
}

export async function getProgram(actorId: string, programId: string) {
  const program = await requireProgram(actorId, programId, "programs.view");
  const memberships = await db
    .select({
      id: programMemberships.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      membershipRoleKey: programMemberships.membershipRoleKey,
      status: programMemberships.status,
      startsAt: programMemberships.startsAt,
      endsAt: programMemberships.endsAt,
    })
    .from(programMemberships)
    .innerJoin(users, eq(programMemberships.userId, users.id))
    .where(eq(programMemberships.programId, program.id));
  return { program, memberships };
}

export async function createProgram(actorId: string, input: ProgramCreate, requestId?: string) {
  if (!(await authorize({ userId: actorId, permission: "programs.manage", resource: { organizationId: input.organizationId } })).allowed) {
    throw new ApiError("FORBIDDEN", "Cannot create a program in this organization", 403);
  }
  return db.transaction(async (tx) => {
    const [program] = await tx.insert(programs).values({ ...input, createdById: actorId }).returning();
    await audit({
      actorId,
      action: "program.created",
      entityType: "program",
      entityId: program.id,
      afterState: program,
      metadata: { requestId },
    }, (values) => tx.insert(auditEvents).values(values));
    return program;
  });
}

export async function updateProgram(actorId: string, programId: string, input: ProgramUpdate, requestId?: string) {
  const before = await requireProgram(actorId, programId, "programs.manage");
  if (input.status && input.status !== before.status && !PROGRAM_TRANSITIONS[before.status]?.includes(input.status)) {
    throw new ApiError("INVALID_TRANSITION", `Cannot transition program from ${before.status} to ${input.status}`, 409);
  }
  return db.transaction(async (tx) => {
    const [after] = await tx.update(programs).set({ ...input, updatedAt: new Date() }).where(and(eq(programs.id, programId), eq(programs.status, before.status))).returning();
    if (!after) throw new ApiError("CONFLICT", "Program changed concurrently", 409);
    await audit({
      actorId,
      action: "program.updated",
      entityType: "program",
      entityId: programId,
      beforeState: before,
      afterState: after,
      metadata: { requestId },
    }, (values) => tx.insert(auditEvents).values(values));
    return after;
  });
}

export async function addProgramMembership(
  actorId: string,
  programId: string,
  input: MembershipCreate,
  requestId?: string,
) {
  const memberships = await addProgramMemberships(
    actorId,
    programId,
    { ...input, userIds: [input.userId] },
    requestId,
  );
  return memberships[0]!;
}

export async function addProgramMemberships(
  actorId: string,
  programId: string,
  input: MembershipBulkCreate,
  requestId?: string,
) {
  const program = await requireProgram(actorId, programId, "programs.manage_membership");
  const targets = await db
    .select()
    .from(users)
    .where(inArray(users.id, input.userIds));
  if (
    targets.length !== input.userIds.length ||
    targets.some((target) => target.status !== "active")
  )
    throw new ApiError("NOT_FOUND", "One or more active users were not found", 404);
  if (
    targets.some(
      (target) =>
        target.organizationId && target.organizationId !== program.organizationId,
    )
  ) {
    throw new ApiError("BAD_REQUEST", "User and program belong to different organizations", 400);
  }
  await requireActiveRegistryItem("program_membership_role", input.membershipRoleKey, program.organizationId);
  return db.transaction(async (tx) => {
    const existingMemberships = await tx
      .select()
      .from(programMemberships)
      .where(
        and(
          eq(programMemberships.programId, programId),
          inArray(programMemberships.userId, input.userIds),
          eq(programMemberships.status, "active"),
        ),
      );
    const existingByUserId = new Map(
      existingMemberships.map((membership) => [membership.userId, membership]),
    );
    const values = {
      membershipRoleKey: input.membershipRoleKey,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      assignedById: actorId,
      updatedAt: new Date(),
    };
    const memberships = [];
    for (const userId of input.userIds) {
      const existing = existingByUserId.get(userId);
      const [membership] = existing
        ? await tx
            .update(programMemberships)
            .set(values)
            .where(eq(programMemberships.id, existing.id))
            .returning()
        : await tx
            .insert(programMemberships)
            .values({ programId, userId, ...values })
            .returning();
      await audit({
        actorId,
        action: existing ? "program.membership_updated" : "program.membership_added",
        entityType: "program_membership",
        entityId: membership.id,
        targetUserId: userId,
        beforeState: existing,
        afterState: membership,
        metadata: { requestId, programId, batchSize: input.userIds.length },
      }, (auditValues) => tx.insert(auditEvents).values(auditValues));
      await queueNotification(tx, {
        userId,
        kindKey: "program_membership_changed",
        title: "Your program assignment changed",
        body: existing
          ? `Your membership in “${program.nameEn}” was updated.`
          : `You were assigned to the program “${program.nameEn}”.`,
        entityType: "program",
        entityId: program.id,
        metadata: {
          actionPath: `/people/${userId}`,
          emailSubject: `[CNPAF] Program assignment changed: ${program.nameEn}`,
        },
      });
      memberships.push(membership);
    }
    return memberships;
  });
}

export async function removeProgramMembership(actorId: string, programId: string, membershipId: string, requestId?: string) {
  const program = await requireProgram(actorId, programId, "programs.manage_membership");
  const before = (await db.select().from(programMemberships).where(and(
    eq(programMemberships.id, membershipId),
    eq(programMemberships.programId, programId),
  )).limit(1))[0];
  if (!before) throw new ApiError("NOT_FOUND", "Program membership not found", 404);
  return db.transaction(async (tx) => {
    const [after] = await tx.update(programMemberships).set({ status: "inactive", endsAt: new Date(), updatedAt: new Date() }).where(eq(programMemberships.id, membershipId)).returning();
    await audit({
      actorId,
      action: "program.membership_removed",
      entityType: "program_membership",
      entityId: membershipId,
      targetUserId: before.userId,
      beforeState: before,
      afterState: after,
      metadata: { requestId, programId },
    }, (values) => tx.insert(auditEvents).values(values));
    await queueNotification(tx, {
      userId: before.userId,
      kindKey: "program_membership_changed",
      title: "Your program assignment changed",
      body: `You were removed from the program “${program.nameEn}”.`,
      entityType: "program",
      entityId: programId,
      metadata: {
        actionPath: `/people/${before.userId}`,
        emailSubject: "[CNPAF] Program assignment changed",
      },
    });
    return after;
  });
}
