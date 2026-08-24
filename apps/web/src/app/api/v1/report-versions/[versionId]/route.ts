import { NextResponse } from "next/server";
import { editableReportVersionUpdateBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { updateReportVersion } from "@/lib/modules/editable-reports";

type Context = { params: Promise<{ versionId: string }> };
export async function PATCH(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("reports.edit");
    if (error || !user) return error;
    return NextResponse.json({ version: await updateReportVersion(user.id, (await params).versionId, editableReportVersionUpdateBodySchema.parse(await req.json()), traceId) });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
