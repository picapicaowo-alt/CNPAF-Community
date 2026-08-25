import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { getUnifiedReviewInbox } from "@/lib/modules/unified-review";

export async function GET() {
  const { user, error } = await requirePermission("review.view");
  if (error || !user) return error;
  return NextResponse.json({ items: await getUnifiedReviewInbox(user.id) });
}
