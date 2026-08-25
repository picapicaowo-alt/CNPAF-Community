import { NextResponse } from "next/server";
import { locationCreateBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { ApiError } from "@/lib/api-error";
import { createLocation, searchLocations } from "@/lib/modules/locations";

export async function GET(req: Request) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("locations.view");
    if (error || !user) return error;
    const params = new URL(req.url).searchParams;
    const rawLatitude = params.get("latitude");
    const rawLongitude = params.get("longitude");
    if ((rawLatitude == null) !== (rawLongitude == null)) throw new ApiError("BAD_REQUEST", "latitude and longitude must be provided together", 400);
    const coordinates = rawLatitude == null ? null : { latitude: Number(rawLatitude), longitude: Number(rawLongitude) };
    if (coordinates && (!Number.isFinite(coordinates.latitude) || coordinates.latitude < -90 || coordinates.latitude > 90 || !Number.isFinite(coordinates.longitude) || coordinates.longitude < -180 || coordinates.longitude > 180)) throw new ApiError("BAD_REQUEST", "Invalid coordinates", 400);
    return NextResponse.json({ locations: await searchLocations(user.id, params.get("q"), coordinates) });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
export async function POST(req: Request) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("locations.manage");
    if (error || !user) return error;
    return NextResponse.json(await createLocation(user.id, locationCreateBodySchema.parse(await req.json()), traceId), { status: 201 });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
