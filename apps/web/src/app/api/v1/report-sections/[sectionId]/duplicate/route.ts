import { NextResponse } from "next/server";
import { reportSectionDuplicateBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { duplicateReportSection } from "@/lib/modules/editable-reports";

type Context = { params: Promise<{ sectionId: string }> };
export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("reports.edit");
    if (error || !user) return error;
    const body = reportSectionDuplicateBodySchema.parse(await req.json().catch(() => ({})));
    return NextResponse.json({ section: await duplicateReportSection(user.id, (await params).sectionId, body, traceId) }, { status: 201 });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
