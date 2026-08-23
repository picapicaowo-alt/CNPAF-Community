import { NextResponse } from "next/server";
import { requireOps } from "@/lib/http";
import { analyticsSummary } from "@/lib/analytics";

export async function GET() {
  const { error } = await requireOps();
  if (error) return error;
  const data = await analyticsSummary();
  return NextResponse.json(data);
}
