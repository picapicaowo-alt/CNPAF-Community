import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { permissions, rolePermissions, roles } from "@cnpaf/db/schema";
import { roleUpdateBodySchema } from "@cnpaf/shared";
import { db } from "@/lib/db";
import { requirePermission, jsonError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/authorization";

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
  const after = await db.transaction(async (tx) => {
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
    return role;
  });
  await audit({ actorId: user.id, action: "role.updated", entityType: "role", entityId: roleId, beforeState: before, afterState: after });
  return NextResponse.json({ role: after });
}
