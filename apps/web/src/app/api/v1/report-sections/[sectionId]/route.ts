import { NextResponse } from "next/server";
import { reportSectionUpdateBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { deleteReportSection, updateReportSection } from "@/lib/modules/editable-reports";

type Context = { params: Promise<{ sectionId: string }> };
export async function PATCH(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("reports.edit");
    if (error || !user) return error;
    return NextResponse.json({ section: await updateReportSection(user.id, (await params).sectionId, reportSectionUpdateBodySchema.parse(await req.json()), traceId) });
  } catch (error) { return apiErrorResponse(error, traceId); }
}

export async function DELETE(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("reports.edit");
    if (error || !user) return error;
    return NextResponse.json(await deleteReportSection(user.id, (await params).sectionId, traceId));
  } catch (error) { return apiErrorResponse(error, traceId); }
}
