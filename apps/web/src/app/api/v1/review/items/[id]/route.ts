import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse } from "@/lib/api-error";
import { getUnifiedReviewItem } from "@/lib/modules/unified-review";

type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, { params }: Context) {
  try {
    const { user, error } = await requirePermission("review.view");
    if (error || !user) return error;
    return NextResponse.json({ item: await getUnifiedReviewItem(user.id, (await params).id) });
  } catch (error) { return apiErrorResponse(error); }
}
