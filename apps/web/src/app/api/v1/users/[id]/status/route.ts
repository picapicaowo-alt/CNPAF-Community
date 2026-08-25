import { NextResponse } from "next/server";
import { jsonError, requirePermission } from "@/lib/http";
import { setAccountActive } from "@/lib/modules/accounts";
import { apiErrorResponse, requestId } from "@/lib/api-error";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(req);
  const body = (await req.json()) as { status?: string; reason?: string };
  if (!body.status || !["active", "inactive"].includes(body.status)) return jsonError("status must be active or inactive");
  const { user, error } = await requirePermission("users.deactivate");
  if (error || !user) return error;
  const { id } = await params;
  try {
    return NextResponse.json({ user: await setAccountActive(user.id, id, body.status === "active", traceId) });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
