import { NextResponse } from "next/server";
import { datasetRefreshBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { refreshDataset } from "@/lib/modules/datasets";

type Context = { params: Promise<{ datasetId: string }> };
export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("datasets.refresh");
    if (error || !user) return error;
    return NextResponse.json({ version: await refreshDataset(user.id, (await params).datasetId, datasetRefreshBodySchema.parse(await req.json()), traceId) }, { status: 201 });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
