import { NextResponse } from "next/server";
import { reportSectionInputSchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { addReportSection } from "@/lib/modules/editable-reports";

type Context = { params: Promise<{ versionId: string }> };
export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("reports.edit");
    if (error || !user) return error;
    return NextResponse.json({ section: await addReportSection(user.id, (await params).versionId, reportSectionInputSchema.parse(await req.json()), traceId) }, { status: 201 });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
