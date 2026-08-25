import { NextResponse } from "next/server";
import { recordShareBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { shareRecord } from "@/lib/modules/datasets";

type Context = { params: Promise<{ id: string }> };
export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("records.share");
    if (error || !user) return error;
    return NextResponse.json(await shareRecord(user.id, (await params).id, recordShareBodySchema.parse(await req.json()), traceId), { status: 201 });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
