import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { permissions, rolePermissions, roles } from "@cnpaf/db/schema";
import { roleCreateBodySchema } from "@cnpaf/shared";
import { db } from "@/lib/db";
import { requirePermission, jsonError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { evaluateAuthorization, getAccessContext } from "@/lib/authorization";

export async function GET() {
  const { user, error } = await requirePermission("roles.view");
  if (error) return error;
  const [roleRows, mappings] = await Promise.all([
    db.select().from(roles),
    db.select({ roleId: rolePermissions.roleId, permissionId: permissions.id, permissionKey: permissions.key, effect: rolePermissions.effect })
      .from(rolePermissions).innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id)),
  ]);
  const byRole = new Map<string, typeof mappings>();
  for (const mapping of mappings) {
    const list = byRole.get(mapping.roleId) ?? [];
    list.push(mapping);
    byRole.set(mapping.roleId, list);
  }
  const access = await getAccessContext(user.id);
  const visible = roleRows.filter((role) => evaluateAuthorization(access, "roles.view", { organizationId: role.organizationId }).allowed);
  return NextResponse.json({ roles: visible.map((role) => ({ ...role, permissions: byRole.get(role.id) ?? [] })) });
}

export async function POST(req: Request) {
  const { user, error } = await requirePermission("roles.manage");
  if (error || !user) return error;
  const parsed = roleCreateBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  if (!evaluateAuthorization(await getAccessContext(user.id), "roles.manage", { organizationId: parsed.data.organizationId }).allowed) return jsonError("Forbidden", 403);
  const permissionRows = parsed.data.permissionKeys.length
    ? await db.select().from(permissions)
    : [];
  const permissionByKey = new Map(permissionRows.map((permission) => [permission.key, permission]));
  if (parsed.data.permissionKeys.some((key) => !permissionByKey.has(key))) return jsonError("Unknown permission key");
  try {
    const created = await db.transaction(async (tx) => {
      const [role] = await tx.insert(roles).values({
        key: parsed.data.key,
        nameEn: parsed.data.nameEn,
        nameZh: parsed.data.nameZh,
        description: parsed.data.description,
        organizationId: parsed.data.organizationId,
        isSystemRole: false,
      }).returning();
      if (parsed.data.permissionKeys.length) {
        await tx.insert(rolePermissions).values(parsed.data.permissionKeys.map((key) => ({
          roleId: role.id,
          permissionId: permissionByKey.get(key)!.id,
          effect: "allow",
        })));
      }
      return role;
    });
    await audit({ actorId: user.id, action: "role.created", entityType: "role", entityId: created.id, afterState: created });
    return NextResponse.json({ role: created }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not create role", 409);
  }
}
