import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { accessSharedDataset } from "@/lib/modules/datasets";

type Context = { params: Promise<{ token: string }> };
export async function GET(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("datasets.download");
    if (error || !user) return error;
    return NextResponse.json(await accessSharedDataset(user.id, (await params).token, traceId));
  } catch (error) { return apiErrorResponse(error, traceId); }
}
