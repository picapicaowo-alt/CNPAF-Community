import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { revokeDatasetShare } from "@/lib/modules/datasets";

type Context = { params: Promise<{ shareId: string }> };
export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("datasets.share");
    if (error || !user) return error;
    return NextResponse.json({ share: await revokeDatasetShare(user.id, (await params).shareId, traceId) });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
