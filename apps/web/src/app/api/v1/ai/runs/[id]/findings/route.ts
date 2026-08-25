import { NextResponse } from "next/server";
import { canViewAiRun } from "@/lib/ai-review";
import { jsonError, requireUser } from "@/lib/http";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await params;
  const bundle = await canViewAiRun(user!.id, id);
  if (!bundle) return jsonError("AI run not found", 404);
  return NextResponse.json({ findings: bundle?.findings ?? [], reviews: bundle?.reviews ?? [] });
}
