import { NextResponse } from "next/server";
import { editableReportVersionBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { createReportVersion } from "@/lib/modules/editable-reports";

type Context = { params: Promise<{ id: string }> };
export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("reports.edit");
    if (error || !user) return error;
    return NextResponse.json(await createReportVersion(user.id, (await params).id, editableReportVersionBodySchema.parse(await req.json()), traceId), { status: 201 });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
