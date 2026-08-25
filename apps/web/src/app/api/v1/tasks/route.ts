import { NextResponse } from "next/server";
import { taskCreateBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { createTask, listTasks } from "@/lib/modules/tasks";

export async function GET() {
  const { user, error } = await requirePermission("tasks.view");
  if (error || !user) return error;
  return NextResponse.json({ tasks: await listTasks(user.id) });
}

export async function POST(req: Request) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("tasks.create");
    if (error || !user) return error;
    const task = await createTask(user.id, taskCreateBodySchema.parse(await req.json()), traceId);
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
