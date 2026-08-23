import { NextResponse } from "next/server";
import { scopeReferenceSchema } from "@cnpaf/shared";
import { addUserPermissionScope } from "@/lib/access-admin";
import { jsonError, requirePermission } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("permissions.assign");
  if (error || !user) return error;
  const parsed = scopeReferenceSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  try {
    return NextResponse.json({ scope: await addUserPermissionScope({ actorId: user.id, targetUserId: (await params).id, ...parsed.data }) }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not assign scope", 409);
  }
}
