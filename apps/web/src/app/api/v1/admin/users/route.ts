import { after, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { permissionScopeAssignments, personGroupMemberships, personGroups, programMemberships, programs, roles, userAffiliations, userRoleAssignments, users } from "@cnpaf/db/schema";
import { db } from "@/lib/db";
import { requireAnyPermission, requirePermission } from "@/lib/http";
import { evaluateAuthorization, getAccessContext } from "@/lib/authorization";
import { manualAccountCreateBodySchema } from "@cnpaf/shared";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { createAccount } from "@/lib/modules/accounts";
import { processNotificationEmailJobs } from "@/lib/jobs";
import { getAiAccessStates } from "@/lib/access-admin";

export async function GET(req: Request) {
  const { user: actor, error } = await requireAnyPermission(["people.view", "users.view"]);
  if (error) return error;
  const [userRows, assignmentRows, affiliationRows, membershipRows, scopeRows, groupRows] = await Promise.all([
    db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      organizationId: users.organizationId,
      locale: users.locale,
      status: users.status,
      mustChangePassword: users.mustChangePassword,
      passwordChangedAt: users.passwordChangedAt,
      avatarStorageKey: users.avatarStorageKey,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    }).from(users),
    db.select({
      userId: userRoleAssignments.userId,
      assignmentId: userRoleAssignments.id,
      roleId: roles.id,
      roleKey: roles.key,
      roleNameEn: roles.nameEn,
      roleNameZh: roles.nameZh,
      organizationId: userRoleAssignments.organizationId,
      status: userRoleAssignments.status,
    }).from(userRoleAssignments).innerJoin(roles, eq(userRoleAssignments.roleId, roles.id)),
    db.select().from(userAffiliations),
    db.select({
      userId: programMemberships.userId,
      membershipId: programMemberships.id,
      programId: programs.id,
      programKey: programs.key,
      programNameEn: programs.nameEn,
      programNameZh: programs.nameZh,
      membershipRoleKey: programMemberships.membershipRoleKey,
      status: programMemberships.status,
    }).from(programMemberships).innerJoin(programs, eq(programMemberships.programId, programs.id)),
    db.select().from(permissionScopeAssignments),
    db.select({
      userId: personGroupMemberships.userId,
      id: personGroups.id,
      key: personGroups.key,
      nameEn: personGroups.nameEn,
      nameZh: personGroups.nameZh,
      status: personGroups.status,
    })
      .from(personGroupMemberships)
      .innerJoin(personGroups, eq(personGroupMemberships.groupId, personGroups.id))
      .where(and(
        eq(personGroupMemberships.status, "active"),
        eq(personGroups.status, "active"),
      )),
  ]);
  const byUser = new Map<string, typeof assignmentRows>();
  for (const assignment of assignmentRows) {
    const list = byUser.get(assignment.userId) ?? [];
    list.push(assignment);
    byUser.set(assignment.userId, list);
  }
  const affiliationsByUser = new Map<string, typeof affiliationRows>();
  for (const affiliation of affiliationRows) affiliationsByUser.set(affiliation.userId, [...(affiliationsByUser.get(affiliation.userId) ?? []), affiliation]);
  const membershipsByUser = new Map<string, typeof membershipRows>();
  for (const membership of membershipRows) membershipsByUser.set(membership.userId, [...(membershipsByUser.get(membership.userId) ?? []), membership]);
  const scopesByUser = new Map<string, typeof scopeRows>();
  for (const scope of scopeRows) scopesByUser.set(scope.userId, [...(scopesByUser.get(scope.userId) ?? []), scope]);
  const groupsByUser = new Map<string, typeof groupRows>();
  for (const group of groupRows) groupsByUser.set(group.userId, [...(groupsByUser.get(group.userId) ?? []), group]);
  const access = await getAccessContext(actor.id);
  const url = new URL(req.url);
  const query = (url.searchParams.get("q") ?? "").trim().toLocaleLowerCase();
  const requestedLimit = Number(url.searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 250) : 100;
  const visible = userRows.filter((user) =>
    evaluateAuthorization(access, "people.view", { organizationId: user.organizationId }).allowed ||
    evaluateAuthorization(access, "users.view", { organizationId: user.organizationId }).allowed
  );
  const aiAccessByUser = await getAiAccessStates(visible.map((user) => user.id));
  const enriched = visible.map((user) => {
    const { avatarStorageKey, ...publicUser } = user;
    return {
      ...publicUser,
      avatarUrl: avatarStorageKey
        ? `/api/v1/admin/users/${user.id}/avatar?v=${user.updatedAt.getTime()}`
        : null,
      aiEnabled: aiAccessByUser.get(user.id) ?? false,
      roleAssignments: (byUser.get(user.id) ?? []).filter((assignment) => assignment.status === "active"),
      affiliations: affiliationsByUser.get(user.id) ?? [],
      programMemberships: membershipsByUser.get(user.id) ?? [],
      accessScopes: scopesByUser.get(user.id) ?? [],
      groups: groupsByUser.get(user.id) ?? [],
    };
  });
  const searched = query ? enriched.filter((user) => [
    user.name,
    user.email,
    ...user.affiliations.flatMap((affiliation) => [affiliation.institutionName, affiliation.departmentName, affiliation.title]),
    ...user.programMemberships.flatMap((membership) => [membership.programNameEn, membership.programNameZh]),
    ...user.roleAssignments.flatMap((role) => [role.roleNameEn, role.roleNameZh]),
    ...user.groups.flatMap((group) => [group.nameEn, group.nameZh]),
  ].some((value) => value?.toLocaleLowerCase().includes(query))) : enriched;
  return NextResponse.json({ users: searched.slice(0, limit), total: searched.length, limit });
}

export async function POST(req: Request) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("people.create_account");
    if (error || !user) return error;
    const account = await createAccount(user.id, manualAccountCreateBodySchema.parse(await req.json()), traceId);
    after(() => processNotificationEmailJobs());
    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
