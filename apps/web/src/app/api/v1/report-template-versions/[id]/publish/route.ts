import { NextResponse } from "next/server";
import { publishReportTemplateVersion } from "@/lib/reports";
import { jsonError, requirePermission } from "@/lib/http";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("reports.publish");
  if (error || !user) return error;
  try {
    return NextResponse.json({ version: await publishReportTemplateVersion((await params).id, user.id) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not publish report template version", 409);
  }
}
