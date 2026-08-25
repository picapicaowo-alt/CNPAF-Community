import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { reviewQueue } from "@/lib/review";

export async function GET() {
  const { user, error } = await requirePermission("records.review");
  if (error || !user) return error;
  return NextResponse.json({ records: await reviewQueue(user.id) });
}
