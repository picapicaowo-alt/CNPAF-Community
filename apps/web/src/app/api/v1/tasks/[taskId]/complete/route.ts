import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { transitionMyTask } from "@/lib/modules/tasks";

type Context = { params: Promise<{ taskId: string }> };
export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("tasks.view");
    if (error || !user) return error;
    return NextResponse.json({ assignment: await transitionMyTask(user.id, (await params).taskId, "completed", traceId) });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
