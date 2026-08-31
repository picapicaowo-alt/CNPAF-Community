import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  aiFindings,
  aiRuns,
  approvedFindings,
  annotations,
  auditEvents,
  concerns,
  findingReviews,
  notifications,
  recordFieldAnswers,
  records,
  recordVersions,
  reviewDecisions,
  themeMappings,
} from "@cnpaf/db/schema";
import type { ReviewBody } from "@cnpaf/shared";
import { db } from "./db";
import { audit } from "./audit";
import { ApiError } from "./api-error";
import type { SessionUser } from "./session";
import { evaluateAuthorization, getAccessContext } from "./authorization";
import { loadSourceKindPolicy } from "./source-kind";

export async function applyReview(user: SessionUser, recordId: string, body: ReviewBody) {
  const initialRecord = (await db.select().from(records).where(eq(records.id, recordId)).limit(1))[0];
  if (!initialRecord?.headVersionId) throw new ApiError("NOT_FOUND", "Record not found", 404);
  const access = await getAccessContext(user.id);
  const recordResource = {
    organizationId: initialRecord.organizationId,
    programId: initialRecord.programId,
    siteId: initialRecord.siteId,
    serviceKey: initialRecord.sourceKind,
    researchUse: initialRecord.researchUseStatus,
  };
  if (!evaluateAuthorization(access, "records.review", recordResource).allowed)
    throw new ApiError("FORBIDDEN", "Record is outside the assigned review scope", 403);
  const sourcePolicy = await loadSourceKindPolicy(initialRecord.sourceKind);
  if (
    body.findings.length &&
    !evaluateAuthorization(access, "ai.review_findings", recordResource).allowed &&
    !evaluateAuthorization(access, "findings.review", recordResource).allowed
  ) {
    throw new ApiError(
      "FORBIDDEN",
      "AI findings are outside the assigned review scope",
      403,
    );
  }

  return db.transaction(async (tx) => {
    // Serialize decisions for one record so two reviewers cannot both approve
    // the same pending version and create duplicate approved findings.
    await tx.execute(sql`select id from records where id = ${recordId} for update`);
    const record = (await tx.select().from(records).where(eq(records.id, recordId)).limit(1))[0];
    if (!record?.headVersionId) throw new ApiError("NOT_FOUND", "Record not found", 404);
    if (record.sourceKind !== initialRecord.sourceKind || record.headVersionId !== initialRecord.headVersionId) {
      throw new ApiError("CONFLICT", "Record changed while the review was being prepared", 409);
    }
    if (record.reviewStatus !== "pending") {
      throw new ApiError("INVALID_TRANSITION", "Only a pending record can be reviewed", 409);
    }
    const version = (await tx.select().from(recordVersions).where(eq(recordVersions.id, record.headVersionId)).limit(1))[0];
    if (!version) throw new ApiError("NOT_FOUND", "Record version not found", 404);
    if (body.correctionFieldIds.length) {
      const correctionFields = await tx.select({ id: recordFieldAnswers.templateFieldId })
        .from(recordFieldAnswers)
        .where(eq(recordFieldAnswers.recordVersionId, version.id));
      const availableIds = new Set(correctionFields.map((field) => field.id));
      const invalidIds = body.correctionFieldIds.filter((id) => !availableIds.has(id));
      if (invalidIds.length)
        throw new ApiError("BAD_REQUEST", "Correction fields do not belong to the reviewed record version", 400, { invalidIds });
    }

    const [decision] = await tx.insert(reviewDecisions).values({
      recordId,
      recordVersionId: version.id,
      reviewerId: user.id,
      action: body.action,
      annotation: body.annotation ?? null,
      correctionFieldIds: body.correctionFieldIds,
      findingDecisions: body.findings,
    }).returning();

    if (body.annotation) {
      await tx.insert(annotations).values({
        recordId,
        recordVersionId: version.id,
        authorId: user.id,
        body: body.annotation,
        visibleToVolunteer: true,
      });
    }

    const writeAudit = (values: typeof auditEvents.$inferInsert) => tx.insert(auditEvents).values(values);
    if (body.action === "needs_completion") {
      await tx.update(records).set({ reviewStatus: "needs_completion", recordStatus: "draft", updatedAt: new Date() }).where(eq(records.id, recordId));
      await tx.insert(notifications).values({
        userId: record.createdById,
        kindKey: "record_needs_completion",
        title: "Submission needs an update",
        body: body.annotation!.trim(),
        entityType: "record",
        entityId: record.id,
        metadata: { taskId: record.taskId, recordVersionId: version.id },
      });
      await audit({ actorId: user.id, action: "reject", entityType: "record", entityId: recordId, metadata: { decisionId: decision.id } }, writeAudit);
      return { decision };
    }

    const run = (await tx
      .select()
      .from(aiRuns)
      .where(
        and(
          eq(aiRuns.recordVersionId, version.id),
          eq(aiRuns.status, "succeeded"),
        ),
      )
      .orderBy(desc(aiRuns.createdAt))
      .limit(1))[0];
    const findings = run ? await tx.select().from(aiFindings).where(eq(aiFindings.aiRunId, run.id)) : [];
    const findingById = new Map(findings.map((finding) => [finding.id, finding]));
    const unknownFindingIds = body.findings.filter((item) => !findingById.has(item.findingId)).map((item) => item.findingId);
    if (unknownFindingIds.length) {
      throw new ApiError("BAD_REQUEST", "One or more findings do not belong to the latest analysis run", 400, { findingIds: unknownFindingIds });
    }

    for (const item of body.findings) {
      await tx.execute(
        sql`select id from ai_findings where id = ${item.findingId} for update`,
      );
    }
    const existingFindingReviews = body.findings.length
      ? await tx
          .select({ findingId: findingReviews.aiFindingId })
          .from(findingReviews)
          .where(
            inArray(
              findingReviews.aiFindingId,
              body.findings.map((item) => item.findingId),
            ),
          )
      : [];
    if (existingFindingReviews.length) {
      throw new ApiError(
        "CONFLICT",
        "One or more AI suggestions have already been reviewed",
        409,
        { findingIds: existingFindingReviews.map((row) => row.findingId) },
      );
    }

    for (const item of body.findings) {
      const finding = findingById.get(item.findingId)!;
      const [findingReview] = await tx.insert(findingReviews).values({
        aiFindingId: finding.id,
        reviewerId: user.id,
        decision: item.decision === "reject" ? "dismiss" : item.decision,
        editedStatement: item.editedStatement,
        reviewerNotes: body.annotation,
      }).returning();
      if (item.decision === "reject") continue;

      const statement = item.decision === "edit" && item.editedStatement ? item.editedStatement : finding.statement;
      const themeId = item.canonicalThemeId ?? finding.suggestedCanonicalThemeId;
      const origin = item.origin ?? finding.origin ?? sourcePolicy.defaultConcernOriginKey;
      await tx.insert(approvedFindings).values({
        aiFindingId: finding.id,
        findingReviewId: findingReview.id,
        recordVersionId: version.id,
        findingType: finding.kind,
        approvedValue: { statement, canonicalThemeId: themeId, origin, confidence: finding.confidence },
        evidence: finding.evidence,
        approvedById: user.id,
      });
      if (finding.kind === "theme" && finding.suggestedRawLabel && themeId) {
        await tx.insert(themeMappings).values({
          rawLabel: finding.suggestedRawLabel,
          canonicalThemeId: themeId,
          confidence: finding.confidence,
          approvedById: user.id,
          reviewDecisionId: decision.id,
          status: "approved",
        });
      }
      if (finding.kind === "concern") {
        await tx.insert(concerns).values({
          recordId,
          recordVersionId: version.id,
          aiFindingId: finding.id,
          statement,
          canonicalThemeId: themeId,
          origin,
          evidence: finding.evidence,
          reviewStatus: "approved",
          aiConfidence: finding.confidence,
        });
      }
    }

    await tx.update(records).set({
      reviewStatus: "approved",
      ...(body.researchUseStatus ? { researchUseStatus: body.researchUseStatus } : {}),
      updatedAt: new Date(),
    }).where(eq(records.id, recordId));
    await tx.insert(notifications).values({
      userId: record.createdById,
      kindKey: "record_approved",
      title: "Submission approved",
      body: body.annotation?.trim() || "Your submission passed human review.",
      entityType: "record",
      entityId: record.id,
      metadata: { taskId: record.taskId, recordVersionId: version.id },
    });
    await audit({ actorId: user.id, action: "approve", entityType: "record", entityId: recordId, metadata: { decisionId: decision.id } }, writeAudit);
    return { decision };
  });
}

export async function reviewQueue(userId: string) {
  const rows = await db
    .select()
    .from(records)
    .where(eq(records.reviewStatus, "pending"))
    .orderBy(desc(records.updatedAt));
  const access = await getAccessContext(userId);
  return rows.filter((record) => evaluateAuthorization(access, "records.review", {
    organizationId: record.organizationId,
    programId: record.programId,
    siteId: record.siteId,
    serviceKey: record.sourceKind,
    researchUse: record.researchUseStatus,
  }).allowed);
}
