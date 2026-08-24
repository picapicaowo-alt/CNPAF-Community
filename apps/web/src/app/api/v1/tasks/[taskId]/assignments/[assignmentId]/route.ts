import { NextResponse } from "next/server";
import { taskAssignmentTransitionBodySchema } from "@cnpaf/shared";
import { requireUser } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { transitionAssignment } from "@/lib/modules/tasks";

type Context = { params: Promise<{ taskId: string; assignmentId: string }> };

export async function PATCH(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requireUser();
    if (error || !user) return error;
    if (user.mustChangePassword) return NextResponse.json({ error: "Password change required", code: "PASSWORD_CHANGE_REQUIRED" }, { status: 403 });
    const { taskId, assignmentId } = await params;
    const assignment = await transitionAssignment(user.id, taskId, assignmentId, taskAssignmentTransitionBodySchema.parse(await req.json()), traceId);
    return NextResponse.json({ assignment });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
