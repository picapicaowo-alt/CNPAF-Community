import { after, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { permissions, rolePermissions, roles, userRoleAssignments } from "@cnpaf/db/schema";
import { roleUpdateBodySchema } from "@cnpaf/shared";
import { db } from "@/lib/db";
import { requirePermission, jsonError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/authorization";
import { processNotificationEmailJobs } from "@/lib/jobs";
import { queueNotification } from "@/lib/modules/notification-delivery";

export async function PATCH(req: Request, { params }: { params: Promise<{ roleId: string }> }) {
  const { user, error } = await requirePermission("roles.manage");
  if (error || !user) return error;
  const parsed = roleUpdateBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { roleId } = await params;
  const before = (await db.select().from(roles).where(eq(roles.id, roleId)).limit(1))[0];
  if (!before) return jsonError("Role not found", 404);
  if (!(await authorize({ userId: user.id, permission: "roles.manage", resource: { organizationId: before.organizationId } })).allowed) return jsonError("Forbidden", 403);
  if (parsed.data.organizationId !== undefined && !(await authorize({ userId: user.id, permission: "roles.manage", resource: { organizationId: parsed.data.organizationId } })).allowed) return jsonError("Forbidden for destination organization", 403);
  const { permissionKeys, ...roleValues } = parsed.data;
  const updatedRole = await db.transaction(async (tx) => {
    const [role] = await tx.update(roles).set({ ...roleValues, updatedAt: new Date() }).where(eq(roles.id, roleId)).returning();
    if (permissionKeys) {
      const permissionRows = await tx.select().from(permissions);
      const permissionByKey = new Map(permissionRows.map((permission) => [permission.key, permission]));
      if (permissionKeys.some((key) => !permissionByKey.has(key))) throw new Error("Unknown permission key");
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      if (permissionKeys.length) {
        await tx.insert(rolePermissions).values(permissionKeys.map((key) => ({ roleId, permissionId: permissionByKey.get(key)!.id, effect: "allow" })));
      }
    }
    const affectedUsers = await tx
      .select({ userId: userRoleAssignments.userId })
      .from(userRoleAssignments)
      .where(and(eq(userRoleAssignments.roleId, roleId), eq(userRoleAssignments.status, "active")));
    for (const affected of affectedUsers) {
      await queueNotification(tx, {
        userId: affected.userId,
        kindKey: "access_changed",
        title: "Permissions for one of your roles changed",
        body: `The permissions for your role “${role.nameEn}” were updated.`,
        entityType: "user",
        entityId: affected.userId,
        metadata: {
          actionPath: `/people/${affected.userId}`,
          emailSubject: `[CNPAF] Role permissions changed: ${role.nameEn}`,
        },
      });
    }
    return role;
  });
  await audit({ actorId: user.id, action: "role.updated", entityType: "role", entityId: roleId, beforeState: before, afterState: updatedRole });
  after(() => processNotificationEmailJobs());
  return NextResponse.json({ role: updatedRole });
}
