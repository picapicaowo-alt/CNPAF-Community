import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { listSafetyQueue } from "@/lib/safety-review";

export async function GET() {
  const { user, error } = await requirePermission("safety.view");
  if (error || !user) return error;
  return NextResponse.json({ flags: await listSafetyQueue(user.id) });
}
