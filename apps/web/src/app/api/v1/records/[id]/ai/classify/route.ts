import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { records, recordVersions } from "@cnpaf/db/schema";
import { db } from "@/lib/db";
import { authorize } from "@/lib/authorization";
import { jsonError, requireUser } from "@/lib/http";
import { queueClassification } from "@/lib/ai-review";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const recordVersionId = (await params).id;
  const row = (await db.select({ version: recordVersions, record: records }).from(recordVersions).innerJoin(records, eq(recordVersions.recordId, records.id)).where(eq(recordVersions.id, recordVersionId)).limit(1))[0];
  if (!row) return jsonError("Record version not found", 404);
  const decision = await authorize({ userId: user.id, permission: "ai.request_reclassification", resource: { organizationId: row.record.organizationId, programId: row.record.programId, siteId: row.record.siteId, serviceKey: row.record.sourceKind, ownerUserId: row.record.createdById } });
  if (!decision.allowed) return jsonError("Forbidden", 403);
  const body = (await req.json().catch(() => ({}))) as { idempotencyKey?: string; workflowVersionId?: string };
  const run = await queueClassification({ recordVersionId, actorId: user.id, workflowVersionId: body.workflowVersionId, idempotencyKey: body.idempotencyKey ?? `manual:${recordVersionId}:${crypto.randomUUID()}` });
  return NextResponse.json({ run }, { status: 202 });
}
