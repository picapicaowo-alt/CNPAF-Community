import { and, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import {
  permissionScopeAssignments,
  permissions,
  rolePermissions,
  roles,
  userPermissionOverrides,
  userRoleAssignments,
} from "@cnpaf/db/schema";
import type { AuthorizationResource, PermissionKey } from "@cnpaf/shared";
import { db } from "./db";

export type RoleGrant = {
  roleAssignmentId: string;
  roleId: string;
  roleKey: string;
  organizationId: string | null;
  permissionId: string;
  permissionKey: string;
  effect: string;
};

export type ScopeGrant = {
  id: string;
  roleAssignmentId: string | null;
  permissionId: string | null;
  permissionKey: string | null;
  scopeType: string;
  scopeId: string | null;
  scopeKey: string | null;
  effect: string;
};

export type PermissionOverride = {
  id: string;
  permissionId: string;
  permissionKey: string;
  effect: string;
  scopeType: string | null;
  scopeId: string | null;
  scopeKey: string | null;
};

export type AccessContext = {
  userId: string;
  roles: Array<{
    assignmentId: string;
    roleId: string;
    key: string;
    nameEn: string;
    nameZh: string;
    organizationId: string | null;
  }>;
  grants: RoleGrant[];
  scopes: ScopeGrant[];
  overrides: PermissionOverride[];
};

export type AuthorizationDecision = {
  allowed: boolean;
  reason: string;
  roleAssignmentIds: string[];
  scopeAssignmentIds: string[];
  overrideIds: string[];
};

function scopeResourceValue(scopeType: string | null, resource: AuthorizationResource) {
  switch (scopeType) {
    case null:
    case "global":
      return "*";
    case "organization":
      return resource.organizationId ?? null;
    case "program":
      return resource.programId ?? null;
    case "site":
    case "location":
      return resource.locationId ?? resource.siteId ?? null;
    case "service":
      return resource.serviceId ?? resource.serviceKey ?? null;
    case "template":
    case "form":
      return resource.formId ?? resource.templateId ?? null;
    case "data_classification":
      return resource.dataClassification ?? null;
    case "research_use":
      return resource.researchUse ?? null;
    default:
      return null;
  }
}

function scopeMatches(
  scope: { scopeType: string | null; scopeId: string | null; scopeKey: string | null },
  resource: AuthorizationResource,
) {
  if (!scope.scopeType || scope.scopeType === "global") return true;
  const value = scopeResourceValue(scope.scopeType, resource);
  if (!value) return false;
  return value === scope.scopeId || value === scope.scopeKey;
}

export function evaluateAuthorization(
  context: AccessContext,
  permission: PermissionKey,
  resource: AuthorizationResource = {},
): AuthorizationDecision {
  const matchingOverrides = context.overrides.filter(
    (override) => override.permissionKey === permission && scopeMatches(override, resource),
  );
  const explicitDenies = matchingOverrides.filter((override) => override.effect === "deny");
  if (explicitDenies.length) {
    return {
      allowed: false,
      reason: "explicit_deny",
      roleAssignmentIds: [],
      scopeAssignmentIds: [],
      overrideIds: explicitDenies.map((override) => override.id),
    };
  }

  if (
    ["records.view_own", "records.edit_own"].includes(permission) &&
    resource.ownerUserId &&
    resource.ownerUserId !== context.userId
  ) {
    return {
      allowed: false,
      reason: "owner_required",
      roleAssignmentIds: [],
      scopeAssignmentIds: [],
      overrideIds: [],
    };
  }

  const explicitAllows = matchingOverrides.filter((override) => override.effect === "allow");
  if (explicitAllows.length) {
    return {
      allowed: true,
      reason: "explicit_allow",
      roleAssignmentIds: [],
      scopeAssignmentIds: [],
      overrideIds: explicitAllows.map((override) => override.id),
    };
  }

  if (
    resource.ownerUserId === context.userId &&
    ["records.view_own", "records.edit_own"].includes(permission)
  ) {
    const ownerGrant = context.grants.find(
      (grant) => grant.permissionKey === permission && grant.effect === "allow",
    );
    if (ownerGrant) {
      return {
        allowed: true,
        reason: "owner_role_permission",
        roleAssignmentIds: [ownerGrant.roleAssignmentId],
        scopeAssignmentIds: [],
        overrideIds: [],
      };
    }
  }

  const grants = context.grants.filter((grant) => grant.permissionKey === permission);
  if (grants.some((grant) => grant.effect === "deny")) {
    return {
      allowed: false,
      reason: "role_deny",
      roleAssignmentIds: grants.filter((grant) => grant.effect === "deny").map((grant) => grant.roleAssignmentId),
      scopeAssignmentIds: [],
      overrideIds: [],
    };
  }

  for (const grant of grants.filter((item) => item.effect === "allow")) {
    if (
      grant.organizationId &&
      resource.organizationId &&
      grant.organizationId !== resource.organizationId
    ) {
      continue;
    }

    const applicableScopes = context.scopes.filter(
      (scope) =>
        (!scope.roleAssignmentId || scope.roleAssignmentId === grant.roleAssignmentId) &&
        (!scope.permissionId || scope.permissionId === grant.permissionId),
    );
    const matchingDenies = applicableScopes.filter(
      (scope) => scope.effect === "deny" && scopeMatches(scope, resource),
    );
    if (matchingDenies.length) continue;

    const allowScopes = applicableScopes.filter((scope) => scope.effect === "allow");
    const globalScopes = allowScopes.filter((scope) => scope.scopeType === "global");
    if (globalScopes.length) {
      return {
        allowed: true,
        reason: "scoped_role_permission",
        roleAssignmentIds: [grant.roleAssignmentId],
        scopeAssignmentIds: globalScopes.map((scope) => scope.id),
        overrideIds: [],
      };
    }

    const resourceScopeTypes = [
      "organization",
      "program",
      "site",
      "location",
      "service",
      "template",
      "form",
      "data_classification",
      "research_use",
    ].filter((type) => scopeResourceValue(type, resource));
    const restrictedTypes = resourceScopeTypes.filter((type) =>
      allowScopes.some((scope) => scope.scopeType === type),
    );
    const unmatchedRestriction = restrictedTypes.some(
      (type) => !allowScopes.some((scope) => scope.scopeType === type && scopeMatches(scope, resource)),
    );
    if (unmatchedRestriction) continue;

    const matchedScopes = allowScopes.filter((scope) => scopeMatches(scope, resource));
    return {
      allowed: true,
      reason: matchedScopes.length ? "scoped_role_permission" : "role_default",
      roleAssignmentIds: [grant.roleAssignmentId],
      scopeAssignmentIds: matchedScopes.map((scope) => scope.id),
      overrideIds: [],
    };
  }

  return {
    allowed: false,
    reason: grants.length ? "outside_assigned_scope" : "permission_not_granted",
    roleAssignmentIds: [],
    scopeAssignmentIds: [],
    overrideIds: [],
  };
}

export async function getAccessContext(userId: string): Promise<AccessContext> {
  const now = new Date();
  const assignmentRows = await db
    .select({
      assignmentId: userRoleAssignments.id,
      roleId: roles.id,
      key: roles.key,
      nameEn: roles.nameEn,
      nameZh: roles.nameZh,
      organizationId: userRoleAssignments.organizationId,
    })
    .from(userRoleAssignments)
    .innerJoin(roles, eq(userRoleAssignments.roleId, roles.id))
    .where(
      and(
        eq(userRoleAssignments.userId, userId),
        eq(userRoleAssignments.status, "active"),
        eq(roles.status, "active"),
        or(isNull(userRoleAssignments.startsAt), lte(userRoleAssignments.startsAt, now)),
        or(isNull(userRoleAssignments.endsAt), gt(userRoleAssignments.endsAt, now)),
      ),
    );

  const assignmentIds = assignmentRows.map((row) => row.assignmentId);
  const roleIds = assignmentRows.map((row) => row.roleId);
  const [grantRows, scopeRows, overrideRows] = await Promise.all([
    roleIds.length
      ? db
          .select({
            roleId: rolePermissions.roleId,
            permissionId: permissions.id,
            permissionKey: permissions.key,
            effect: rolePermissions.effect,
          })
          .from(rolePermissions)
          .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
          .where(and(inArray(rolePermissions.roleId, roleIds), eq(permissions.status, "active")))
      : Promise.resolve([]),
    db
      .select({
        id: permissionScopeAssignments.id,
        roleAssignmentId: permissionScopeAssignments.roleAssignmentId,
        permissionId: permissionScopeAssignments.permissionId,
        permissionKey: permissions.key,
        scopeType: permissionScopeAssignments.scopeType,
        scopeId: permissionScopeAssignments.scopeId,
        scopeKey: permissionScopeAssignments.scopeKey,
        effect: permissionScopeAssignments.effect,
      })
      .from(permissionScopeAssignments)
      .leftJoin(permissions, eq(permissionScopeAssignments.permissionId, permissions.id))
      .where(eq(permissionScopeAssignments.userId, userId)),
    db
      .select({
        id: userPermissionOverrides.id,
        permissionId: userPermissionOverrides.permissionId,
        permissionKey: permissions.key,
        effect: userPermissionOverrides.effect,
        scopeType: userPermissionOverrides.scopeType,
        scopeId: userPermissionOverrides.scopeId,
        scopeKey: userPermissionOverrides.scopeKey,
      })
      .from(userPermissionOverrides)
      .innerJoin(permissions, eq(userPermissionOverrides.permissionId, permissions.id))
      .where(
        and(
          eq(userPermissionOverrides.userId, userId),
          eq(permissions.status, "active"),
          or(isNull(userPermissionOverrides.expiresAt), gt(userPermissionOverrides.expiresAt, now)),
        ),
      ),
  ]);

  const assignmentByRole = new Map<string, typeof assignmentRows>();
  for (const assignment of assignmentRows) {
    const rows = assignmentByRole.get(assignment.roleId) ?? [];
    rows.push(assignment);
    assignmentByRole.set(assignment.roleId, rows);
  }
  const grants: RoleGrant[] = grantRows.flatMap((grant) =>
    (assignmentByRole.get(grant.roleId) ?? []).map((assignment) => ({
      ...grant,
      roleAssignmentId: assignment.assignmentId,
      roleKey: assignment.key,
      organizationId: assignment.organizationId,
    })),
  );

  return {
    userId,
    roles: assignmentRows,
    grants,
    scopes: scopeRows,
    overrides: overrideRows,
  };
}

export async function authorize(input: {
  userId: string;
  permission: PermissionKey;
  resource?: AuthorizationResource;
}) {
  const context = await getAccessContext(input.userId);
  return evaluateAuthorization(context, input.permission, input.resource ?? {});
}

export async function authorizeAny(input: {
  userId: string;
  permissions: PermissionKey[];
  resource?: AuthorizationResource;
}) {
  const context = await getAccessContext(input.userId);
  for (const permission of input.permissions) {
    const decision = evaluateAuthorization(context, permission, input.resource ?? {});
    if (decision.allowed) return { ...decision, permission };
  }
  return {
    allowed: false,
    reason: "none_of_permissions_granted",
    roleAssignmentIds: [],
    scopeAssignmentIds: [],
    overrideIds: [],
    permission: null,
  };
}

export function serializeAccessContext(context: AccessContext) {
  const denied = new Set(
    context.overrides.filter((item) => item.effect === "deny" && !item.scopeType).map((item) => item.permissionKey),
  );
  const permissionKeys = new Set(
    context.grants.filter((grant) => grant.effect === "allow").map((grant) => grant.permissionKey),
  );
  for (const override of context.overrides) {
    if (override.effect === "allow") permissionKeys.add(override.permissionKey);
  }
  for (const key of denied) permissionKeys.delete(key);

  const ids = (type: string) =>
    [...new Set(context.scopes.filter((scope) => scope.scopeType === type && scope.effect === "allow").map((scope) => scope.scopeId).filter(Boolean))];
  const keys = (type: string) =>
    [...new Set(context.scopes.filter((scope) => scope.scopeType === type && scope.effect === "allow").map((scope) => scope.scopeKey).filter(Boolean))];

  return {
    roles: context.roles.map((role) => ({
      assignmentId: role.assignmentId,
      id: role.roleId,
      key: role.key,
      nameEn: role.nameEn,
      nameZh: role.nameZh,
      organizationId: role.organizationId,
    })),
    permissions: [...permissionKeys].sort(),
    scopes: {
      organizationIds: ids("organization"),
      programIds: ids("program"),
      siteIds: ids("site"),
      locationIds: ids("location"),
      serviceIds: ids("service"),
      serviceKeys: keys("service"),
      templateIds: ids("template"),
      formIds: ids("form"),
      dataClasses: keys("data_classification"),
      researchUse: keys("research_use"),
    },
  };
}
