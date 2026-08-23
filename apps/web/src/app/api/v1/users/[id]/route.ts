import { NextResponse } from "next/server";
import { getUserAccess } from "@/lib/access-admin";
import { jsonError, requirePermission } from "@/lib/http";
import { authorize } from "@/lib/authorization";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("users.view");
  if (error) return error;
  const access = await getUserAccess((await params).id);
  if (access && !(await authorize({ userId: user.id, permission: "users.view", resource: { organizationId: access.user.organizationId } })).allowed) return jsonError("Forbidden", 403);
  return access ? NextResponse.json(access) : jsonError("User not found", 404);
}
