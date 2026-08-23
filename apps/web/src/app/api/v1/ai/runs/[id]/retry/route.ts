import { NextResponse } from "next/server";
import { aiRunResource, retryAiRun } from "@/lib/ai-review";
import { authorize } from "@/lib/authorization";
import { jsonError, requireUser } from "@/lib/http";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error || !user) return error;
  const { id } = await params;
  const source = await aiRunResource(id);
  if (!source) return jsonError("AI run not found", 404);
  const decision = await authorize({ userId: user.id, permission: "ai.retry_run", resource: { organizationId: source.record.organizationId, siteId: source.record.siteId, serviceKey: source.record.sourceKind } });
  if (!decision.allowed) return jsonError("Forbidden", 403);
  return NextResponse.json({ run: await retryAiRun(id, user.id) }, { status: 202 });
}
