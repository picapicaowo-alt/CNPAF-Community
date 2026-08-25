import { NextResponse } from "next/server";
import { getExportJob } from "@/lib/exports";
import { jsonError, requirePermission } from "@/lib/http";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("exports.create");
  if (error || !user) return error;
  const job = await getExportJob((await params).id, user.id);
  return job ? NextResponse.json({ exportJob: job }) : jsonError("Export job not found", 404);
}
