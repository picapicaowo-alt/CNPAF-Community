import { after, NextResponse } from "next/server";
import { taskNotificationBodySchema } from "@cnpaf/shared";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { requirePermission } from "@/lib/http";
import { processNotificationEmailJobs } from "@/lib/jobs";
import { sendTaskNotification } from "@/lib/modules/tasks";

type Context = { params: Promise<{ taskId: string }> };

export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("tasks.assign");
    if (error || !user) return error;
    const result = await sendTaskNotification(
      user.id,
      (await params).taskId,
      taskNotificationBodySchema.parse(await req.json()),
      traceId,
    );
    after(() => processNotificationEmailJobs());
    return NextResponse.json({ result });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
