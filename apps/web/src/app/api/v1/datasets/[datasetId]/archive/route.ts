import { NextResponse } from "next/server";
import { datasetArchiveBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { archiveDataset } from "@/lib/modules/datasets";

type Context = { params: Promise<{ datasetId: string }> };

export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("datasets.archive");
    if (error || !user) return error;
    const input = datasetArchiveBodySchema.parse(await req.json());
    return NextResponse.json(await archiveDataset(user.id, (await params).datasetId, input, traceId));
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
