import { NextResponse } from "next/server";
import { replaceUserAccessBodySchema } from "@cnpaf/shared";
import { requirePermission, jsonError } from "@/lib/http";
import { getUserAccess, replaceUserAccess } from "@/lib/access-admin";
import { authorize } from "@/lib/authorization";

type Context = { params: Promise<{ userId: string }> };

export async function GET(_req: Request, { params }: Context) {
  const { user, error } = await requirePermission("permissions.assign");
  if (error) return error;
  const { userId } = await params;
  const access = await getUserAccess(userId);
  if (access && !(await authorize({ userId: user.id, permission: "permissions.assign", resource: { organizationId: access.user.organizationId } })).allowed) return jsonError("Forbidden", 403);
  return access ? NextResponse.json(access) : jsonError("User not found", 404);
}

export async function PUT(req: Request, { params }: Context) {
  const { user, error } = await requirePermission("permissions.assign");
  if (error || !user) return error;
  const parsed = replaceUserAccessBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { userId } = await params;
  try {
    const access = await replaceUserAccess({ actorId: user.id, targetUserId: userId, body: parsed.data });
    return NextResponse.json(access);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not update access", 409);
  }
}
