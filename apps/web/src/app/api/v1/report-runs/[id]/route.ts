import { NextResponse } from "next/server";
import { canReadReportRun, getReportRunBundle } from "@/lib/reports";
import { jsonError, requirePermission } from "@/lib/http";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("reports.view");
  if (error || !user) return error;
  const bundle = await getReportRunBundle((await params).id);
  if (!bundle) return jsonError("Report run not found", 404);
  if (!(await canReadReportRun(user.id, bundle.run.id))) return jsonError("Forbidden", 403);
  return NextResponse.json(bundle);
}
