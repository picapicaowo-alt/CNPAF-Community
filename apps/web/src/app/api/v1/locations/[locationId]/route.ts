import { NextResponse } from "next/server";
import { locationUpdateBodySchema } from "@cnpaf/shared";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { requirePermission } from "@/lib/http";
import { getLocation, updateLocation } from "@/lib/modules/locations";

type Context = { params: Promise<{ locationId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { user, error } = await requirePermission("locations.view");
    if (error || !user) return error;
    return NextResponse.json(
      await getLocation(user.id, (await params).locationId),
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const traceId = requestId(request);
  try {
    const { user, error } = await requirePermission("locations.manage");
    if (error || !user) return error;
    const input = locationUpdateBodySchema.parse(await request.json());
    const location = await updateLocation(
      user.id,
      (await params).locationId,
      input,
      traceId,
    );
    return NextResponse.json({ location });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
