import { after, NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { removeUserAffiliation } from "@/lib/modules/accounts";
import { processNotificationEmailJobs } from "@/lib/jobs";

type Context = { params: Promise<{ userId: string; affiliationId: string }> };
export async function DELETE(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("people.edit_affiliation");
    if (error || !user) return error;
    const { userId, affiliationId } = await params;
    const affiliation = await removeUserAffiliation(user.id, userId, affiliationId, traceId);
    after(() => processNotificationEmailJobs());
    return NextResponse.json({ affiliation });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
