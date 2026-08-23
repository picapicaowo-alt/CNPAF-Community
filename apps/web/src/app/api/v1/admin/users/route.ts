import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { roles, userRoleAssignments, users } from "@cnpaf/db/schema";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/http";
import { evaluateAuthorization, getAccessContext } from "@/lib/authorization";

export async function GET() {
  const { user: actor, error } = await requirePermission("users.view");
  if (error) return error;
  const [userRows, assignmentRows] = await Promise.all([
    db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      organizationId: users.organizationId,
      locale: users.locale,
      status: users.status,
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
  ]);
  const byUser = new Map<string, typeof assignmentRows>();
  for (const assignment of assignmentRows) {
    const list = byUser.get(assignment.userId) ?? [];
    list.push(assignment);
    byUser.set(assignment.userId, list);
  }
  const access = await getAccessContext(actor.id);
  const visible = userRows.filter((user) => evaluateAuthorization(access, "users.view", { organizationId: user.organizationId }).allowed);
  return NextResponse.json({ users: visible.map((user) => ({ ...user, roleAssignments: byUser.get(user.id) ?? [] })) });
}
