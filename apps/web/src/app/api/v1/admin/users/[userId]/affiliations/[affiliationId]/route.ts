import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { removeUserAffiliation } from "@/lib/modules/accounts";

type Context = { params: Promise<{ userId: string; affiliationId: string }> };
export async function DELETE(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("people.edit_affiliation");
    if (error || !user) return error;
    const { userId, affiliationId } = await params;
    return NextResponse.json({ affiliation: await removeUserAffiliation(user.id, userId, affiliationId, traceId) });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
