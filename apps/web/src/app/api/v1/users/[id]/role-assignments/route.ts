import { NextResponse } from "next/server";
import { roleAssignmentInputSchema } from "@cnpaf/shared";
import { addUserRoleAssignment } from "@/lib/access-admin";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("roles.assign");
    if (error || !user) return error;
    const body = roleAssignmentInputSchema.parse(await req.json());
    return NextResponse.json({ assignment: await addUserRoleAssignment({ actorId: user.id, targetUserId: (await params).id, ...body }) }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
