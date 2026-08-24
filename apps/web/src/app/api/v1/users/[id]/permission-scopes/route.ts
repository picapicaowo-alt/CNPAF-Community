import { NextResponse } from "next/server";
import { scopeReferenceSchema } from "@cnpaf/shared";
import { addUserPermissionScope } from "@/lib/access-admin";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("permissions.assign");
    if (error || !user) return error;
    const body = scopeReferenceSchema.parse(await req.json());
    return NextResponse.json({ scope: await addUserPermissionScope({ actorId: user.id, targetUserId: (await params).id, ...body }) }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
