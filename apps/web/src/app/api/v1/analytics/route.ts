import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { analyticsSummary } from "@/lib/analytics";

export async function GET() {
  const { user, error } = await requirePermission("analytics.view");
  if (error || !user) return error;
  const data = await analyticsSummary(user.id);
  return NextResponse.json(data);
}
