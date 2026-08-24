import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse } from "@/lib/api-error";
import { getDataset } from "@/lib/modules/datasets";

type Context = { params: Promise<{ datasetId: string }> };
export async function GET(_req: Request, { params }: Context) {
  try {
    const { user, error } = await requirePermission("datasets.download");
    if (error || !user) return error;
    return NextResponse.json(await getDataset(user.id, (await params).datasetId));
  } catch (error) { return apiErrorResponse(error); }
}
