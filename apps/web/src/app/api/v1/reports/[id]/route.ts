import { NextResponse } from "next/server";
import { canReadReportArtifact, getReportArtifact } from "@/lib/reports";
import { jsonError, requirePermission } from "@/lib/http";
import { editableReportUpdateBodySchema } from "@cnpaf/shared";
import { ApiError, apiErrorResponse, requestId } from "@/lib/api-error";
import { getEditableReport, updateEditableReport } from "@/lib/modules/editable-reports";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("reports.view");
  if (error || !user) return error;
  const id = (await params).id;
  try {
    return NextResponse.json(await getEditableReport(user.id, id));
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) return apiErrorResponse(error);
  }
  const bundle = await getReportArtifact(id);
  if (!bundle) return jsonError("Report not found", 404);
  if (!(await canReadReportArtifact(user.id, bundle.artifact.id))) return jsonError("Forbidden", 403);
  return NextResponse.json(bundle);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("reports.edit");
    if (error || !user) return error;
    return NextResponse.json({ report: await updateEditableReport(user.id, (await params).id, editableReportUpdateBodySchema.parse(await req.json()), traceId) });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
