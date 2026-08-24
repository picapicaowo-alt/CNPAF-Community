import { NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/http";
import { analyticsSummary } from "@/lib/analytics";

export async function GET() {
  const { user, error } = await requireAnyPermission(["analytics.view", "insights.view"]);
  if (error || !user) return error;
  const data = await analyticsSummary(user.id);
  return NextResponse.json(data);
}
