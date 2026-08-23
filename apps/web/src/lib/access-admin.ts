import { and, eq, inArray, or } from "drizzle-orm";
import {
  permissionScopeAssignments,
  permissions,
  roles,
  sites,
  templates,
  userPermissionOverrides,
  userRoleAssignments,
  users,
} from "@cnpaf/db/schema";
import type { PermissionKey, ReplaceUserAccessBody } from "@cnpaf/shared";
import { db } from "./db";
import { audit } from "./audit";
import { evaluateAuthorization, getAccessContext, serializeAccessContext } from "./authorization";

async function assertActorCan(actorId: string, permission: PermissionKey, resource: Parameters<typeof evaluateAuthorization>[2]) {
  const access = await getAccessContext(actorId);
  if (!evaluateAuthorization(access, permission, resource).allowed) throw new Error("Forbidden");
}

async function scopeAuthorizationResource(scope: { scopeType: string; scopeId?: string | null; scopeKey?: string | null }) {
  if (scope.scopeType === "organization") return { organizationId: scope.scopeId ?? null };
  if (scope.scopeType === "site" && scope.scopeId) {
    const site = (await db.select().from(sites).where(eq(sites.id, scope.scopeId)).limit(1))[0];
    if (!site) throw new Error("Site scope target not found");
    return { organizationId: site.organizationId, siteId: site.id };
  }
  if (scope.scopeType === "template" && scope.scopeId) {
    const template = (await db.select().from(templates).where(eq(templates.id, scope.scopeId)).limit(1))[0];
    if (!template) throw new Error("Template scope target not found");
    return { organizationId: template.organizationId, templateId: template.id };
  }
  if (scope.scopeType === "service") return { serviceId: scope.scopeId ?? null, serviceKey: scope.scopeKey ?? null };
  if (scope.scopeType === "data_classification") return { dataClassification: scope.scopeKey ?? null };
  if (scope.scopeType === "research_use") return { researchUse: scope.scopeKey ?? null };
  return {};
}

export async function getUserAccess(userId: string) {
  const user = (await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    organizationId: users.organizationId,
    locale: users.locale,
    status: users.status,
    legacyRole: users.role,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
  }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user) return null;

  const context = await getAccessContext(userId);
  const [scopeRows, overrideRows] = await Promise.all([
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
  ]);

  return {
    user,
    ...serializeAccessContext(context),
    scopeAssignments: scopeRows,
    overrides: overrideRows,
  };
}

function normalizeScopes(body: ReplaceUserAccessBody) {
  const rows = [...body.scopeAssignments];
  const scopes = body.scopes;
  if (!scopes) return rows;
  for (const id of scopes.organizationIds ?? []) rows.push({ scopeType: "organization", scopeId: id, effect: "allow" });
  for (const id of scopes.siteIds ?? []) rows.push({ scopeType: "site", scopeId: id, effect: "allow" });
  for (const id of scopes.serviceIds ?? []) rows.push({ scopeType: "service", scopeId: id, effect: "allow" });
  for (const key of scopes.serviceKeys ?? []) rows.push({ scopeType: "service", scopeKey: key, effect: "allow" });
  for (const id of scopes.templateIds ?? []) rows.push({ scopeType: "template", scopeId: id, effect: "allow" });
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
  if (!before) throw new Error("User not found");
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
    const roleByKey = new Map(roleRows.map((role) => [role.key, role]));
    if (roleRows.length !== input.body.roleAssignments.length) throw new Error("One or more roles are invalid or archived");

    await tx
      .update(userRoleAssignments)
      .set({ status: "inactive", updatedAt: new Date() })
      .where(and(eq(userRoleAssignments.userId, input.targetUserId), eq(userRoleAssignments.status, "active")));
    await tx.delete(permissionScopeAssignments).where(eq(permissionScopeAssignments.userId, input.targetUserId));
    await tx.delete(userPermissionOverrides).where(eq(userPermissionOverrides.userId, input.targetUserId));

    const insertedAssignments = [];
    for (const item of input.body.roleAssignments) {
      const role = (item.roleId ? roleById.get(item.roleId) : undefined) ??
        (item.roleKey ? roleByKey.get(item.roleKey) : undefined);
      if (!role) throw new Error("Role not found");
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
    for (const item of normalizedScopes) {
      const permission = item.permissionKey ? permissionByKey.get(item.permissionKey) : undefined;
      if (item.permissionKey && !permission) throw new Error(`Unknown permission: ${item.permissionKey}`);
      await tx.insert(permissionScopeAssignments).values({
        userId: input.targetUserId,
        permissionId: permission?.id ?? null,
        roleAssignmentId: item.roleAssignmentId ?? null,
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
      if (!permission) throw new Error("Unknown permission override");
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
  });

  const after = await getUserAccess(input.targetUserId);
  await audit({
    actorId: input.actorId,
    action: "access.replaced",
    entityType: "user_access",
    entityId: input.targetUserId,
    targetUserId: input.targetUserId,
    beforeState: before,
    afterState: after,
    reason: input.body.reason ?? null,
  });
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
  const role = input.roleId
    ? (await db.select().from(roles).where(eq(roles.id, input.roleId)).limit(1))[0]
    : (await db.select().from(roles).where(eq(roles.key, input.roleKey!)).limit(1))[0];
  if (!role || role.status !== "active") throw new Error("Role not found or archived");
  const target = (await db.select().from(users).where(eq(users.id, input.targetUserId)).limit(1))[0];
  if (!target) throw new Error("User not found");
  await assertActorCan(input.actorId, "roles.assign", { organizationId: input.organizationId ?? role.organizationId ?? target.organizationId });
  const [assignment] = await db.insert(userRoleAssignments).values({
    userId: input.targetUserId,
    roleId: role.id,
    organizationId: input.organizationId ?? role.organizationId ?? target.organizationId,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    assignedById: input.actorId,
  }).returning();
  await audit({ actorId: input.actorId, action: "role.assigned", entityType: "user_role_assignment", entityId: assignment.id, targetUserId: input.targetUserId, afterState: assignment });
  return assignment;
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
  if (!target) throw new Error("User not found");
  await assertActorCan(input.actorId, "permissions.assign", { organizationId: target.organizationId });
  await assertActorCan(input.actorId, "permissions.assign", await scopeAuthorizationResource(input));
  const permission = input.permissionKey
    ? (await db.select().from(permissions).where(eq(permissions.key, input.permissionKey)).limit(1))[0]
    : null;
  if (input.permissionKey && !permission) throw new Error("Permission not found");
  const [scope] = await db.insert(permissionScopeAssignments).values({
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
  await audit({ actorId: input.actorId, action: "scope.assigned", entityType: "permission_scope", entityId: scope.id, targetUserId: input.targetUserId, afterState: scope, reason: input.reason ?? null });
  return scope;
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
  if (!before) throw new Error("Permission scope not found");
  const target = (await db.select().from(users).where(eq(users.id, before.userId)).limit(1))[0];
  if (!target) throw new Error("User not found");
  await assertActorCan(actorId, "permissions.assign", { organizationId: target.organizationId });
  await assertActorCan(actorId, "permissions.assign", await scopeAuthorizationResource({
    scopeType: changes.scopeType ?? before.scopeType,
    scopeId: changes.scopeId === undefined ? before.scopeId : changes.scopeId,
    scopeKey: changes.scopeKey === undefined ? before.scopeKey : changes.scopeKey,
  }));
  const permission = changes.permissionKey
    ? (await db.select().from(permissions).where(eq(permissions.key, changes.permissionKey)).limit(1))[0]
    : null;
  if (changes.permissionKey && !permission) throw new Error("Permission not found");
  const [after] = await db.update(permissionScopeAssignments).set({
    permissionId: changes.permissionKey === undefined ? undefined : permission?.id ?? null,
    roleAssignmentId: changes.roleAssignmentId,
    scopeType: changes.scopeType,
    scopeId: changes.scopeId,
    scopeKey: changes.scopeKey,
    effect: changes.effect,
    reason: changes.reason,
    updatedAt: new Date(),
  }).where(eq(permissionScopeAssignments.id, id)).returning();
  await audit({ actorId, action: "scope.updated", entityType: "permission_scope", entityId: id, targetUserId: before.userId, beforeState: before, afterState: after, reason: changes.reason ?? null });
  return after;
}

export async function deletePermissionScope(id: string, actorId: string) {
  const before = (await db.select().from(permissionScopeAssignments).where(eq(permissionScopeAssignments.id, id)).limit(1))[0];
  if (!before) throw new Error("Permission scope not found");
  const target = (await db.select().from(users).where(eq(users.id, before.userId)).limit(1))[0];
  if (!target) throw new Error("User not found");
  await assertActorCan(actorId, "permissions.assign", { organizationId: target.organizationId });
  await assertActorCan(actorId, "permissions.assign", await scopeAuthorizationResource(before));
  await db.delete(permissionScopeAssignments).where(eq(permissionScopeAssignments.id, id));
  await audit({ actorId, action: "scope.removed", entityType: "permission_scope", entityId: id, targetUserId: before.userId, beforeState: before, reason: "Scope assignment removed" });
  return before;
}
