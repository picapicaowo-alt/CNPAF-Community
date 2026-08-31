import { NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/http";
import { analyticsSummary } from "@/lib/analytics";

export async function GET(request: Request) {
  const { user, error } = await requireAnyPermission(["analytics.view", "insights.view"]);
  if (error || !user) return error;
  const includeSystemValidation =
    new URL(request.url).searchParams.get("includeSystemValidation") === "1";
  const data = await analyticsSummary(user.id, { includeSystemValidation });
  return NextResponse.json(data);
}
