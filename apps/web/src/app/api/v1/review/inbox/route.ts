import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import {
  getUnifiedReviewInbox,
  getUnifiedReviewRecords,
} from "@/lib/modules/unified-review";

export async function GET() {
  const { user, error } = await requirePermission("review.view");
  if (error || !user) return error;
  const [items, records] = await Promise.all([
    getUnifiedReviewInbox(user.id),
    getUnifiedReviewRecords(user.id),
  ]);
  return NextResponse.json({ items, records });
}
