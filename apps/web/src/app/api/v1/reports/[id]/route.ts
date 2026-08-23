import { NextResponse } from "next/server";
import { canReadReportArtifact, getReportArtifact } from "@/lib/reports";
import { jsonError, requirePermission } from "@/lib/http";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("reports.view");
  if (error || !user) return error;
  const bundle = await getReportArtifact((await params).id);
  if (!bundle) return jsonError("Report not found", 404);
  if (!(await canReadReportArtifact(user.id, bundle.artifact.id))) return jsonError("Forbidden", 403);
  return NextResponse.json(bundle);
}
