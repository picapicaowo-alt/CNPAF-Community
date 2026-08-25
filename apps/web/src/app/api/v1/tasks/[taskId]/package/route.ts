import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse } from "@/lib/api-error";
import { getTaskPackage } from "@/lib/modules/tasks";

type Context = { params: Promise<{ taskId: string }> };
export async function GET(_req: Request, { params }: Context) {
  try {
    const { user, error } = await requirePermission("tasks.view");
    if (error || !user) return error;
    return NextResponse.json(await getTaskPackage(user.id, (await params).taskId));
  } catch (error) { return apiErrorResponse(error); }
}
