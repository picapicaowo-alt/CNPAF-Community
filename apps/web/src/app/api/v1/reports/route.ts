import { NextResponse } from "next/server";
import { listReportsForUser } from "@/lib/reports";
import { requirePermission } from "@/lib/http";

export async function GET() {
  const { user, error } = await requirePermission("reports.view");
  if (error || !user) return error;
  return NextResponse.json({ reports: await listReportsForUser(user.id) });
}
