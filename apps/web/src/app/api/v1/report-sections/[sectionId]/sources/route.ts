import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse } from "@/lib/api-error";
import { getReportSectionSources } from "@/lib/modules/editable-reports";

type Context = { params: Promise<{ sectionId: string }> };
export async function GET(_req: Request, { params }: Context) {
  try {
    const { user, error } = await requirePermission("reports.view");
    if (error || !user) return error;
    return NextResponse.json({ sources: await getReportSectionSources(user.id, (await params).sectionId) });
  } catch (error) { return apiErrorResponse(error); }
}
