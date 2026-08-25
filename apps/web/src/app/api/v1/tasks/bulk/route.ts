import { NextResponse } from "next/server";
import { taskBulkActionBodySchema } from "@cnpaf/shared";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { requireUser } from "@/lib/http";
import { bulkMutateTasks } from "@/lib/modules/tasks";

export async function POST(req: Request) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requireUser();
    if (error || !user) return error;
    const result = await bulkMutateTasks(
      user.id,
      taskBulkActionBodySchema.parse(await req.json()),
      traceId,
    );
    return NextResponse.json({ result });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
