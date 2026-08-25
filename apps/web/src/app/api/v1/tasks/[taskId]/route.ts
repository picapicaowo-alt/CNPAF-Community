import { NextResponse } from "next/server";
import { taskUpdateBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { getTask, updateTask } from "@/lib/modules/tasks";

type Context = { params: Promise<{ taskId: string }> };

export async function GET(_req: Request, { params }: Context) {
  try {
    const { user, error } = await requirePermission("tasks.view");
    if (error || !user) return error;
    return NextResponse.json(await getTask(user.id, (await params).taskId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("tasks.edit");
    if (error || !user) return error;
    const task = await updateTask(user.id, (await params).taskId, taskUpdateBodySchema.parse(await req.json()), traceId);
    return NextResponse.json({ task });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
