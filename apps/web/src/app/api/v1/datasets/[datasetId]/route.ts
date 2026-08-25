import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { deleteArchivedDataset, getDataset } from "@/lib/modules/datasets";

type Context = { params: Promise<{ datasetId: string }> };
export async function GET(req: Request, { params }: Context) {
  try {
    const { user, error } = await requirePermission("datasets.download");
    if (error || !user) return error;
    const versionId = new URL(req.url).searchParams.get("versionId");
    return NextResponse.json(await getDataset(user.id, (await params).datasetId, versionId));
  } catch (error) { return apiErrorResponse(error); }
}

export async function DELETE(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("datasets.archive");
    if (error || !user) return error;
    const deleted = await deleteArchivedDataset(user.id, (await params).datasetId, traceId);
    return NextResponse.json({ deleted });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
