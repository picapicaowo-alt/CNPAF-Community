import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { publishReportVersion } from "@/lib/modules/editable-reports";

type Context = { params: Promise<{ versionId: string }> };
export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("reports.publish");
    if (error || !user) return error;
    return NextResponse.json({ version: await publishReportVersion(user.id, (await params).versionId, traceId) });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
