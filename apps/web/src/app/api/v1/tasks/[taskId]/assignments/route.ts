import { NextResponse } from "next/server";
import { taskAssignmentBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { assignTask } from "@/lib/modules/tasks";

type Context = { params: Promise<{ taskId: string }> };

export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("tasks.assign");
    if (error || !user) return error;
    const assignments = await assignTask(user.id, (await params).taskId, taskAssignmentBodySchema.parse(await req.json()), traceId);
    return NextResponse.json({ assignments }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
