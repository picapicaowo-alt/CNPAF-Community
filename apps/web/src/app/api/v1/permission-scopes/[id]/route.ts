import { NextResponse } from "next/server";
import { scopeReferenceUpdateSchema } from "@cnpaf/shared";
import { deletePermissionScope, updatePermissionScope } from "@/lib/access-admin";
import { jsonError, requirePermission } from "@/lib/http";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("permissions.assign");
  if (error || !user) return error;
  const parsed = scopeReferenceUpdateSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  try {
    return NextResponse.json({ scope: await updatePermissionScope((await params).id, user.id, parsed.data) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not update scope", 404);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("permissions.assign");
  if (error || !user) return error;
  try {
    await deletePermissionScope((await params).id, user.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not delete scope", 404);
  }
}
