import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { restoreDataset } from "@/lib/modules/datasets";

type Context = { params: Promise<{ datasetId: string }> };

export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("datasets.archive");
    if (error || !user) return error;
    return NextResponse.json({
      dataset: await restoreDataset(user.id, (await params).datasetId, traceId),
    });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
