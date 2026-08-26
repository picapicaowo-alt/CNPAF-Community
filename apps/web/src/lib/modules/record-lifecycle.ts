import { and, eq, inArray, sql } from "drizzle-orm";
import {
  annotations,
  approvedFindings,
  auditEvents,
  privacyFlags,
  recordCustomEntries,
  recordFieldAnswers,
  records,
  recordStructuredSelections,
  recordVersions,
} from "@cnpaf/db/schema";
import type { z } from "zod";
import type { recordLifecycleBodySchema } from "@cnpaf/shared";
import { db } from "../db";
import { audit } from "../audit";
import { ApiError } from "../api-error";
import { evaluateAuthorization, getAccessContext } from "../authorization";
import { scanPrivacy } from "../pii";
import { loadSourceKindPolicy } from "../source-kind";
import type { SessionUser } from "../session";

type LifecycleInput = z.infer<typeof recordLifecycleBodySchema>;

function recordResource(record: typeof records.$inferSelect) {
  return {
    organizationId: record.organizationId,
    programId: record.programId,
    siteId: record.siteId,
    serviceKey: record.sourceKind,
    researchUse: record.researchUseStatus,
    ownerUserId: record.createdById,
  };
}

async function assertCanRevise(user: SessionUser, record: typeof records.$inferSelect) {
  const access = await getAccessContext(user.id);
  const resource = recordResource(record);
  if (
    evaluateAuthorization(access, "records.review", resource).allowed ||
    evaluateAuthorization(access, "records.edit_own", resource).allowed
  ) return;
  throw new ApiError("FORBIDDEN", "Record revision is outside the assigned scope", 403);
}

async function assertCanArchive(user: SessionUser, record: typeof records.$inferSelect) {
  const access = await getAccessContext(user.id);
  if (evaluateAuthorization(access, "records.review", recordResource(record)).allowed) return;
  throw new ApiError("FORBIDDEN", "Only an authorized reviewer can archive this record", 403);
}

async function saveRevision(user: SessionUser, recordId: string, input: Extract<LifecycleInput, { action: "save_revision" }>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from records where id = ${recordId} for update`);
    const record = (await tx.select().from(records).where(eq(records.id, recordId)).limit(1))[0];
    if (!record) throw new ApiError("NOT_FOUND", "Record not found", 404);
    await assertCanRevise(user, record);
    if (record.recordStatus === "archived") throw new ApiError("INVALID_TRANSITION", "Archived records cannot be revised", 409);
    if (!record.headVersionId) throw new ApiError("NOT_FOUND", "Record version not found", 404);
    const head = (await tx.select().from(recordVersions).where(eq(recordVersions.id, record.headVersionId)).limit(1))[0];
    if (!head) throw new ApiError("NOT_FOUND", "Record version not found", 404);
    const existingAnswers = await tx.select().from(recordFieldAnswers).where(eq(recordFieldAnswers.recordVersionId, head.id));
    const existingFieldIds = new Set(existingAnswers.map((answer) => answer.templateFieldId));
    const submittedFieldIds = new Set(input.fieldAnswers.map((answer) => answer.templateFieldId));
    if (
      existingFieldIds.size !== submittedFieldIds.size ||
      [...submittedFieldIds].some((id) => !existingFieldIds.has(id))
    ) throw new ApiError("BAD_REQUEST", "Revision fields must match the current form snapshot", 400);

    const currentDraft = !head.isSnapshot && record.reviewStatus === "not_submitted";
    const nextVersion = currentDraft
      ? (await tx.update(recordVersions).set({ qualitative: input.qualitative, updatedAt: new Date() }).where(eq(recordVersions.id, head.id)).returning())[0]
      : (await tx.insert(recordVersions).values({
          recordId,
          versionNumber: head.versionNumber + 1,
          occurredAt: head.occurredAt,
          submittedById: user.id,
          activityDefinitionId: head.activityDefinitionId,
          templateVersionId: head.templateVersionId,
          quantitative: head.quantitative,
          quantitativeMissing: head.quantitativeMissing,
          qualitative: input.qualitative,
          attribution: head.attribution,
          piiAttestation: head.piiAttestation,
          contentLanguage: head.contentLanguage,
          localVersion: head.localVersion + 1,
          serverVersion: head.serverVersion + 1,
          isSnapshot: false,
        }).returning())[0];
    if (!nextVersion) throw new ApiError("CONFLICT", "Could not create record revision", 409);

    if (!currentDraft) {
      const [selections, customEntries] = await Promise.all([
        tx.select().from(recordStructuredSelections).where(eq(recordStructuredSelections.recordVersionId, head.id)),
        tx.select().from(recordCustomEntries).where(eq(recordCustomEntries.recordVersionId, head.id)),
      ]);
      if (selections.length) await tx.insert(recordStructuredSelections).values(selections.map(({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...selection }) => ({ ...selection, recordVersionId: nextVersion.id })));
      if (customEntries.length) await tx.insert(recordCustomEntries).values(customEntries.map(({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...entry }) => ({ ...entry, recordVersionId: nextVersion.id, mappingStatus: "pending", reviewedById: null, reviewedAt: null })));
    }
    await tx.delete(recordFieldAnswers).where(eq(recordFieldAnswers.recordVersionId, nextVersion.id));
    if (input.fieldAnswers.length) {
      const sourceByFieldId = new Map(existingAnswers.map((answer) => [answer.templateFieldId, answer]));
      await tx.insert(recordFieldAnswers).values(input.fieldAnswers.map((answer) => {
        const source = sourceByFieldId.get(answer.templateFieldId)!;
        return {
          recordVersionId: nextVersion.id,
          templateVersionId: source.templateVersionId,
          templateSectionId: source.templateSectionId,
          templateFieldId: source.templateFieldId,
          sectionKey: source.sectionKey,
          sectionLabelEn: source.sectionLabelEn,
          sectionLabelZh: source.sectionLabelZh,
          sectionSortOrder: source.sectionSortOrder,
          fieldKey: source.fieldKey,
          fieldSortOrder: source.fieldSortOrder,
          fieldTypeKey: source.fieldTypeKey,
          labelEn: source.labelEn,
          labelZh: source.labelZh,
          value: answer.value,
          missingReasonKey: answer.missingReasonKey ?? null,
          customText: answer.customText?.trim() || null,
        };
      }));
    }
    const [updatedRecord] = await tx.update(records).set({
      headVersionId: nextVersion.id,
      recordStatus: "draft",
      reviewStatus: "not_submitted",
      researchUseStatus: "not_assessed",
      aiStatus: "not_required",
      updatedAt: new Date(),
    }).where(eq(records.id, recordId)).returning();
    await tx.insert(annotations).values({
      recordId,
      recordVersionId: nextVersion.id,
      authorId: user.id,
      body: input.reason,
      visibleToVolunteer: true,
    });
    await audit({
      actorId: user.id,
      action: "record.revision_saved",
      entityType: "record",
      entityId: recordId,
      beforeState: { record, version: head },
      afterState: { record: updatedRecord, version: nextVersion },
      reason: input.reason,
    }, (values) => tx.insert(auditEvents).values(values));
    return { record: updatedRecord, version: nextVersion };
  });
}

async function submitRevision(user: SessionUser, recordId: string) {
  const record = (await db.select().from(records).where(eq(records.id, recordId)).limit(1))[0];
  if (!record) throw new ApiError("NOT_FOUND", "Record not found", 404);
  await assertCanRevise(user, record);
  if (record.reviewStatus !== "not_submitted" || record.recordStatus !== "draft" || !record.headVersionId) {
    throw new ApiError("INVALID_TRANSITION", "Only a saved draft revision can be submitted", 409);
  }
  const version = (await db.select().from(recordVersions).where(eq(recordVersions.id, record.headVersionId)).limit(1))[0];
  if (!version || version.isSnapshot) throw new ApiError("INVALID_TRANSITION", "Draft revision not found", 409);
  const policy = await loadSourceKindPolicy(record.sourceKind);
  const scan = scanPrivacy({
    sourceKind: record.sourceKind,
    qualitative: version.qualitative,
    attribution: version.attribution as Record<string, unknown>,
    policy,
  });
  return db.transaction(async (tx) => {
    const [submittedVersion] = await tx.update(recordVersions).set({
      submittedAt: new Date(),
      submittedById: user.id,
      isSnapshot: true,
      updatedAt: new Date(),
    }).where(and(eq(recordVersions.id, version.id), eq(recordVersions.isSnapshot, false))).returning();
    if (!submittedVersion) throw new ApiError("CONFLICT", "Revision changed before submission", 409);
    const [updatedRecord] = await tx.update(records).set({
      recordStatus: "submitted",
      reviewStatus: "pending",
      privacyStatus: scan.status,
      aiStatus: "not_required",
      updatedAt: new Date(),
    }).where(eq(records.id, recordId)).returning();
    if (scan.status === "flagged") {
      await tx.insert(privacyFlags).values({ recordId, recordVersionId: version.id, status: "open", hits: scan.hits });
    }
    await audit({ actorId: user.id, action: "record.revision_submitted", entityType: "record", entityId: recordId, beforeState: record, afterState: updatedRecord, metadata: { versionId: version.id } }, (values) => tx.insert(auditEvents).values(values));
    return { record: updatedRecord, version: submittedVersion, privacy: scan };
  });
}

async function archiveRecord(user: SessionUser, recordId: string, reason: string) {
  const record = (await db.select().from(records).where(eq(records.id, recordId)).limit(1))[0];
  if (!record) throw new ApiError("NOT_FOUND", "Record not found", 404);
  await assertCanArchive(user, record);
  if (record.recordStatus === "archived") throw new ApiError("INVALID_TRANSITION", "Record is already archived", 409);
  const versionIds = (await db.select({ id: recordVersions.id }).from(recordVersions).where(eq(recordVersions.recordId, recordId))).map((row) => row.id);
  return db.transaction(async (tx) => {
    if (versionIds.length) await tx.update(approvedFindings).set({ status: "revoked", updatedAt: new Date() }).where(inArray(approvedFindings.recordVersionId, versionIds));
    const [archived] = await tx.update(records).set({
      recordStatus: "archived",
      reviewStatus: "archived",
      researchUseStatus: "restricted",
      updatedAt: new Date(),
    }).where(eq(records.id, recordId)).returning();
    await audit({ actorId: user.id, action: "record.archived", entityType: "record", entityId: recordId, beforeState: record, afterState: archived, reason }, (values) => tx.insert(auditEvents).values(values));
    return { record: archived };
  });
}

export async function applyRecordLifecycle(user: SessionUser, recordId: string, input: LifecycleInput) {
  if (input.action === "save_revision") return saveRevision(user, recordId, input);
  if (input.action === "submit_revision") return submitRevision(user, recordId);
  return archiveRecord(user, recordId, input.reason);
}
