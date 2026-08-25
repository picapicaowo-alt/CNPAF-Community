import { NextResponse } from "next/server";
import { datasetCreateBodySchema } from "@cnpaf/shared";
import { requireAnyPermission, requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { createDataset, listDatasets } from "@/lib/modules/datasets";

export async function GET() {
  const { user, error } = await requireAnyPermission(["datasets.download", "datasets.create"]);
  if (error || !user) return error;
  return NextResponse.json({ datasets: await listDatasets(user.id) });
}

export async function POST(req: Request) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("datasets.create");
    if (error || !user) return error;
    return NextResponse.json(await createDataset(user.id, datasetCreateBodySchema.parse(await req.json()), traceId), { status: 201 });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
