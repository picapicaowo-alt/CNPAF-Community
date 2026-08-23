import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { aiFindingReviewBodySchema } from "@cnpaf/shared";
import { aiFindings } from "@cnpaf/db/schema";
import { db } from "@/lib/db";
import { aiRunResource, reviewAiFinding } from "@/lib/ai-review";
import { authorize } from "@/lib/authorization";
import { jsonError, requireUser } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error || !user) return error;
  const parsed = aiFindingReviewBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { id } = await params;
  const finding = (await db.select().from(aiFindings).where(eq(aiFindings.id, id)).limit(1))[0];
  const resource = finding ? await aiRunResource(finding.aiRunId) : null;
  if (!resource) return jsonError("AI finding not found", 404);
  const decision = await authorize({ userId: user.id, permission: "ai.review_findings", resource: { organizationId: resource.record.organizationId, siteId: resource.record.siteId, serviceKey: resource.record.sourceKind } });
  if (!decision.allowed) return jsonError("Forbidden", 403);
  return NextResponse.json(await reviewAiFinding(id, user.id, parsed.data), { status: 201 });
}
