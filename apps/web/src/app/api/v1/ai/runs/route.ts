import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { listAiRuns } from "@/lib/ai-review";

export async function GET() {
  const { user, error } = await requirePermission("ai.view_runs");
  if (error || !user) return error;
  return NextResponse.json({ runs: await listAiRuns(user.id) });
}
