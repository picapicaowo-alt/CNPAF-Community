import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, inArray, or } from "drizzle-orm";
import {
  auditEvents,
  institutions,
  permissions,
  permissionScopeAssignments,
  personGroupMemberships,
  programMemberships,
  programs,
  roles,
  sessions,
  userAffiliations,
  userPermissionOverrides,
  userRoleAssignments,
  users,
} from "@cnpaf/db/schema";
import type { z } from "zod";
import type { affiliationBodySchema, manualAccountCreateBodySchema, resetPasswordBodySchema } from "@cnpaf/shared";
import { db } from "../db";
import { audit } from "../audit";
import { ApiError } from "../api-error";
import { authorize } from "../authorization";
import { scopeAuthorizationResource } from "../access-admin";
import { requireActiveRegistryItem } from "../registries";
import { queueNotification } from "./notification-delivery";
import { issueAccountActionToken } from "./account-recovery";

type AccountCreate = z.infer<typeof manualAccountCreateBodySchema>;
type ResetPassword = z.infer<typeof resetPasswordBodySchema>;
type AffiliationInput = z.infer<typeof affiliationBodySchema>;

function temporaryPassword() {
  return `${randomBytes(18).toString("base64url")}aA1!`;
}

async function requireUserInScope(actorId: string, targetUserId: string, permission: string) {
  const target = (await db.select().from(users).where(eq(users.id, targetUserId)).limit(1))[0];
  if (!target) throw new ApiError("NOT_FOUND", "User not found", 404);
  if (!(await authorize({ userId: actorId, permission, resource: { organizationId: target.organizationId } })).allowed) {
    throw new ApiError("FORBIDDEN", "User is outside the assigned scope", 403);
  }
  return target;
}

export async function createAccount(actorId: string, input: AccountCreate, requestId?: string) {
  if (!(await authorize({ userId: actorId, permission: "people.create_account", resource: { organizationId: input.organizationId } })).allowed) {
    throw new ApiError("FORBIDDEN", "Cannot create an account in this organization", 403);
  }
  const email = input.email.trim().toLowerCase();
  if ((await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1))[0]) {
    throw new ApiError("CONFLICT", "An account already exists for this email", 409);
  }

  const roleIds = input.roleAssignments.map((assignment) => assignment.roleId).filter(Boolean) as string[];
  const roleKeys = input.roleAssignments.map((assignment) => assignment.roleKey).filter(Boolean) as string[];
  const roleRows = await db.select().from(roles).where(and(
    eq(roles.status, "active"),
    roleIds.length && roleKeys.length
      ? or(inArray(roles.id, roleIds), inArray(roles.key, roleKeys))
      : roleIds.length
        ? inArray(roles.id, roleIds)
        : inArray(roles.key, roleKeys),
  ));
  const roleById = new Map(roleRows.map((role) => [role.id, role]));
  const resolveRole = (assignment: AccountCreate["roleAssignments"][number]) => {
    if (assignment.roleId) return roleById.get(assignment.roleId);
    return roleRows.find((role) => role.key === assignment.roleKey && (role.organizationId === input.organizationId || role.organizationId === null));
  };
  const resolvedRoles = input.roleAssignments.map(resolveRole);
  if (resolvedRoles.some((role) => !role)) throw new ApiError("BAD_REQUEST", "One or more roles are invalid or archived", 400);
  if (resolvedRoles.some((role) => role!.organizationId && role!.organizationId !== input.organizationId)) {
    throw new ApiError("BAD_REQUEST", "One or more roles belong to another organization", 400);
  }
  for (const assignment of input.roleAssignments) {
    if (assignment.organizationId && assignment.organizationId !== input.organizationId) {
      throw new ApiError("BAD_REQUEST", "Role assignments must belong to the new account's organization", 400);
    }
    if (!(await authorize({ userId: actorId, permission: "roles.assign", resource: { organizationId: assignment.organizationId ?? input.organizationId } })).allowed) {
      throw new ApiError("FORBIDDEN", "Cannot assign one or more requested roles", 403);
    }
  }
  if (input.scopeAssignments.length && !(await authorize({ userId: actorId, permission: "permissions.assign", resource: { organizationId: input.organizationId } })).allowed) {
    throw new ApiError("FORBIDDEN", "Cannot assign requested access scopes", 403);
  }
  for (const scope of input.scopeAssignments) {
    let resource;
    try {
      resource = await scopeAuthorizationResource(scope);
    } catch (error) {
      throw new ApiError("BAD_REQUEST", error instanceof Error ? error.message : "Invalid scope assignment", 400);
    }
    if (!(await authorize({ userId: actorId, permission: "permissions.assign", resource })).allowed) {
      throw new ApiError("FORBIDDEN", "Cannot assign one or more requested access scopes", 403);
    }
  }

  const membershipProgramIds = [...new Set(input.programMemberships.map((membership) => membership.programId))];
  const membershipPrograms = membershipProgramIds.length
    ? await db.select().from(programs).where(inArray(programs.id, membershipProgramIds))
    : [];
  if (membershipPrograms.length !== membershipProgramIds.length || membershipPrograms.some((program) => program.organizationId !== input.organizationId)) {
    throw new ApiError("BAD_REQUEST", "One or more program memberships are invalid", 400);
  }
  for (const program of membershipPrograms) {
    if (!(await authorize({ userId: actorId, permission: "programs.manage_membership", resource: { organizationId: program.organizationId, programId: program.id } })).allowed) {
      throw new ApiError("FORBIDDEN", "Cannot manage one or more requested programs", 403);
    }
  }
  await Promise.all([...new Set(input.programMemberships.map((membership) => membership.membershipRoleKey))]
    .map((key) => requireActiveRegistryItem("program_membership_role", key, input.organizationId)));
  const affiliationProgramIds = [...new Set(input.affiliations.map((affiliation) => affiliation.programId).filter(Boolean))] as string[];
  const affiliationPrograms = affiliationProgramIds.length ? await db.select().from(programs).where(inArray(programs.id, affiliationProgramIds)) : [];
  if (affiliationPrograms.length !== affiliationProgramIds.length || affiliationPrograms.some((program) => program.organizationId !== input.organizationId) || input.affiliations.some((affiliation) => affiliation.organizationId && affiliation.organizationId !== input.organizationId)) {
    throw new ApiError("BAD_REQUEST", "One or more affiliations belong to another organization", 400);
  }
  await Promise.all([...new Set(input.affiliations.map((affiliation) => affiliation.affiliationTypeKey))]
    .map((key) => requireActiveRegistryItem("affiliation_type", key, input.organizationId)));
  const institutionIds = [...new Set(input.affiliations.map((affiliation) => affiliation.institutionId).filter(Boolean))] as string[];
  const institutionRows = institutionIds.length
    ? await db.select().from(institutions).where(inArray(institutions.id, institutionIds))
    : [];
  if (
    institutionRows.length !== institutionIds.length ||
    institutionRows.some((institution) => institution.organizationId !== input.organizationId || institution.status !== "active")
  ) {
    throw new ApiError("BAD_REQUEST", "One or more schools or institutions are invalid or archived", 400);
  }
  const institutionById = new Map(institutionRows.map((institution) => [institution.id, institution]));

  const generatedPassword = input.temporaryPassword ?? temporaryPassword();
  const passwordHash = await bcrypt.hash(generatedPassword, 12);
  const permissionKeys = input.scopeAssignments.map((scope) => scope.permissionKey).filter(Boolean) as string[];
  const permissionRows = permissionKeys.length
    ? await db.select().from(permissions).where(and(inArray(permissions.key, permissionKeys), eq(permissions.status, "active")))
    : [];
  const permissionByKey = new Map(permissionRows.map((permission) => [permission.key, permission]));
  if (permissionRows.length !== new Set(permissionKeys).size) throw new ApiError("BAD_REQUEST", "Unknown permission in scope assignment", 400);

  const account = await db.transaction(async (tx) => {
    const primaryRole = resolvedRoles[0]!;
    const [user] = await tx.insert(users).values({
      email,
      name: input.name,
      passwordHash,
      role: primaryRole!.key,
      organizationId: input.organizationId,
      locale: input.locale,
      mustChangePassword: input.requirePasswordChange,
      passwordChangedAt: null,
    }).returning();
    const publicUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      organizationId: user.organizationId,
      locale: user.locale,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
      passwordChangedAt: user.passwordChangedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
    const assignments = [];
    for (let index = 0; index < input.roleAssignments.length; index += 1) {
      const requested = input.roleAssignments[index]!;
      const role = resolvedRoles[index]!;
      const [assignment] = await tx.insert(userRoleAssignments).values({
        userId: user.id,
        roleId: role!.id,
        organizationId: requested.organizationId ?? role!.organizationId ?? input.organizationId,
        startsAt: requested.startsAt ? new Date(requested.startsAt) : null,
        endsAt: requested.endsAt ? new Date(requested.endsAt) : null,
        assignedById: actorId,
      }).returning();
      assignments.push(assignment);
    }
    for (const scope of input.scopeAssignments) {
      await tx.insert(permissionScopeAssignments).values({
        userId: user.id,
        permissionId: scope.permissionKey ? permissionByKey.get(scope.permissionKey)?.id : null,
        roleAssignmentId: null,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId ?? null,
        scopeKey: scope.scopeKey ?? null,
        effect: scope.effect,
        assignedById: actorId,
        reason: scope.reason ?? "Initial account provisioning",
      });
    }
    const affiliations = input.affiliations.length
      ? await tx.insert(userAffiliations).values(input.affiliations.map((affiliation) => {
          const institution = affiliation.institutionId
            ? institutionById.get(affiliation.institutionId)
            : undefined;
          return {
            ...affiliation,
            institutionName: institution?.name ?? affiliation.institutionName!,
            institutionTypeKey: institution?.institutionTypeKey ?? affiliation.institutionTypeKey ?? null,
            userId: user.id,
            startsAt: affiliation.startsAt ? new Date(affiliation.startsAt) : null,
            endsAt: affiliation.endsAt ? new Date(affiliation.endsAt) : null,
            createdById: actorId,
          };
        })).returning()
      : [];
    const memberships = input.programMemberships.length
      ? await tx.insert(programMemberships).values(input.programMemberships.map((membership) => ({
          ...membership,
          userId: user.id,
          assignedById: actorId,
        }))).returning()
      : [];
    const onboardingToken = await issueAccountActionToken(tx, {
      userId: user.id,
      purpose: "onboarding",
      requestedById: actorId,
    });
    const onboarding = await queueNotification(tx, {
      userId: user.id,
      kindKey: "account_onboarding",
      title: "Welcome to CNPAF Community",
      body: input.onboardingMessage?.trim()
        ? `Your CNPAF Community account is ready. ${input.onboardingMessage.trim()}`
        : "Your CNPAF Community account is ready. Use the secure link below to set your password and sign in.",
      entityType: "user",
      entityId: user.id,
      metadata: {
        actionPath: `/reset-password/${onboardingToken}`,
        emailSubject: "Welcome to CNPAF Community",
        actionLabel: "Set up my account",
      },
      templateVariables: {
        message: input.onboardingMessage?.trim() ?? "",
        entity_name: user.name,
      },
    });
    await audit({
      actorId,
      action: "account.created",
      entityType: "user",
      entityId: user.id,
      targetUserId: user.id,
      afterState: publicUser,
      metadata: { requestId, roleAssignmentIds: assignments.map((assignment) => assignment.id), affiliationIds: affiliations.map((affiliation) => affiliation.id), membershipIds: memberships.map((membership) => membership.id), onboardingEmailStatus: onboarding.emailStatus },
    }, (values) => tx.insert(auditEvents).values(values));
    return { user: publicUser, roleAssignments: assignments, affiliations, programMemberships: memberships, onboardingEmailQueued: onboarding.emailStatus === "queued" };
  });
  return { ...account, temporaryPassword: generatedPassword };
}

export async function resetUserPassword(actorId: string, targetUserId: string, input: ResetPassword, requestId?: string) {
  const target = await requireUserInScope(actorId, targetUserId, "people.reset_password");
  const generatedPassword = input.temporaryPassword ?? temporaryPassword();
  const passwordHash = await bcrypt.hash(generatedPassword, 12);
  const result = await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, mustChangePassword: true, passwordChangedAt: null, updatedAt: new Date() }).where(eq(users.id, targetUserId));
    await tx.delete(sessions).where(eq(sessions.userId, targetUserId));
    const resetToken = await issueAccountActionToken(tx, {
      userId: targetUserId,
      purpose: "password_reset",
      requestedById: actorId,
    });
    const resetNotification = await queueNotification(tx, {
      userId: targetUserId,
      kindKey: "password_reset_requested",
      title: "Reset your CNPAF Community password",
      body: "An administrator reset your password. Use the secure link below to choose a new password.",
      entityType: "user",
      entityId: targetUserId,
      metadata: {
        actionPath: `/reset-password/${resetToken}`,
        emailSubject: "Reset your CNPAF Community password",
        actionLabel: "Reset password",
      },
    });
    await audit({
      actorId,
      action: "account.password_reset",
      entityType: "user",
      entityId: targetUserId,
      targetUserId,
      reason: input.reason,
      beforeState: { mustChangePassword: target.mustChangePassword, passwordChangedAt: target.passwordChangedAt },
      afterState: { mustChangePassword: true, passwordChangedAt: null },
      metadata: { requestId, notificationEmailStatus: resetNotification.emailStatus },
    }, (values) => tx.insert(auditEvents).values(values));
    return { emailQueued: resetNotification.emailStatus === "queued" };
  });
  return { temporaryPassword: generatedPassword, mustChangePassword: true, emailQueued: result.emailQueued };
}

export async function setAccountActive(actorId: string, targetUserId: string, active: boolean, requestId?: string) {
  if (!active && actorId === targetUserId) {
    throw new ApiError("BAD_REQUEST", "You cannot deactivate your own account", 400);
  }
  const before = await requireUserInScope(actorId, targetUserId, "users.deactivate");
  const status = active ? "active" : "inactive";
  if (before.status === status) return {
    id: before.id,
    email: before.email,
    name: before.name,
    organizationId: before.organizationId,
    locale: before.locale,
    status: before.status,
    mustChangePassword: before.mustChangePassword,
    passwordChangedAt: before.passwordChangedAt,
    createdAt: before.createdAt,
    updatedAt: before.updatedAt,
  };
  return db.transaction(async (tx) => {
    const [after] = await tx.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, targetUserId)).returning({
      id: users.id,
      email: users.email,
      name: users.name,
      organizationId: users.organizationId,
      locale: users.locale,
      status: users.status,
      mustChangePassword: users.mustChangePassword,
      passwordChangedAt: users.passwordChangedAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    });
    await tx.delete(sessions).where(eq(sessions.userId, targetUserId));
    await audit({
      actorId,
      action: active ? "account.reactivated" : "account.deactivated",
      entityType: "user",
      entityId: targetUserId,
      targetUserId,
      beforeState: { status: before.status },
      afterState: { status },
      metadata: { requestId },
    }, (values) => tx.insert(auditEvents).values(values));
    return after;
  });
}

/**
 * Permanently removes an accidentally-created identity without deleting the
 * audit or business rows that may already reference its UUID. The login
 * identity and access grants are destroyed; historical records retain only the
 * stable, non-identifying user id required for referential integrity.
 */
export async function removeAccountIdentity(
  actorId: string,
  targetUserId: string,
  reason: string,
  requestId?: string,
) {
  if (actorId === targetUserId) {
    throw new ApiError(
      "BAD_REQUEST",
      "You cannot remove your own account",
      400,
    );
  }
  const before = await requireUserInScope(
    actorId,
    targetUserId,
    "users.deactivate",
  );
  await requireUserInScope(actorId, targetUserId, "people.edit_profile");
  if (before.status !== "inactive") {
    throw new ApiError(
      "CONFLICT",
      "Archive the account before permanently removing it",
      409,
    );
  }
  const removedEmail = `removed+${targetUserId}@invalid.cnpaf.local`;
  return db.transaction(async (tx) => {
    await tx.delete(sessions).where(eq(sessions.userId, targetUserId));
    await tx
      .delete(permissionScopeAssignments)
      .where(eq(permissionScopeAssignments.userId, targetUserId));
    await tx
      .delete(userPermissionOverrides)
      .where(eq(userPermissionOverrides.userId, targetUserId));
    await tx
      .update(userRoleAssignments)
      .set({ status: "inactive", endsAt: new Date(), updatedAt: new Date() })
      .where(eq(userRoleAssignments.userId, targetUserId));
    await tx
      .update(programMemberships)
      .set({ status: "inactive", endsAt: new Date(), updatedAt: new Date() })
      .where(eq(programMemberships.userId, targetUserId));
    await tx
      .update(userAffiliations)
      .set({
        status: "inactive",
        endsAt: new Date(),
        isPrimary: false,
        updatedAt: new Date(),
      })
      .where(eq(userAffiliations.userId, targetUserId));
    await tx
      .update(personGroupMemberships)
      .set({ status: "inactive", updatedAt: new Date() })
      .where(eq(personGroupMemberships.userId, targetUserId));
    const [after] = await tx
      .update(users)
      .set({
        email: removedEmail,
        name: "Removed account",
        avatarStorageKey: null,
        avatarMimeType: null,
        mustChangePassword: true,
        passwordChangedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, targetUserId))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        status: users.status,
        updatedAt: users.updatedAt,
      });
    await audit(
      {
        actorId,
        action: "account.identity_removed",
        entityType: "user",
        entityId: targetUserId,
        targetUserId,
        reason,
        beforeState: {
          email: before.email,
          name: before.name,
          status: before.status,
        },
        afterState: { identityRemoved: true, status: after.status },
        metadata: { requestId },
      },
      (values) => tx.insert(auditEvents).values(values),
    );
    return after;
  });
}

export async function addUserAffiliation(actorId: string, targetUserId: string, input: AffiliationInput, requestId?: string) {
  const target = await requireUserInScope(actorId, targetUserId, "people.edit_affiliation");
  await requireActiveRegistryItem("affiliation_type", input.affiliationTypeKey, target.organizationId);
  if (input.organizationId && input.organizationId !== target.organizationId) {
    throw new ApiError("BAD_REQUEST", "Affiliation organization must match the target account", 400);
  }
  const institution = input.institutionId
    ? await db.select().from(institutions).where(eq(institutions.id, input.institutionId)).limit(1).then((rows) => rows[0])
    : undefined;
  if (
    input.institutionId &&
    (!institution || institution.status !== "active" || institution.organizationId !== target.organizationId)
  ) {
    throw new ApiError("BAD_REQUEST", "School or institution is invalid, archived, or belongs to another organization", 400);
  }
  if (input.programId) {
    const program = (await db.select().from(programs).where(eq(programs.id, input.programId)).limit(1))[0];
    if (!program || program.organizationId !== target.organizationId || (input.organizationId && input.organizationId !== program.organizationId)) {
      throw new ApiError("BAD_REQUEST", "Program affiliation must belong to the target account's organization", 400);
    }
    if (!(await authorize({ userId: actorId, permission: "people.edit_affiliation", resource: { organizationId: program.organizationId, programId: program.id } })).allowed) {
      throw new ApiError("FORBIDDEN", "Program affiliation is outside the assigned scope", 403);
    }
  }
  return db.transaction(async (tx) => {
    if (input.isPrimary) await tx.update(userAffiliations).set({ isPrimary: false, updatedAt: new Date() }).where(and(eq(userAffiliations.userId, targetUserId), eq(userAffiliations.isPrimary, true)));
    const [affiliation] = await tx.insert(userAffiliations).values({
      ...input,
      institutionName: institution?.name ?? input.institutionName!,
      institutionTypeKey: institution?.institutionTypeKey ?? input.institutionTypeKey ?? null,
      userId: targetUserId,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      createdById: actorId,
    }).returning();
    await audit({ actorId, action: "person.affiliation_added", entityType: "user_affiliation", entityId: affiliation.id, targetUserId, afterState: affiliation, metadata: { requestId } }, (values) => tx.insert(auditEvents).values(values));
    await queueNotification(tx, {
      userId: targetUserId,
      kindKey: "affiliation_changed",
      title: "Your school or institution affiliation changed",
      body: `You were assigned to “${affiliation.institutionName}” in CNPAF Community.`,
      entityType: "user_affiliation",
      entityId: affiliation.id,
      metadata: {
        actionPath: `/people/${targetUserId}`,
        emailSubject: "[CNPAF] Your school or institution affiliation changed",
      },
    });
    return affiliation;
  });
}

export async function removeUserAffiliation(actorId: string, targetUserId: string, affiliationId: string, requestId?: string) {
  await requireUserInScope(actorId, targetUserId, "people.edit_affiliation");
  const before = (await db.select().from(userAffiliations).where(and(eq(userAffiliations.id, affiliationId), eq(userAffiliations.userId, targetUserId))).limit(1))[0];
  if (!before) throw new ApiError("NOT_FOUND", "Affiliation not found", 404);
  return db.transaction(async (tx) => {
    const [after] = await tx.update(userAffiliations).set({ status: "inactive", endsAt: new Date(), isPrimary: false, updatedAt: new Date() }).where(eq(userAffiliations.id, affiliationId)).returning();
    await audit({ actorId, action: "person.affiliation_removed", entityType: "user_affiliation", entityId: affiliationId, targetUserId, beforeState: before, afterState: after, metadata: { requestId } }, (values) => tx.insert(auditEvents).values(values));
    await queueNotification(tx, {
      userId: targetUserId,
      kindKey: "affiliation_changed",
      title: "Your school or institution affiliation changed",
      body: `Your affiliation with “${before.institutionName}” was removed in CNPAF Community.`,
      entityType: "user_affiliation",
      entityId: affiliationId,
      metadata: {
        actionPath: `/people/${targetUserId}`,
        emailSubject: "[CNPAF] Your school or institution affiliation changed",
      },
    });
    return after;
  });
}
