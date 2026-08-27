import { after, NextResponse } from "next/server";
import { replaceUserAccessBodySchema } from "@cnpaf/shared";
import { requirePermission, jsonError } from "@/lib/http";
import { getUserAccess, replaceUserAccess } from "@/lib/access-admin";
import { authorize } from "@/lib/authorization";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { processNotificationEmailJobs } from "@/lib/jobs";

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
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("permissions.assign");
    if (error || !user) return error;
    const { userId } = await params;
    const access = await replaceUserAccess({ actorId: user.id, targetUserId: userId, body: replaceUserAccessBodySchema.parse(await req.json()) });
    after(() => processNotificationEmailJobs());
    return NextResponse.json(access);
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
