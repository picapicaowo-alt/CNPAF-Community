import { and, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import {
  auditEvents,
  permissionScopeAssignments,
  permissions,
  programs,
  programMemberships,
  rolePermissions,
  roles,
  sessions,
  sites,
  templates,
  userPermissionOverrides,
  userAffiliations,
  userRoleAssignments,
  users,
} from "@cnpaf/db/schema";
import type { PermissionKey, ReplaceUserAccessBody } from "@cnpaf/shared";
import { db } from "./db";
import { audit } from "./audit";
import { evaluateAuthorization, getAccessContext, serializeAccessContext } from "./authorization";
import { ApiError } from "./api-error";

const AI_ACCESS_PERMISSION_KEYS = ["chat.ask_collect", "ask_collect.use"] as const;

export async function getAiAccessStates(userIds: string[]) {
  const result = new Map<string, boolean>(userIds.map((userId) => [userId, false]));
  if (!userIds.length) return result;
  const now = new Date();
  const [assignmentRows, grantRows, overrideRows] = await Promise.all([
    db.select({ userId: userRoleAssignments.userId, roleId: userRoleAssignments.roleId })
      .from(userRoleAssignments)
      .innerJoin(roles, eq(userRoleAssignments.roleId, roles.id))
      .where(and(
        inArray(userRoleAssignments.userId, userIds),
        eq(userRoleAssignments.status, "active"),
        eq(roles.status, "active"),
        or(isNull(userRoleAssignments.startsAt), lte(userRoleAssignments.startsAt, now)),
        or(isNull(userRoleAssignments.endsAt), gt(userRoleAssignments.endsAt, now)),
      )),
    db.select({ roleId: rolePermissions.roleId, permissionKey: permissions.key, effect: rolePermissions.effect })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(inArray(permissions.key, [...AI_ACCESS_PERMISSION_KEYS])),
    db.select({ userId: userPermissionOverrides.userId, permissionKey: permissions.key, effect: userPermissionOverrides.effect })
      .from(userPermissionOverrides)
      .innerJoin(permissions, eq(userPermissionOverrides.permissionId, permissions.id))
      .where(and(
        inArray(userPermissionOverrides.userId, userIds),
        inArray(permissions.key, [...AI_ACCESS_PERMISSION_KEYS]),
        or(isNull(userPermissionOverrides.expiresAt), gt(userPermissionOverrides.expiresAt, now)),
      )),
  ]);
  const rolesByUser = new Map<string, string[]>();
  for (const row of assignmentRows) rolesByUser.set(row.userId, [...(rolesByUser.get(row.userId) ?? []), row.roleId]);
  for (const userId of userIds) {
    const assignedRoles = new Set(rolesByUser.get(userId) ?? []);
    const roleEffects = grantRows.filter((row) => assignedRoles.has(row.roleId));
    const overrides = overrideRows.filter((row) => row.userId === userId);
    const enabled = AI_ACCESS_PERMISSION_KEYS.some((permissionKey) => {
      const matchingOverrides = overrides.filter((row) => row.permissionKey === permissionKey);
      if (matchingOverrides.some((row) => row.effect === "deny")) return false;
      if (matchingOverrides.some((row) => row.effect === "allow")) return true;
      const matchingRoles = roleEffects.filter((row) => row.permissionKey === permissionKey);
      if (matchingRoles.some((row) => row.effect === "deny")) return false;
      return matchingRoles.some((row) => row.effect === "allow");
    });
    result.set(userId, enabled);
  }
  return result;
}

export async function setUserAiAccess(input: { actorId: string; targetUserId: string; enabled: boolean; reason: string }) {
  const before = await getUserAccess(input.targetUserId);
  if (!before) throw new ApiError("NOT_FOUND", "User not found", 404);
  await assertActorCan(input.actorId, "permissions.assign", { organizationId: before.user.organizationId });
  const permissionRows = await db.select().from(permissions).where(and(
    inArray(permissions.key, [...AI_ACCESS_PERMISSION_KEYS]),
    eq(permissions.status, "active"),
  ));
  if (permissionRows.length !== AI_ACCESS_PERMISSION_KEYS.length) throw new ApiError("INTERNAL_ERROR", "AI access permissions are not configured", 500);
  const permissionIds = permissionRows.map((permission) => permission.id);
  const beforeEnabled = AI_ACCESS_PERMISSION_KEYS.some((key) => before.permissions.includes(key));
  await db.transaction(async (tx) => {
    await tx.delete(userPermissionOverrides).where(and(
      eq(userPermissionOverrides.userId, input.targetUserId),
      inArray(userPermissionOverrides.permissionId, permissionIds),
    ));
    await tx.insert(userPermissionOverrides).values(permissionRows.map((permission) => ({
      userId: input.targetUserId,
      permissionId: permission.id,
      effect: input.enabled ? "allow" : "deny",
      assignedById: input.actorId,
      reason: input.reason,
    })));
    await tx.delete(sessions).where(eq(sessions.userId, input.targetUserId));
    await audit({
      actorId: input.actorId,
      action: "ai_access.updated",
      entityType: "user_access",
      entityId: input.targetUserId,
      targetUserId: input.targetUserId,
      beforeState: { enabled: beforeEnabled },
      afterState: { enabled: input.enabled, permissionKeys: AI_ACCESS_PERMISSION_KEYS },
      reason: input.reason,
    }, (values) => tx.insert(auditEvents).values(values));
  });
  return { userId: input.targetUserId, aiEnabled: input.enabled };
}

async function assertActorCan(actorId: string, permission: PermissionKey, resource: Parameters<typeof evaluateAuthorization>[2]) {
  const access = await getAccessContext(actorId);
  if (!evaluateAuthorization(access, permission, resource).allowed) throw new ApiError("FORBIDDEN", "Access is outside the actor's assigned scope", 403);
}

export async function scopeAuthorizationResource(scope: { scopeType: string; scopeId?: string | null; scopeKey?: string | null }) {
  if (scope.scopeType === "organization") return { organizationId: scope.scopeId ?? null };
  if (scope.scopeType === "program" && scope.scopeId) {
    const program = (await db.select().from(programs).where(eq(programs.id, scope.scopeId)).limit(1))[0];
    if (!program) throw new ApiError("BAD_REQUEST", "Program scope target not found", 400);
    return { organizationId: program.organizationId, programId: program.id };
  }
  if (["site", "location"].includes(scope.scopeType) && scope.scopeId) {
    const site = (await db.select().from(sites).where(eq(sites.id, scope.scopeId)).limit(1))[0];
    if (!site) throw new ApiError("BAD_REQUEST", "Site scope target not found", 400);
    return { organizationId: site.organizationId, siteId: site.id, locationId: site.id };
  }
  if (["template", "form"].includes(scope.scopeType) && scope.scopeId) {
    const template = (await db.select().from(templates).where(eq(templates.id, scope.scopeId)).limit(1))[0];
    if (!template) throw new ApiError("BAD_REQUEST", "Template scope target not found", 400);
    return { organizationId: template.organizationId, templateId: template.id, formId: template.id };
  }
  if (scope.scopeType === "service") return { serviceId: scope.scopeId ?? null, serviceKey: scope.scopeKey ?? null };
  if (scope.scopeType === "data_classification") return { dataClassification: scope.scopeKey ?? null };
  if (scope.scopeType === "research_use") return { researchUse: scope.scopeKey ?? null };
  if (scope.scopeType === "global") return {};
  throw new ApiError("BAD_REQUEST", `Unsupported scope type: ${scope.scopeType}`, 400);
}

export async function getUserAccess(userId: string) {
  const user = (await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    organizationId: users.organizationId,
    locale: users.locale,
    status: users.status,
    mustChangePassword: users.mustChangePassword,
    passwordChangedAt: users.passwordChangedAt,
    legacyRole: users.role,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
  }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user) return null;

  const context = await getAccessContext(userId);
  const [scopeRows, overrideRows, affiliationRows, membershipRows] = await Promise.all([
    db.select().from(permissionScopeAssignments).where(eq(permissionScopeAssignments.userId, userId)),
    db
      .select({
        id: userPermissionOverrides.id,
        permissionId: permissions.id,
        permissionKey: permissions.key,
        effect: userPermissionOverrides.effect,
        scopeType: userPermissionOverrides.scopeType,
        scopeId: userPermissionOverrides.scopeId,
        scopeKey: userPermissionOverrides.scopeKey,
        reason: userPermissionOverrides.reason,
        expiresAt: userPermissionOverrides.expiresAt,
        assignedById: userPermissionOverrides.assignedById,
        createdAt: userPermissionOverrides.createdAt,
      })
      .from(userPermissionOverrides)
      .innerJoin(permissions, eq(userPermissionOverrides.permissionId, permissions.id))
      .where(eq(userPermissionOverrides.userId, userId)),
    db.select().from(userAffiliations).where(eq(userAffiliations.userId, userId)),
    db.select({
      id: programMemberships.id,
      programId: programs.id,
      programKey: programs.key,
      programNameEn: programs.nameEn,
      programNameZh: programs.nameZh,
      membershipRoleKey: programMemberships.membershipRoleKey,
      status: programMemberships.status,
      startsAt: programMemberships.startsAt,
      endsAt: programMemberships.endsAt,
    }).from(programMemberships).innerJoin(programs, eq(programMemberships.programId, programs.id)).where(eq(programMemberships.userId, userId)),
  ]);

  return {
    user,
    ...serializeAccessContext(context),
    scopeAssignments: scopeRows,
    overrides: overrideRows,
    affiliations: affiliationRows,
    programMemberships: membershipRows,
  };
}

function normalizeScopes(body: ReplaceUserAccessBody) {
  const rows = [...body.scopeAssignments];
  const scopes = body.scopes;
  if (!scopes) return rows;
  for (const id of scopes.organizationIds ?? []) rows.push({ scopeType: "organization", scopeId: id, effect: "allow" });
  for (const id of scopes.programIds ?? []) rows.push({ scopeType: "program", scopeId: id, effect: "allow" });
  for (const id of scopes.siteIds ?? []) rows.push({ scopeType: "site", scopeId: id, effect: "allow" });
  for (const id of scopes.locationIds ?? []) rows.push({ scopeType: "location", scopeId: id, effect: "allow" });
  for (const id of scopes.serviceIds ?? []) rows.push({ scopeType: "service", scopeId: id, effect: "allow" });
  for (const key of scopes.serviceKeys ?? []) rows.push({ scopeType: "service", scopeKey: key, effect: "allow" });
  for (const id of scopes.templateIds ?? []) rows.push({ scopeType: "template", scopeId: id, effect: "allow" });
  for (const id of scopes.formIds ?? []) rows.push({ scopeType: "form", scopeId: id, effect: "allow" });
  for (const key of scopes.dataClasses ?? []) rows.push({ scopeType: "data_classification", scopeKey: key, effect: "allow" });
  for (const key of scopes.researchUse ?? []) rows.push({ scopeType: "research_use", scopeKey: key, effect: "allow" });
  return rows;
}

export async function replaceUserAccess(input: {
  actorId: string;
  targetUserId: string;
  body: ReplaceUserAccessBody;
}) {
  const before = await getUserAccess(input.targetUserId);
  if (!before) throw new ApiError("NOT_FOUND", "User not found", 404);
  await assertActorCan(input.actorId, "permissions.assign", { organizationId: before.user.organizationId });
  for (const assignment of input.body.roleAssignments) {
    await assertActorCan(input.actorId, "roles.assign", { organizationId: assignment.organizationId ?? before.user.organizationId });
  }
  for (const scope of normalizeScopes(input.body)) {
    await assertActorCan(input.actorId, "permissions.assign", await scopeAuthorizationResource(scope));
  }

  await db.transaction(async (tx) => {
    const requestedRoleIds = input.body.roleAssignments.map((item) => item.roleId).filter(Boolean) as string[];
    const requestedRoleKeys = input.body.roleAssignments.map((item) => item.roleKey).filter(Boolean) as string[];
    const roleRows = await tx
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.status, "active"),
          requestedRoleIds.length && requestedRoleKeys.length
            ? or(inArray(roles.id, requestedRoleIds), inArray(roles.key, requestedRoleKeys))
            : requestedRoleIds.length
              ? inArray(roles.id, requestedRoleIds)
              : requestedRoleKeys.length
                ? inArray(roles.key, requestedRoleKeys)
                : eq(roles.key, "__none__"),
        ),
      );
    const roleById = new Map(roleRows.map((role) => [role.id, role]));
    const resolvedRoles = input.body.roleAssignments.map((item) => item.roleId
      ? roleById.get(item.roleId)
      : roleRows.find((role) => role.key === item.roleKey && (role.organizationId === before.user.organizationId || role.organizationId === null)));
    if (resolvedRoles.some((role) => !role || (role.organizationId && role.organizationId !== before.user.organizationId))) throw new ApiError("BAD_REQUEST", "One or more roles are invalid, archived, or belong to another organization", 400);
    if (input.body.roleAssignments.some((item) => item.organizationId && item.organizationId !== before.user.organizationId)) throw new ApiError("BAD_REQUEST", "Role assignments cannot cross organizations", 400);

    await tx
      .update(userRoleAssignments)
      .set({ status: "inactive", updatedAt: new Date() })
      .where(and(eq(userRoleAssignments.userId, input.targetUserId), eq(userRoleAssignments.status, "active")));
    await tx.delete(permissionScopeAssignments).where(eq(permissionScopeAssignments.userId, input.targetUserId));
    await tx.delete(userPermissionOverrides).where(eq(userPermissionOverrides.userId, input.targetUserId));

    const insertedAssignments = [];
    for (let index = 0; index < input.body.roleAssignments.length; index += 1) {
      const item = input.body.roleAssignments[index]!;
      const role = resolvedRoles[index]!;
      const [assignment] = await tx.insert(userRoleAssignments).values({
        userId: input.targetUserId,
        roleId: role.id,
        organizationId: item.organizationId ?? role.organizationId ?? before.user.organizationId,
        startsAt: item.startsAt ? new Date(item.startsAt) : null,
        endsAt: item.endsAt ? new Date(item.endsAt) : null,
        status: "active",
        assignedById: input.actorId,
      }).returning();
      insertedAssignments.push(assignment);
    }

    const permissionRows = await tx.select().from(permissions).where(eq(permissions.status, "active"));
    const permissionById = new Map(permissionRows.map((permission) => [permission.id, permission]));
    const permissionByKey = new Map(permissionRows.map((permission) => [permission.key, permission]));
    const normalizedScopes = normalizeScopes(input.body);
    const oldRoleByAssignmentId = new Map(before.roles.map((role) => [role.assignmentId, role.id]));
    const newAssignmentByRoleId = new Map(insertedAssignments.map((assignment) => [assignment.roleId, assignment.id]));
    for (const item of normalizedScopes) {
      const permission = item.permissionKey ? permissionByKey.get(item.permissionKey) : undefined;
      if (item.permissionKey && !permission) throw new ApiError("BAD_REQUEST", `Unknown permission: ${item.permissionKey}`, 400);
      const remappedRoleAssignmentId = item.roleAssignmentId
        ? newAssignmentByRoleId.get(oldRoleByAssignmentId.get(item.roleAssignmentId) ?? "")
        : null;
      if (item.roleAssignmentId && !remappedRoleAssignmentId) throw new ApiError("BAD_REQUEST", "Scope references a role assignment that is not being retained", 400);
      await tx.insert(permissionScopeAssignments).values({
        userId: input.targetUserId,
        permissionId: permission?.id ?? null,
        roleAssignmentId: remappedRoleAssignmentId,
        scopeType: item.scopeType,
        scopeId: item.scopeId ?? null,
        scopeKey: item.scopeKey ?? null,
        effect: item.effect,
        assignedById: input.actorId,
        reason: item.reason ?? input.body.reason ?? null,
      });
    }

    for (const item of input.body.overrides) {
      const permission = (item.permissionId ? permissionById.get(item.permissionId) : undefined) ??
        (item.permissionKey ? permissionByKey.get(item.permissionKey) : undefined);
      if (!permission) throw new ApiError("BAD_REQUEST", "Unknown permission override", 400);
      await tx.insert(userPermissionOverrides).values({
        userId: input.targetUserId,
        permissionId: permission.id,
        effect: item.effect,
        scopeType: item.scopeType ?? null,
        scopeId: item.scopeId ?? null,
        scopeKey: item.scopeKey ?? null,
        assignedById: input.actorId,
        reason: item.reason ?? input.body.reason ?? null,
        expiresAt: item.expiresAt ? new Date(item.expiresAt) : null,
      });
    }
    await tx.delete(sessions).where(eq(sessions.userId, input.targetUserId));
    await audit({
      actorId: input.actorId,
      action: "access.replaced",
      entityType: "user_access",
      entityId: input.targetUserId,
      targetUserId: input.targetUserId,
      beforeState: before,
      afterState: {
        roleAssignments: input.body.roleAssignments,
        scopeAssignments: normalizedScopes,
        overrides: input.body.overrides,
      },
      reason: input.body.reason ?? null,
    }, (values) => tx.insert(auditEvents).values(values));
  });

  const after = await getUserAccess(input.targetUserId);
  for (const role of before.roles) {
    await audit({ actorId: input.actorId, action: "role.removed", entityType: "user_role_assignment", entityId: role.assignmentId, targetUserId: input.targetUserId, beforeState: role, reason: input.body.reason ?? null });
  }
  for (const role of after?.roles ?? []) {
    await audit({ actorId: input.actorId, action: "role.assigned", entityType: "user_role_assignment", entityId: role.assignmentId, targetUserId: input.targetUserId, afterState: role, reason: input.body.reason ?? null });
  }
  for (const scope of before.scopeAssignments) {
    await audit({ actorId: input.actorId, action: "scope.removed", entityType: "permission_scope", entityId: scope.id, targetUserId: input.targetUserId, beforeState: scope, reason: input.body.reason ?? null });
  }
  for (const scope of after?.scopeAssignments ?? []) {
    await audit({ actorId: input.actorId, action: "scope.assigned", entityType: "permission_scope", entityId: scope.id, targetUserId: input.targetUserId, afterState: scope, reason: input.body.reason ?? null });
  }
  for (const override of before.overrides) {
    await audit({ actorId: input.actorId, action: "access.override_removed", entityType: "permission_override", entityId: override.id, targetUserId: input.targetUserId, beforeState: override, reason: input.body.reason ?? null });
    await audit({ actorId: input.actorId, action: "permission.removed", entityType: "permission_override", entityId: override.id, targetUserId: input.targetUserId, beforeState: override, reason: input.body.reason ?? null });
  }
  for (const override of after?.overrides ?? []) {
    await audit({ actorId: input.actorId, action: "access.override_created", entityType: "permission_override", entityId: override.id, targetUserId: input.targetUserId, afterState: override, reason: input.body.reason ?? null });
    await audit({ actorId: input.actorId, action: override.effect === "deny" ? "permission.denied" : "permission.granted", entityType: "permission_override", entityId: override.id, targetUserId: input.targetUserId, afterState: override, reason: input.body.reason ?? null });
  }
  return after;
}

export async function addUserRoleAssignment(input: {
  actorId: string;
  targetUserId: string;
  roleId?: string;
  roleKey?: string;
  organizationId?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
}) {
  const target = (await db.select().from(users).where(eq(users.id, input.targetUserId)).limit(1))[0];
  if (!target) throw new ApiError("NOT_FOUND", "User not found", 404);
  const role = input.roleId
    ? (await db.select().from(roles).where(eq(roles.id, input.roleId)).limit(1))[0]
    : (await db.select().from(roles).where(and(
        eq(roles.key, input.roleKey!),
        target.organizationId ? or(eq(roles.organizationId, target.organizationId), isNull(roles.organizationId)) : isNull(roles.organizationId),
      )).limit(1))[0];
  if (!role || role.status !== "active" || (role.organizationId && role.organizationId !== target.organizationId)) throw new ApiError("BAD_REQUEST", "Role not found, archived, or belongs to another organization", 400);
  if (input.organizationId && input.organizationId !== target.organizationId) throw new ApiError("BAD_REQUEST", "Role assignment cannot cross organizations", 400);
  await assertActorCan(input.actorId, "roles.assign", { organizationId: input.organizationId ?? role.organizationId ?? target.organizationId });
  const existingAssignment = (await db.select().from(userRoleAssignments).where(and(
    eq(userRoleAssignments.userId, input.targetUserId),
    eq(userRoleAssignments.roleId, role.id),
    eq(userRoleAssignments.status, "active"),
  )).limit(1))[0];
  if (existingAssignment) return existingAssignment;
  return db.transaction(async (tx) => {
    const [assignment] = await tx.insert(userRoleAssignments).values({
      userId: input.targetUserId,
      roleId: role.id,
      organizationId: input.organizationId ?? role.organizationId ?? target.organizationId,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      assignedById: input.actorId,
    }).returning();
    await tx.delete(sessions).where(eq(sessions.userId, input.targetUserId));
    await audit({ actorId: input.actorId, action: "role.assigned", entityType: "user_role_assignment", entityId: assignment.id, targetUserId: input.targetUserId, afterState: assignment }, (values) => tx.insert(auditEvents).values(values));
    return assignment;
  });
}

export async function addUserPermissionScope(input: {
  actorId: string;
  targetUserId: string;
  permissionKey?: string | null;
  roleAssignmentId?: string | null;
  scopeType: string;
  scopeId?: string | null;
  scopeKey?: string | null;
  effect: string;
  reason?: string | null;
}) {
  const target = (await db.select().from(users).where(eq(users.id, input.targetUserId)).limit(1))[0];
  if (!target) throw new ApiError("NOT_FOUND", "User not found", 404);
  await assertActorCan(input.actorId, "permissions.assign", { organizationId: target.organizationId });
  await assertActorCan(input.actorId, "permissions.assign", await scopeAuthorizationResource(input));
  const permission = input.permissionKey
    ? (await db.select().from(permissions).where(and(eq(permissions.key, input.permissionKey), eq(permissions.status, "active"))).limit(1))[0]
    : null;
  if (input.permissionKey && !permission) throw new ApiError("BAD_REQUEST", "Permission not found", 400);
  if (input.roleAssignmentId && !(await db.select({ id: userRoleAssignments.id }).from(userRoleAssignments).where(and(eq(userRoleAssignments.id, input.roleAssignmentId), eq(userRoleAssignments.userId, input.targetUserId), eq(userRoleAssignments.status, "active"))).limit(1))[0]) throw new ApiError("BAD_REQUEST", "Role assignment does not belong to the target user", 400);
  return db.transaction(async (tx) => {
    const [scope] = await tx.insert(permissionScopeAssignments).values({
      userId: input.targetUserId,
      permissionId: permission?.id,
      roleAssignmentId: input.roleAssignmentId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      scopeKey: input.scopeKey,
      effect: input.effect,
      assignedById: input.actorId,
      reason: input.reason,
    }).returning();
    await tx.delete(sessions).where(eq(sessions.userId, input.targetUserId));
    await audit({ actorId: input.actorId, action: "scope.assigned", entityType: "permission_scope", entityId: scope.id, targetUserId: input.targetUserId, afterState: scope, reason: input.reason ?? null }, (values) => tx.insert(auditEvents).values(values));
    return scope;
  });
}

export async function updatePermissionScope(id: string, actorId: string, changes: {
  permissionKey?: string | null;
  roleAssignmentId?: string | null;
  scopeType?: string;
  scopeId?: string | null;
  scopeKey?: string | null;
  effect?: string;
  reason?: string | null;
}) {
  const before = (await db.select().from(permissionScopeAssignments).where(eq(permissionScopeAssignments.id, id)).limit(1))[0];
  if (!before) throw new ApiError("NOT_FOUND", "Permission scope not found", 404);
  const target = (await db.select().from(users).where(eq(users.id, before.userId)).limit(1))[0];
  if (!target) throw new ApiError("NOT_FOUND", "User not found", 404);
  await assertActorCan(actorId, "permissions.assign", { organizationId: target.organizationId });
  await assertActorCan(actorId, "permissions.assign", await scopeAuthorizationResource({
    scopeType: changes.scopeType ?? before.scopeType,
    scopeId: changes.scopeId === undefined ? before.scopeId : changes.scopeId,
    scopeKey: changes.scopeKey === undefined ? before.scopeKey : changes.scopeKey,
  }));
  const permission = changes.permissionKey
    ? (await db.select().from(permissions).where(and(eq(permissions.key, changes.permissionKey), eq(permissions.status, "active"))).limit(1))[0]
    : null;
  if (changes.permissionKey && !permission) throw new ApiError("BAD_REQUEST", "Permission not found", 400);
  const roleAssignmentId = changes.roleAssignmentId === undefined ? before.roleAssignmentId : changes.roleAssignmentId;
  if (roleAssignmentId && !(await db
    .select({ id: userRoleAssignments.id })
    .from(userRoleAssignments)
    .where(and(
      eq(userRoleAssignments.id, roleAssignmentId),
      eq(userRoleAssignments.userId, before.userId),
      eq(userRoleAssignments.status, "active"),
    ))
    .limit(1))[0]) throw new ApiError("BAD_REQUEST", "Role assignment does not belong to the target user", 400);

  return db.transaction(async (tx) => {
    const [after] = await tx.update(permissionScopeAssignments).set({
      permissionId: changes.permissionKey === undefined ? undefined : permission?.id ?? null,
      roleAssignmentId: changes.roleAssignmentId,
      scopeType: changes.scopeType,
      scopeId: changes.scopeId,
      scopeKey: changes.scopeKey,
      effect: changes.effect,
      reason: changes.reason,
      updatedAt: new Date(),
    }).where(eq(permissionScopeAssignments.id, id)).returning();
    if (!after) throw new ApiError("CONFLICT", "Permission scope changed concurrently", 409);
    await tx.delete(sessions).where(eq(sessions.userId, before.userId));
    await audit({ actorId, action: "scope.updated", entityType: "permission_scope", entityId: id, targetUserId: before.userId, beforeState: before, afterState: after, reason: changes.reason ?? null }, (values) => tx.insert(auditEvents).values(values));
    return after;
  });
}

export async function deletePermissionScope(id: string, actorId: string) {
  const before = (await db.select().from(permissionScopeAssignments).where(eq(permissionScopeAssignments.id, id)).limit(1))[0];
  if (!before) throw new ApiError("NOT_FOUND", "Permission scope not found", 404);
  const target = (await db.select().from(users).where(eq(users.id, before.userId)).limit(1))[0];
  if (!target) throw new ApiError("NOT_FOUND", "User not found", 404);
  await assertActorCan(actorId, "permissions.assign", { organizationId: target.organizationId });
  await assertActorCan(actorId, "permissions.assign", await scopeAuthorizationResource(before));
  return db.transaction(async (tx) => {
    const [removed] = await tx.delete(permissionScopeAssignments).where(eq(permissionScopeAssignments.id, id)).returning();
    if (!removed) throw new ApiError("CONFLICT", "Permission scope changed concurrently", 409);
    await tx.delete(sessions).where(eq(sessions.userId, before.userId));
    await audit({ actorId, action: "scope.removed", entityType: "permission_scope", entityId: id, targetUserId: before.userId, beforeState: before, reason: "Scope assignment removed" }, (values) => tx.insert(auditEvents).values(values));
    return removed;
  });
}
