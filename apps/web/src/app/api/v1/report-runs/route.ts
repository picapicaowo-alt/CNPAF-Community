import { NextResponse } from "next/server";
import { reportRunBodySchema } from "@cnpaf/shared";
import { createReportRun } from "@/lib/reports";
import { enqueueJob } from "@/lib/jobs";
import { jsonError, requirePermission } from "@/lib/http";

export async function POST(req: Request) {
  const { user, error } = await requirePermission("reports.generate");
  if (error || !user) return error;
  const parsed = reportRunBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  try {
    const run = await createReportRun(parsed.data, user.id);
    await enqueueJob("generate_report", { reportRunId: run.id }, `report:${run.id}`);
    return NextResponse.json({ run }, { status: 202 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not create report run", 409);
  }
}
