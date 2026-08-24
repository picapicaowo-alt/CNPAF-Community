import { NextResponse } from "next/server";
import { unifiedReviewDecisionBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { decideUnifiedReviewItem } from "@/lib/modules/unified-review";

type Context = { params: Promise<{ id: string }> };
export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("review.decide");
    if (error || !user) return error;
    return NextResponse.json(await decideUnifiedReviewItem(user, (await params).id, unifiedReviewDecisionBodySchema.parse(await req.json())));
  } catch (error) { return apiErrorResponse(error, traceId); }
}
