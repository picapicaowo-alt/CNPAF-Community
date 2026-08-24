import { NextResponse } from "next/server";
import { locationAliasBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { addLocationAlias } from "@/lib/modules/locations";

type Context = { params: Promise<{ locationId: string }> };
export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("locations.manage");
    if (error || !user) return error;
    return NextResponse.json({ alias: await addLocationAlias(user.id, (await params).locationId, locationAliasBodySchema.parse(await req.json()), traceId) }, { status: 201 });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
