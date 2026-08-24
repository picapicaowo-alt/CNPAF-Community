import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { closeTask } from "@/lib/modules/tasks";

type Context = { params: Promise<{ taskId: string }> };
export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("tasks.edit");
    if (error || !user) return error;
    return NextResponse.json({ task: await closeTask(user.id, (await params).taskId, traceId) });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
