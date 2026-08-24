import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  aiFindings,
  aiRuns,
  findingReviews,
  privacyFlags,
  recordCustomEntries,
  records,
  recordVersions,
  safetyFlags,
} from "@cnpaf/db/schema";
import type { z } from "zod";
import type { unifiedReviewDecisionBodySchema } from "@cnpaf/shared";
import { db } from "../db";
import { ApiError } from "../api-error";
import { evaluateAuthorization, getAccessContext } from "../authorization";
import { applyReview } from "../review";
import { resolvePrivacyFlag } from "../privacy-review";
import { resolveSafetyFlag } from "../safety-review";
import { reviewAiFinding } from "../ai-review";
import { reviewCustomEntry } from "../custom-entries";
import type { SessionUser } from "../session";

type UnifiedDecision = z.infer<typeof unifiedReviewDecisionBodySchema>;

function resource(record: typeof records.$inferSelect) {
  return { organizationId: record.organizationId, programId: record.programId, siteId: record.siteId, serviceKey: record.sourceKind, researchUse: record.researchUseStatus };
}

export async function getUnifiedReviewInbox(userId: string) {
  const [access, recordRows, privacyRows, safetyRows, customRows, findingRows] = await Promise.all([
    getAccessContext(userId),
    db.select().from(records).where(and(eq(records.reviewStatus, "pending"), inArray(records.privacyStatus, ["clear", "redacted"]))).orderBy(desc(records.updatedAt)).limit(500),
    db.select({ flag: privacyFlags, record: records }).from(privacyFlags).innerJoin(records, eq(privacyFlags.recordId, records.id)).where(eq(privacyFlags.status, "open")).orderBy(desc(privacyFlags.createdAt)).limit(500),
    db.select({ flag: safetyFlags, record: records }).from(safetyFlags).innerJoin(records, eq(safetyFlags.recordId, records.id)).where(eq(safetyFlags.status, "open")).orderBy(desc(safetyFlags.createdAt)).limit(500),
    db.select({ entry: recordCustomEntries, record: records }).from(recordCustomEntries).innerJoin(recordVersions, eq(recordCustomEntries.recordVersionId, recordVersions.id)).innerJoin(records, eq(recordVersions.recordId, records.id)).where(eq(recordCustomEntries.mappingStatus, "pending")).orderBy(desc(recordCustomEntries.createdAt)).limit(500),
    db.select({ finding: aiFindings, record: records }).from(aiFindings).innerJoin(aiRuns, eq(aiFindings.aiRunId, aiRuns.id)).innerJoin(recordVersions, eq(aiRuns.recordVersionId, recordVersions.id)).innerJoin(records, eq(recordVersions.recordId, records.id)).leftJoin(findingReviews, eq(findingReviews.aiFindingId, aiFindings.id)).where(isNull(findingReviews.id)).orderBy(desc(aiFindings.createdAt)).limit(500),
  ]);
  const can = (permission: string, record: typeof records.$inferSelect) =>
    evaluateAuthorization(access, "review.view", resource(record)).allowed
    && evaluateAuthorization(access, permission, resource(record)).allowed;
  const canReviewFinding = (record: typeof records.$inferSelect) => can("ai.review_findings", record)
    || can("findings.review", record);
  const items = [
    ...recordRows.filter((record) => can("records.review", record)).map((record) => ({ id: record.id, itemType: "record" as const, recordId: record.id, status: record.reviewStatus, priority: 20, summary: `${record.sourceKind} record`, createdAt: record.updatedAt, scope: resource(record) })),
    ...privacyRows.filter(({ record }) => can("privacy.view", record)).map(({ flag, record }) => ({ id: flag.id, itemType: "privacy_flag" as const, recordId: record.id, status: flag.status, priority: 100, summary: "Privacy review required", createdAt: flag.createdAt, scope: resource(record) })),
    ...safetyRows.filter(({ record }) => can("safety.view", record)).map(({ flag, record }) => ({ id: flag.id, itemType: "safety_flag" as const, recordId: record.id, status: flag.status, priority: 110, summary: flag.statement, createdAt: flag.createdAt, scope: resource(record) })),
    ...customRows.filter(({ record }) => can("taxonomy.approve_mapping", record)).map(({ entry, record }) => ({ id: entry.id, itemType: "custom_entry" as const, recordId: record.id, status: entry.mappingStatus, priority: 10, summary: entry.customText, createdAt: entry.createdAt, scope: resource(record) })),
    ...findingRows.filter(({ record }) => canReviewFinding(record)).map(({ finding, record }) => ({ id: finding.id, itemType: "ai_finding" as const, recordId: record.id, status: "pending", priority: finding.safetySuspect ? 90 : 15, summary: finding.statement, createdAt: finding.createdAt, scope: resource(record) })),
  ];
  return items.sort((left, right) => right.priority - left.priority || right.createdAt.getTime() - left.createdAt.getTime());
}

export async function getUnifiedReviewItem(userId: string, itemId: string) {
  const [access, recordRow, privacyRow, safetyRow, customRow, findingRow] = await Promise.all([
    getAccessContext(userId),
    db.select({ record: records, version: recordVersions }).from(records)
      .innerJoin(recordVersions, eq(records.headVersionId, recordVersions.id))
      .where(and(eq(records.id, itemId), eq(records.reviewStatus, "pending"), inArray(records.privacyStatus, ["clear", "redacted"]))).limit(1).then((rows) => rows[0]),
    db.select({ flag: privacyFlags, record: records, version: recordVersions }).from(privacyFlags)
      .innerJoin(records, eq(privacyFlags.recordId, records.id))
      .innerJoin(recordVersions, eq(privacyFlags.recordVersionId, recordVersions.id))
      .where(and(eq(privacyFlags.id, itemId), eq(privacyFlags.status, "open"))).limit(1).then((rows) => rows[0]),
    db.select({ flag: safetyFlags, record: records }).from(safetyFlags)
      .innerJoin(records, eq(safetyFlags.recordId, records.id))
      .where(and(eq(safetyFlags.id, itemId), eq(safetyFlags.status, "open"))).limit(1).then((rows) => rows[0]),
    db.select({ entry: recordCustomEntries, record: records, version: recordVersions }).from(recordCustomEntries)
      .innerJoin(recordVersions, eq(recordCustomEntries.recordVersionId, recordVersions.id))
      .innerJoin(records, eq(recordVersions.recordId, records.id))
      .where(and(eq(recordCustomEntries.id, itemId), eq(recordCustomEntries.mappingStatus, "pending"))).limit(1).then((rows) => rows[0]),
    db.select({ finding: aiFindings, run: aiRuns, record: records }).from(aiFindings)
      .innerJoin(aiRuns, eq(aiFindings.aiRunId, aiRuns.id))
      .innerJoin(recordVersions, eq(aiRuns.recordVersionId, recordVersions.id))
      .innerJoin(records, eq(recordVersions.recordId, records.id))
      .leftJoin(findingReviews, eq(findingReviews.aiFindingId, aiFindings.id))
      .where(and(eq(aiFindings.id, itemId), isNull(findingReviews.id))).limit(1).then((rows) => rows[0]),
  ]);
  const can = (permission: string, record: typeof records.$inferSelect) =>
    evaluateAuthorization(access, "review.view", resource(record)).allowed
    && evaluateAuthorization(access, permission, resource(record)).allowed;
  if (privacyRow && can("privacy.view", privacyRow.record)) return {
    id: privacyRow.flag.id,
    itemType: "privacy_flag" as const,
    recordId: privacyRow.record.id,
    status: privacyRow.flag.status,
    priority: 100,
    summary: "Privacy review required",
    createdAt: privacyRow.flag.createdAt,
    scope: resource(privacyRow.record),
    detail: { flag: privacyRow.flag, record: privacyRow.record, recordVersion: privacyRow.version },
  };
  if (safetyRow && can("safety.view", safetyRow.record)) return {
    id: safetyRow.flag.id,
    itemType: "safety_flag" as const,
    recordId: safetyRow.record.id,
    status: safetyRow.flag.status,
    priority: 110,
    summary: safetyRow.flag.statement,
    createdAt: safetyRow.flag.createdAt,
    scope: resource(safetyRow.record),
    detail: { flag: safetyRow.flag, record: safetyRow.record },
  };
  if (recordRow && can("records.review", recordRow.record)) return {
    id: recordRow.record.id,
    itemType: "record" as const,
    recordId: recordRow.record.id,
    status: recordRow.record.reviewStatus,
    priority: 20,
    summary: `${recordRow.record.sourceKind} record`,
    createdAt: recordRow.record.updatedAt,
    scope: resource(recordRow.record),
    detail: { record: recordRow.record, recordVersion: recordRow.version },
  };
  if (findingRow && (can("ai.review_findings", findingRow.record) || can("findings.review", findingRow.record))) return {
    id: findingRow.finding.id,
    itemType: "ai_finding" as const,
    recordId: findingRow.record.id,
    status: "pending",
    priority: findingRow.finding.safetySuspect ? 90 : 15,
    summary: findingRow.finding.statement,
    createdAt: findingRow.finding.createdAt,
    scope: resource(findingRow.record),
    detail: { finding: findingRow.finding, aiRun: findingRow.run, record: findingRow.record },
  };
  if (customRow && can("taxonomy.approve_mapping", customRow.record)) return {
    id: customRow.entry.id,
    itemType: "custom_entry" as const,
    recordId: customRow.record.id,
    status: customRow.entry.mappingStatus,
    priority: 10,
    summary: customRow.entry.customText,
    createdAt: customRow.entry.createdAt,
    scope: resource(customRow.record),
    detail: { customEntry: customRow.entry, record: customRow.record, recordVersion: { id: customRow.version.id, versionNumber: customRow.version.versionNumber } },
  };
  throw new ApiError("NOT_FOUND", "Review item not found", 404);
}

export async function decideUnifiedReviewItem(user: SessionUser, itemId: string, input: UnifiedDecision) {
  const item = await getUnifiedReviewItem(user.id, itemId);
  if (item.itemType !== input.itemType) throw new ApiError("BAD_REQUEST", "Review item type does not match", 400);
  switch (input.itemType) {
    case "record":
      return applyReview(user, item.recordId, input.decision);
    case "privacy_flag":
      return resolvePrivacyFlag({ flagId: itemId, actorId: user.id, body: input.decision });
    case "safety_flag":
      return { flag: await resolveSafetyFlag(itemId, user.id, input.decision) };
    case "ai_finding":
      return reviewAiFinding(itemId, user.id, input.decision);
    case "custom_entry":
      return reviewCustomEntry({ id: itemId, actorId: user.id, action: input.action, body: input.decision });
  }
}
