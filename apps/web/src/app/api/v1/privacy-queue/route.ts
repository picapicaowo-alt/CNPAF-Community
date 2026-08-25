import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { listPrivacyQueue } from "@/lib/privacy-review";

export async function GET() {
  const { user, error } = await requirePermission("privacy.view");
  if (error || !user) return error;
  return NextResponse.json({ flags: await listPrivacyQueue(user.id) });
}
