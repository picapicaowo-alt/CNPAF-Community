import { NextResponse } from "next/server";
import { reportSectionReorderBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { updateReportSection } from "@/lib/modules/editable-reports";

type Context = { params: Promise<{ sectionId: string }> };
export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("reports.edit");
    if (error || !user) return error;
    return NextResponse.json({ section: await updateReportSection(user.id, (await params).sectionId, reportSectionReorderBodySchema.parse(await req.json()), traceId) });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
