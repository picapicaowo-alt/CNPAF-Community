import { NextResponse } from "next/server";
import { reportApprovalBodySchema } from "@cnpaf/shared";
import { approveReportArtifact, canReadReportArtifact } from "@/lib/reports";
import { jsonError, requirePermission } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("reports.publish");
  if (error || !user) return error;
  const parsed = reportApprovalBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { id } = await params;
  if (!(await canReadReportArtifact(user.id, id))) return jsonError("Forbidden", 403);
  try {
    return NextResponse.json({ report: await approveReportArtifact(id, user.id, parsed.data.decision, parsed.data.notes) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not approve report", 409);
  }
}
