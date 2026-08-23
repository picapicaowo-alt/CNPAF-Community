import { desc, eq, inArray } from "drizzle-orm";
import {
  aiFindings,
  aiRuns,
  approvedFindings,
  findingReviews,
  records,
  recordVersions,
} from "@cnpaf/db/schema";
import type { z } from "zod";
import type { aiFindingReviewBodySchema } from "@cnpaf/shared";
import { db } from "./db";
import { audit } from "./audit";
import { createQueuedAiRun } from "./ai";
import { enqueueAnalyze } from "./jobs";
import { evaluateAuthorization, getAccessContext } from "./authorization";

type FindingReviewInput = z.infer<typeof aiFindingReviewBodySchema>;

export async function aiRunResource(runId: string) {
  return (await db
    .select({ run: aiRuns, version: recordVersions, record: records })
    .from(aiRuns)
    .innerJoin(recordVersions, eq(aiRuns.recordVersionId, recordVersions.id))
    .innerJoin(records, eq(recordVersions.recordId, records.id))
    .where(eq(aiRuns.id, runId))
    .limit(1))[0] ?? null;
}

export async function listAiRuns(userId: string) {
  const rows = await db
    .select({ run: aiRuns, version: recordVersions, record: records })
    .from(aiRuns)
    .leftJoin(recordVersions, eq(aiRuns.recordVersionId, recordVersions.id))
    .leftJoin(records, eq(recordVersions.recordId, records.id))
    .orderBy(desc(aiRuns.createdAt))
    .limit(200);
  const access = await getAccessContext(userId);
  const canManageAll = evaluateAuthorization(access, "settings.manage").allowed;
  return rows.filter(({ run, record }) => record ? evaluateAuthorization(access, "ai.view_runs", {
    organizationId: record.organizationId,
    siteId: record.siteId,
    serviceKey: record.sourceKind,
    researchUse: record.researchUseStatus,
  }).allowed : canManageAll || run.createdByUserId === userId);
}

export async function getAiRunBundle(runId: string) {
  const run = (await db.select().from(aiRuns).where(eq(aiRuns.id, runId)).limit(1))[0];
  if (!run) return null;
  const resource = run.recordVersionId ? await aiRunResource(runId) : null;
  const findings = await db.select().from(aiFindings).where(eq(aiFindings.aiRunId, runId));
  const reviews = findings.length ? await db
    .select({ review: findingReviews, approved: approvedFindings })
    .from(findingReviews)
    .leftJoin(approvedFindings, eq(approvedFindings.findingReviewId, findingReviews.id))
    .where(inArray(findingReviews.aiFindingId, findings.map((finding) => finding.id))) : [];
  return { run, version: resource?.version ?? null, record: resource?.record ?? null, findings, reviews };
}

export async function canViewAiRun(userId: string, runId: string) {
  const bundle = await getAiRunBundle(runId);
  if (!bundle) return null;
  const access = await getAccessContext(userId);
  const allowed = bundle.record ? evaluateAuthorization(access, "ai.view_runs", {
    organizationId: bundle.record.organizationId,
    siteId: bundle.record.siteId,
    serviceKey: bundle.record.sourceKind,
    researchUse: bundle.record.researchUseStatus,
  }).allowed : evaluateAuthorization(access, "settings.manage").allowed || bundle.run.createdByUserId === userId;
  return allowed ? bundle : null;
}

export async function queueClassification(input: {
  recordVersionId: string;
  actorId: string;
  idempotencyKey: string;
  parentAiRunId?: string | null;
  reviewerInstruction?: string | null;
  workflowVersionId?: string | null;
}) {
  const run = await createQueuedAiRun({
    recordVersionId: input.recordVersionId,
    idempotencyKey: input.idempotencyKey,
    parentAiRunId: input.parentAiRunId,
    reviewerInstruction: input.reviewerInstruction,
    workflowVersionId: input.workflowVersionId,
    createdByUserId: input.actorId,
  });
  if (!run) throw new Error("Could not create AI run");
  await enqueueAnalyze(input.recordVersionId, `ai-run:${run.id}`, run.id);
  await audit({ actorId: input.actorId, action: "ai_run.queued", entityType: "ai_run", entityId: run.id, afterState: run });
  return run;
}

export async function retryAiRun(runId: string, actorId: string) {
  const source = await aiRunResource(runId);
  if (!source?.run.recordVersionId) throw new Error("AI run not found");
  return queueClassification({
    recordVersionId: source.run.recordVersionId,
    actorId,
    parentAiRunId: runId,
    reviewerInstruction: source.run.reviewerInstruction,
    workflowVersionId: source.run.workflowVersionId,
    idempotencyKey: `retry:${runId}:${crypto.randomUUID()}`,
  });
}

export async function reviewAiFinding(findingId: string, actorId: string, input: FindingReviewInput) {
  const row = (await db
    .select({ finding: aiFindings, run: aiRuns })
    .from(aiFindings)
    .innerJoin(aiRuns, eq(aiFindings.aiRunId, aiRuns.id))
    .where(eq(aiFindings.id, findingId))
    .limit(1))[0];
  if (!row) throw new Error("AI finding not found");
  const result = await db.transaction(async (tx) => {
    const [review] = await tx.insert(findingReviews).values({
      aiFindingId: findingId,
      reviewerId: actorId,
      decision: input.decision,
      editedStatement: input.editedStatement,
      canonicalRegistryItemId: input.canonicalRegistryItemId,
      reviewerNotes: input.reviewerNotes,
    }).returning();
    let approved = null;
    if (input.decision === "approve" || input.decision === "edit") {
      [approved] = await tx.insert(approvedFindings).values({
        aiFindingId: findingId,
        findingReviewId: review.id,
        recordVersionId: row.run.recordVersionId,
        findingType: row.finding.kind,
        approvedValue: {
          statement: input.editedStatement ?? row.finding.statement,
          origin: row.finding.origin,
          confidence: row.finding.confidence,
        },
        evidence: row.finding.evidence,
        canonicalRegistryItemId: input.canonicalRegistryItemId,
        approvedById: actorId,
      }).returning();
    }
    return { review, approved };
  });
  await audit({ actorId, action: `ai_finding.${input.decision}`, entityType: "ai_finding", entityId: findingId, afterState: result, reason: input.reviewerNotes ?? null });
  return result;
}
