import { NextResponse } from "next/server";
import { roleAssignmentInputSchema } from "@cnpaf/shared";
import { addUserRoleAssignment } from "@/lib/access-admin";
import { jsonError, requirePermission } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("roles.assign");
  if (error || !user) return error;
  const parsed = roleAssignmentInputSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  try {
    return NextResponse.json({ assignment: await addUserRoleAssignment({ actorId: user.id, targetUserId: (await params).id, ...parsed.data }) }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not assign role", 409);
  }
}
