import { NextResponse } from "next/server";
import { exportJobBodySchema } from "@cnpaf/shared";
import { createExportJob, listExportJobs } from "@/lib/exports";
import { enqueueJob } from "@/lib/jobs";
import { jsonError, requirePermission } from "@/lib/http";

export async function GET() {
  const { user, error } = await requirePermission("exports.create");
  if (error || !user) return error;
  return NextResponse.json({ exportJobs: await listExportJobs(user.id) });
}

export async function POST(req: Request) {
  const { user, error } = await requirePermission("exports.create");
  if (error || !user) return error;
  const parsed = exportJobBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  if (parsed.data.dataClassification !== "approved_evidence") {
    const research = await requirePermission("exports.research", { dataClassification: parsed.data.dataClassification });
    if (research.error) return research.error;
  }
  const job = await createExportJob(parsed.data, user.id);
  await enqueueJob("generate_export", { exportJobId: job.id }, `export:${job.id}`);
  return NextResponse.json({ exportJob: job }, { status: 202 });
}
