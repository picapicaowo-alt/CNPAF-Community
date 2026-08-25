import { desc, eq, inArray, sql } from "drizzle-orm";
import {
  aiFindings,
  aiRuns,
  approvedFindings,
  auditEvents,
  findingReviews,
  jobs,
  records,
  recordVersions,
} from "@cnpaf/db/schema";
import type { z } from "zod";
import type { aiFindingReviewBodySchema } from "@cnpaf/shared";
import { db } from "./db";
import { audit } from "./audit";
import { assertPreparedAiRun, createQueuedAiRun, prepareQueuedAiRun } from "./ai";
import { enqueueAnalyze } from "./jobs";
import { evaluateAuthorization, getAccessContext } from "./authorization";
import { ApiError } from "./api-error";

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
    programId: record.programId,
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
    programId: bundle.record.programId,
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
  await db
    .update(records)
    .set({ aiStatus: "queued", updatedAt: new Date() })
    .where(eq(records.headVersionId, input.recordVersionId));
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
    .select({ finding: aiFindings, run: aiRuns, record: records })
    .from(aiFindings)
    .innerJoin(aiRuns, eq(aiFindings.aiRunId, aiRuns.id))
    .innerJoin(recordVersions, eq(aiRuns.recordVersionId, recordVersions.id))
    .innerJoin(records, eq(recordVersions.recordId, records.id))
    .where(eq(aiFindings.id, findingId))
    .limit(1))[0];
  if (!row || !row.run.recordVersionId) throw new ApiError("NOT_FOUND", "AI finding not found", 404);
  const access = await getAccessContext(actorId);
  const findingResource = {
    organizationId: row.record.organizationId,
    programId: row.record.programId,
    siteId: row.record.siteId,
    serviceKey: row.record.sourceKind,
    researchUse: row.record.researchUseStatus,
  };
  const mayReview = evaluateAuthorization(access, "ai.review_findings", findingResource).allowed
    || evaluateAuthorization(access, "findings.review", findingResource).allowed;
  if (!mayReview) throw new ApiError("FORBIDDEN", "AI finding is outside the assigned review scope", 403);
  if (input.decision === "re_run_requested"
    && !evaluateAuthorization(access, "ai.request_reclassification", findingResource).allowed) {
    throw new ApiError("FORBIDDEN", "Reclassification permission is required", 403);
  }
  const preparedReanalysis = input.decision === "re_run_requested" ? await prepareQueuedAiRun({
    recordVersionId: row.run.recordVersionId,
    parentAiRunId: row.run.id,
    reviewerInstruction: input.reviewerNotes!.trim(),
    workflowVersionId: row.run.workflowVersionId,
    createdByUserId: actorId,
    idempotencyKey: `finding-re-run:${findingId}`,
  }) : null;
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from ai_findings where id = ${findingId} for update`);
    const existing = (await tx.select({ id: findingReviews.id }).from(findingReviews)
      .where(eq(findingReviews.aiFindingId, findingId)).limit(1))[0];
    if (existing) throw new ApiError("CONFLICT", "AI finding has already been reviewed", 409);
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
    let reanalysisRun = null as typeof aiRuns.$inferSelect | null;
    if (preparedReanalysis) {
      reanalysisRun = preparedReanalysis.existingRun;
      if (!reanalysisRun) {
        [reanalysisRun] = await tx.insert(aiRuns).values(preparedReanalysis.values)
          .onConflictDoNothing({ target: aiRuns.idempotencyKey }).returning();
        reanalysisRun ??= (await tx.select().from(aiRuns)
          .where(eq(aiRuns.idempotencyKey, preparedReanalysis.input.idempotencyKey)).limit(1))[0];
      }
      if (!reanalysisRun) throw new ApiError("INTERNAL_ERROR", "Could not create AI reanalysis run", 500);
      assertPreparedAiRun(reanalysisRun, preparedReanalysis);
      await tx.insert(jobs).values({
        kind: "analyze_record_version",
        recordVersionId: row.run.recordVersionId,
        status: "queued",
        idempotencyKey: `ai-run:${reanalysisRun.id}`,
        payload: { aiRunId: reanalysisRun.id },
      }).onConflictDoNothing({ target: jobs.idempotencyKey });
      await audit({
        actorId,
        action: "ai_run.queued",
        entityType: "ai_run",
        entityId: reanalysisRun.id,
        afterState: reanalysisRun,
      }, (values) => tx.insert(auditEvents).values(values));
    }
    await audit({
      actorId,
      action: `ai_finding.${input.decision}`,
      entityType: "ai_finding",
      entityId: findingId,
      afterState: { review, approved, reanalysisRun },
      reason: input.reviewerNotes ?? null,
    }, (values) => tx.insert(auditEvents).values(values));
    return { review, approved, reanalysisRun };
  });
  return result;
}
