import { NextResponse } from "next/server";
import { listReportsForUser } from "@/lib/reports";
import { requirePermission } from "@/lib/http";
import { editableReportCreateBodySchema } from "@cnpaf/shared";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { createEditableReport, listEditableReports } from "@/lib/modules/editable-reports";

export async function GET() {
  const { user, error } = await requirePermission("reports.view");
  if (error || !user) return error;
  const [reports, generatedArtifacts] = await Promise.all([
    listEditableReports(user.id),
    listReportsForUser(user.id),
  ]);
  return NextResponse.json({ reports, generatedArtifacts });
}

export async function POST(req: Request) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("reports.edit");
    if (error || !user) return error;
    const report = await createEditableReport(user.id, editableReportCreateBodySchema.parse(await req.json()), traceId);
    return NextResponse.json(report, { status: 201 });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
