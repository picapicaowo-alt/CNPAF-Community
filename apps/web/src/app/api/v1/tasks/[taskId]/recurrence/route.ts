import { NextResponse } from "next/server";
import { taskRecurrenceStatusBodySchema } from "@cnpaf/shared";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { requirePermission } from "@/lib/http";
import { updateTaskRecurrenceStatus } from "@/lib/modules/tasks";

type Context = { params: Promise<{ taskId: string }> };

export async function PATCH(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("tasks.edit");
    if (error || !user) return error;
    const recurrence = await updateTaskRecurrenceStatus(
      user.id,
      (await params).taskId,
      taskRecurrenceStatusBodySchema.parse(await req.json()),
      traceId,
    );
    return NextResponse.json({ recurrence });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
