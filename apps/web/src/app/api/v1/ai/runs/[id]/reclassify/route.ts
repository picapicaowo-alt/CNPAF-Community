import { NextResponse } from "next/server";
import { aiReclassifyBodySchema } from "@cnpaf/shared";
import { aiRunResource, queueClassification } from "@/lib/ai-review";
import { authorize } from "@/lib/authorization";
import { jsonError, requireUser } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error || !user) return error;
  const parsed = aiReclassifyBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { id } = await params;
  const source = await aiRunResource(id);
  if (!source?.run.recordVersionId) return jsonError("AI run not found", 404);
  const decision = await authorize({ userId: user.id, permission: "ai.request_reclassification", resource: { organizationId: source.record.organizationId, programId: source.record.programId, siteId: source.record.siteId, serviceKey: source.record.sourceKind } });
  if (!decision.allowed) return jsonError("Forbidden", 403);
  const run = await queueClassification({ recordVersionId: source.run.recordVersionId, actorId: user.id, parentAiRunId: id, reviewerInstruction: parsed.data.reviewerInstruction, workflowVersionId: parsed.data.workflowVersionId, idempotencyKey: parsed.data.idempotencyKey });
  return NextResponse.json({ run }, { status: 202 });
}
