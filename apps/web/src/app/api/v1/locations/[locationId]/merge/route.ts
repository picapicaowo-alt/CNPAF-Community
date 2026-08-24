import { NextResponse } from "next/server";
import { locationMergeBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { mergeLocation } from "@/lib/modules/locations";

type Context = { params: Promise<{ locationId: string }> };
export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("locations.manage");
    if (error || !user) return error;
    return NextResponse.json({ merge: await mergeLocation(user.id, (await params).locationId, locationMergeBodySchema.parse(await req.json()), traceId) });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
