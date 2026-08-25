import { NextResponse } from "next/server";
import { scopeReferenceUpdateSchema } from "@cnpaf/shared";
import { deletePermissionScope, updatePermissionScope } from "@/lib/access-admin";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("permissions.assign");
    if (error || !user) return error;
    return NextResponse.json({ scope: await updatePermissionScope((await params).id, user.id, scopeReferenceUpdateSchema.parse(await req.json())) });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("permissions.assign");
    if (error || !user) return error;
    await deletePermissionScope((await params).id, user.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
