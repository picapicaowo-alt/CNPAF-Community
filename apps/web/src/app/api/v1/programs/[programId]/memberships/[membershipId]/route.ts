import { after, NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { removeProgramMembership } from "@/lib/modules/programs";
import { processNotificationEmailJobs } from "@/lib/jobs";

type Context = { params: Promise<{ programId: string; membershipId: string }> };

export async function DELETE(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("programs.manage_membership");
    if (error || !user) return error;
    const { programId, membershipId } = await params;
    const membership = await removeProgramMembership(user.id, programId, membershipId, traceId);
    after(() => processNotificationEmailJobs());
    return NextResponse.json({ membership });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
