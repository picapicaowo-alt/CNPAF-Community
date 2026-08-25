import { NextResponse } from "next/server";
import { reviewBodySchema } from "@cnpaf/shared";
import { eq } from "drizzle-orm";
import { records } from "@cnpaf/db/schema";
import { db } from "@/lib/db";
import { authorize } from "@/lib/authorization";
import { requireUser, jsonError } from "@/lib/http";
import { applyReview } from "@/lib/review";
import { apiErrorResponse, requestId } from "@/lib/api-error";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const traceId = requestId(req);
  const { user, error } = await requireUser();
  if (error || !user) return error;
  const { id } = await ctx.params;
  const record = (await db.select().from(records).where(eq(records.id, id)).limit(1))[0];
  if (!record) return jsonError("Record not found", 404);
  const decision = await authorize({ userId: user.id, permission: "records.review", resource: { organizationId: record.organizationId, programId: record.programId, siteId: record.siteId, serviceKey: record.sourceKind, researchUse: record.researchUseStatus } });
  if (!decision.allowed) return jsonError("Forbidden", 403);
  try {
    const result = await applyReview(user, id, reviewBodySchema.parse(await req.json()));
    return NextResponse.json(result);
  } catch (err) {
    return apiErrorResponse(err, traceId);
  }
}
