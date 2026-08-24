import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  activityDefinitions,
  annotations,
  auditEvents,
  records,
  recordVersions,
  privacyFlags,
  recordCustomEntries,
  recordStructuredSelections,
  visits,
  templateFieldOptions,
  templateFields,
  templateSections,
  templateVersions,
  templates,
  programs,
  sites,
  tasks,
  taskAssignments,
} from "@cnpaf/db/schema";
import {
  validateSourceAttribution,
  type DraftBody,
  type SubmitBody,
} from "@cnpaf/shared";
import { db } from "./db";
import { audit } from "./audit";
import { ApiError } from "./api-error";
import { contentHash } from "./crypto";
import { enqueueAnalyze } from "./jobs";
import { scanPrivacy } from "./pii";
import type { SessionUser } from "./session";
import { evaluateAuthorization, getAccessContext } from "./authorization";
import { loadSourceKindPolicy } from "./source-kind";

function resourceForRecord(record: typeof records.$inferSelect) {
  return {
    organizationId: record.organizationId,
    programId: record.programId,
    siteId: record.siteId,
    serviceKey: record.sourceKind,
    researchUse: record.researchUseStatus,
    ownerUserId: record.createdById,
  };
}

function approvedEvidenceEligible(record: typeof records.$inferSelect) {
  return record.reviewStatus === "approved" &&
    ["clear", "redacted"].includes(record.privacyStatus) &&
    record.researchUseStatus === "approved_for_research";
}

export async function recordAccessMode(userId: string, record: typeof records.$inferSelect) {
  const access = await getAccessContext(userId);
  const resource = resourceForRecord(record);
  if (evaluateAuthorization(access, "records.view", resource).allowed) return "full" as const;
  if (evaluateAuthorization(access, "records.view_own", resource).allowed) return "full" as const;
  if (approvedEvidenceEligible(record) && evaluateAuthorization(access, "records.view_approved", { ...resource, dataClassification: "approved_evidence" }).allowed) return "approved_evidence" as const;
  return null;
}

function completeness(
  quantitative: Record<string, { reason: string; value: number | null }>,
  fieldCount: number,
): string | null {
  if (!fieldCount) return null;
  const answered = Object.values(quantitative).filter((v) => v?.reason).length;
  return (answered / fieldCount).toFixed(3);
}

async function loadRecordByClient(clientRecordId: string) {
  return (await db.select().from(records).where(eq(records.clientRecordId, clientRecordId)).limit(1))[0];
}

async function validateTemplatePayload(body: DraftBody) {
  if (!body.templateVersionId) {
    if (body.structuredSelections.length || body.customEntries.length) throw new ApiError("BAD_REQUEST", "templateVersionId is required for structured template data", 400);
    return null;
  }
  const form = (await db.select({ version: templateVersions, template: templates }).from(templateVersions)
    .innerJoin(templates, eq(templateVersions.templateId, templates.id))
    .where(eq(templateVersions.id, body.templateVersionId)).limit(1))[0];
  if (!form || form.version.status !== "published") throw new ApiError("BAD_REQUEST", "Published template version not found", 400);
  const sections = await db.select({ id: templateSections.id }).from(templateSections).where(eq(templateSections.templateVersionId, body.templateVersionId));
  const sectionIds = sections.map((section) => section.id);
  const fields = sectionIds.length ? await db.select().from(templateFields).where(inArray(templateFields.templateSectionId, sectionIds)) : [];
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const optionIds = body.structuredSelections.map((selection) => selection.optionId);
  const options = optionIds.length ? await db.select().from(templateFieldOptions).where(inArray(templateFieldOptions.id, optionIds)) : [];
  const optionById = new Map(options.map((option) => [option.id, option]));
  for (const selection of body.structuredSelections) {
    const field = fieldById.get(selection.templateFieldId);
    const option = optionById.get(selection.optionId);
    if (!field || !option || option.templateFieldId !== field.id || option.status !== "active") throw new ApiError("BAD_REQUEST", "Structured selection does not belong to the published template", 400);
  }
  for (const entry of body.customEntries) {
    const field = fieldById.get(entry.templateFieldId);
    if (!field?.allowCustomEntry) throw new ApiError("BAD_REQUEST", "Custom input is not enabled for this template field", 400);
  }
  return form;
}

async function validateRecordContext(user: SessionUser, body: DraftBody, permission: "records.create" | "records.submit") {
  const [form, program, site] = await Promise.all([
    validateTemplatePayload(body),
    body.programId ? db.select().from(programs).where(eq(programs.id, body.programId)).limit(1).then((rows) => rows[0]) : Promise.resolve(null),
    body.siteId ? db.select().from(sites).where(eq(sites.id, body.siteId)).limit(1).then((rows) => rows[0]) : Promise.resolve(null),
  ]);
  if (body.programId && (!program || program.status !== "active")) throw new ApiError("BAD_REQUEST", "Active program not found", 400);
  if (body.siteId && (!site || !["canonical", "unverified"].includes(site.canonicalStatus))) throw new ApiError("BAD_REQUEST", "Active location not found", 400);
  const organizationIds = [user.organizationId, program?.organizationId, site?.organizationId, form?.template.organizationId].filter(Boolean) as string[];
  if (new Set(organizationIds).size > 1) throw new ApiError("BAD_REQUEST", "Program, location, form, and user belong to different organizations", 400);
  const organizationId = program?.organizationId ?? site?.organizationId ?? form?.template.organizationId ?? user.organizationId;
  const access = await getAccessContext(user.id);
  if (!evaluateAuthorization(access, permission, {
    organizationId,
    programId: program?.id ?? null,
    siteId: site?.id ?? null,
    locationId: site?.id ?? null,
    templateId: form?.template.id ?? null,
    formId: form?.template.id ?? null,
    serviceKey: body.sourceKind,
    ownerUserId: user.id,
  }).allowed) throw new ApiError("FORBIDDEN", "Collection context is outside the assigned scope", 403);
  return { organizationId };
}

async function validateTaskContext(user: SessionUser, body: DraftBody) {
  if (!body.taskId && !body.taskAssignmentId) return;
  if (!body.taskId || !body.taskAssignmentId) throw new ApiError("BAD_REQUEST", "taskId and taskAssignmentId must be supplied together", 400);
  const [task, assignment] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.id, body.taskId)).limit(1).then((rows) => rows[0]),
    db.select().from(taskAssignments).where(eq(taskAssignments.id, body.taskAssignmentId)).limit(1).then((rows) => rows[0]),
  ]);
  if (!task || !assignment || assignment.taskId !== task.id || assignment.assigneeId !== user.id) {
    throw new ApiError("NOT_FOUND", "Assigned task not found", 404);
  }
  const existingRecord = await loadRecordByClient(body.clientRecordId);
  const correctionResubmission = assignment.status === "completed" && assignment.recordId === existingRecord?.id && existingRecord.reviewStatus === "needs_completion";
  if ((!['assigned', 'in_progress'].includes(assignment.status) && !correctionResubmission) || (task.status !== "open" && !correctionResubmission)) {
    throw new ApiError("INVALID_TRANSITION", "Assigned task is not open for collection", 409);
  }
  if (body.programId && body.programId !== task.programId) throw new ApiError("BAD_REQUEST", "programId does not match the assigned task", 400);
  if (body.templateVersionId && body.templateVersionId !== task.templateVersionId) throw new ApiError("BAD_REQUEST", "templateVersionId does not match the assigned task", 400);
  if (task.siteId && body.siteId !== task.siteId) throw new ApiError("BAD_REQUEST", "siteId does not match the assigned task", 400);
  body.programId = task.programId;
  body.templateVersionId = task.templateVersionId;
  body.siteId ??= task.siteId;
}

export async function upsertDraft(user: SessionUser, body: DraftBody, permission: "records.create" | "records.submit" = "records.create") {
  await loadSourceKindPolicy(body.sourceKind);
  await validateTaskContext(user, body);
  const context = await validateRecordContext(user, body, permission);
  const access = await getAccessContext(user.id);
  return db.transaction(async (tx) => {
    const [inserted] = await tx.insert(records).values({
      clientRecordId: body.clientRecordId,
      sourceKind: body.sourceKind,
      createdById: user.id,
      organizationId: context.organizationId,
      programId: body.programId ?? null,
      taskId: body.taskId ?? null,
      taskAssignmentId: body.taskAssignmentId ?? null,
      siteId: body.siteId ?? null,
      visitId: body.visitId ?? null,
      activityDefinitionId: body.activityDefinitionId ?? null,
      collectionPurpose: "operational",
      researchUseStatus: "not_assessed",
      recordStatus: "draft",
      reviewStatus: "not_submitted",
    }).onConflictDoNothing({ target: records.clientRecordId }).returning();
    const recordId = inserted?.id ?? (await tx.select({ id: records.id }).from(records).where(eq(records.clientRecordId, body.clientRecordId)).limit(1))[0]?.id;
    if (!recordId) throw new Error("Could not create record");
    await tx.execute(sql`select id from records where id = ${recordId} for update`);
    const record = (await tx.select().from(records).where(eq(records.id, recordId)).limit(1))[0];
    if (!record) throw new Error("Could not load record");
    if (!inserted && !evaluateAuthorization(access, "records.edit_own", resourceForRecord(record)).allowed) {
      throw new ApiError("FORBIDDEN", "Record is outside the assigned scope", 403);
    }
    if (record.recordStatus === "submitted" && record.reviewStatus !== "needs_completion") {
      return { record, conflict: false, immutable: true };
    }

    const allVersions = await tx.select().from(recordVersions).where(eq(recordVersions.recordId, record.id)).orderBy(desc(recordVersions.versionNumber));
    const head = allVersions[0];
    let draft = head && !head.isSnapshot ? head : undefined;
    if (draft && body.localVersion < draft.localVersion) return { record, draft, conflict: true, immutable: false };
    const payload = {
      qualitative: body.qualitative,
      quantitative: body.quantitative,
      attribution: body.attribution,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : null,
      activityDefinitionId: body.activityDefinitionId ?? null,
      templateVersionId: body.templateVersionId ?? null,
      contentLanguage: body.contentLanguage,
      localVersion: body.localVersion,
      serverVersion: (draft?.serverVersion ?? 0) + 1,
      submittedById: user.id,
      isSnapshot: false,
    };
    if (!draft) {
      const [created] = await tx.insert(recordVersions).values({ recordId: record.id, versionNumber: (head?.versionNumber ?? 0) + 1, ...payload }).returning();
      draft = created;
    } else {
      const [updated] = await tx.update(recordVersions).set({ ...payload, updatedAt: new Date() }).where(and(eq(recordVersions.id, draft.id), eq(recordVersions.isSnapshot, false))).returning();
      if (!updated) throw new ApiError("CONFLICT", "Draft changed concurrently", 409);
      draft = updated;
    }
    await tx.delete(recordStructuredSelections).where(eq(recordStructuredSelections.recordVersionId, draft.id));
    await tx.delete(recordCustomEntries).where(eq(recordCustomEntries.recordVersionId, draft.id));
    if (body.structuredSelections.length) await tx.insert(recordStructuredSelections).values(body.structuredSelections.map((selection) => ({ recordVersionId: draft!.id, ...selection })));
    if (body.customEntries.length) await tx.insert(recordCustomEntries).values(body.customEntries.map((entry) => ({ recordVersionId: draft!.id, ...entry, customText: entry.customText.trim() })));
    const [updatedRecord] = await tx.update(records).set({
      sourceKind: body.sourceKind,
      siteId: body.siteId ?? record.siteId,
      programId: body.programId ?? record.programId,
      taskId: body.taskId ?? record.taskId,
      taskAssignmentId: body.taskAssignmentId ?? record.taskAssignmentId,
      activityDefinitionId: body.activityDefinitionId ?? record.activityDefinitionId,
      headVersionId: draft.id,
      updatedAt: new Date(),
    }).where(eq(records.id, record.id)).returning();
    return { record: updatedRecord, draft, conflict: false, immutable: false };
  });
}

export async function submitRecord(user: SessionUser, body: SubmitBody) {
  const policy = await loadSourceKindPolicy(body.sourceKind);

  const attrErrors = validateSourceAttribution(policy, body.attribution ?? {});
  if (attrErrors.length) throw new ApiError("BAD_REQUEST", attrErrors.join("; "), 400);
  if (policy.requiresPiiAttestation && !body.piiAttestation) {
    throw new ApiError("BAD_REQUEST", "De-identification attestation is required for this source kind", 400);
  }
  if (policy.requiresSite && !body.siteId) throw new ApiError("BAD_REQUEST", "Site is required", 400);
  if (policy.requiresActivity && !body.activityDefinitionId && !body.templateVersionId) throw new ApiError("BAD_REQUEST", "Activity or template is required", 400);
  if (!body.qualitative.trim()) throw new ApiError("BAD_REQUEST", "Qualitative notes are required", 400);

  const hash = contentHash({
    clientRecordId: body.clientRecordId,
    occurredAt: body.occurredAt ?? null,
    sourceKind: body.sourceKind,
    programId: body.programId ?? null,
    taskId: body.taskId ?? null,
    taskAssignmentId: body.taskAssignmentId ?? null,
    siteId: body.siteId ?? null,
    templateVersionId: body.templateVersionId ?? null,
    qualitative: body.qualitative,
    quantitative: body.quantitative,
    attribution: body.attribution,
    structuredSelections: body.structuredSelections,
    customEntries: body.customEntries,
  });
  const requestFingerprint = contentHash({
    clientRecordId: body.clientRecordId,
    localVersion: body.localVersion,
    sourceKind: body.sourceKind,
    programId: body.programId ?? null,
    taskId: body.taskId ?? null,
    taskAssignmentId: body.taskAssignmentId ?? null,
    visitId: body.visitId ?? null,
    siteId: body.siteId ?? null,
    activityDefinitionId: body.activityDefinitionId ?? null,
    templateVersionId: body.templateVersionId ?? null,
    occurredAt: body.occurredAt ?? null,
    structuredSelections: body.structuredSelections,
    customEntries: body.customEntries,
    qualitative: body.qualitative,
    quantitative: body.quantitative,
    attribution: body.attribution,
    contentLanguage: body.contentLanguage,
    piiAttestation: body.piiAttestation,
  });
  const scopedIdempotencyKey = body.idempotencyKey
    ? `record-submit:${user.id}:${body.clientRecordId}:${body.idempotencyKey}`
    : null;

  const existing = scopedIdempotencyKey
    ? (
        await db
          .select()
          .from(recordVersions)
          .where(eq(recordVersions.idempotencyKey, scopedIdempotencyKey))
          .limit(1)
      )[0]
    : null;
  if (existing?.isSnapshot) {
    const record = (await db.select().from(records).where(eq(records.id, existing.recordId)).limit(1))[0];
    const fingerprintMatches = existing.requestFingerprint
      ? existing.requestFingerprint === requestFingerprint
      : existing.contentHash === hash;
    if (!record || record.createdById !== user.id || record.clientRecordId !== body.clientRecordId || !fingerprintMatches) {
      throw new ApiError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different submission", 409);
    }
    return { record, version: existing, duplicate: true };
  }

  const { record } = await upsertDraft(user, body, "records.submit");
  if (!record) throw new Error("Missing record");

  const def = body.activityDefinitionId
    ? (
        await db
          .select()
          .from(activityDefinitions)
          .where(eq(activityDefinitions.id, body.activityDefinitionId))
          .limit(1)
      )[0]
    : null;
  const fieldCount = Array.isArray(def?.fields) ? (def.fields as unknown[]).length : 0;
  const scan = scanPrivacy({
    sourceKind: body.sourceKind,
    qualitative: [body.qualitative, ...body.customEntries.map((entry) => entry.customText)].join("\n"),
    attribution: body.attribution ?? {},
    policy,
  });
  const aiStatus = scan.status === "flagged" ? "skipped_privacy" : "queued";
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from records where id = ${record.id} for update`);
    const lockedRecord = (await tx.select().from(records).where(eq(records.id, record.id)).limit(1))[0];
    if (!lockedRecord || lockedRecord.createdById !== user.id) throw new ApiError("NOT_FOUND", "Record not found", 404);

    if (scopedIdempotencyKey) {
      const replay = (await tx.select().from(recordVersions).where(eq(recordVersions.idempotencyKey, scopedIdempotencyKey)).limit(1))[0];
      if (replay?.isSnapshot) {
        const fingerprintMatches = replay.requestFingerprint
          ? replay.requestFingerprint === requestFingerprint
          : replay.contentHash === hash;
        if (replay.recordId !== lockedRecord.id || !fingerprintMatches) throw new ApiError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different submission", 409);
        return { record: lockedRecord, version: replay, duplicate: true, privacy: scan };
      }
    }
    if (lockedRecord.recordStatus === "submitted" && lockedRecord.reviewStatus !== "needs_completion") {
      throw new ApiError("CONFLICT", "Record has already been submitted", 409);
    }

    let visitId = body.visitId ?? lockedRecord.visitId;
    if (policy.requiresVisit && body.siteId) {
      const [visit] = await tx.insert(visits).values({
        siteId: body.siteId,
        activityDefinitionId: body.activityDefinitionId ?? null,
        conductedById: user.id,
        submittedAt: new Date(),
      }).returning();
      visitId = visit.id;
    }

    const latest = (await tx.select().from(recordVersions).where(eq(recordVersions.recordId, lockedRecord.id)).orderBy(desc(recordVersions.versionNumber)).limit(1))[0];
    const nextNumber = (latest?.versionNumber ?? 0) + (latest?.isSnapshot ? 1 : 0);
    const snapshotNumber = latest && !latest.isSnapshot ? latest.versionNumber : nextNumber || 1;
    const snapshotValues = {
      qualitative: body.qualitative,
      quantitative: body.quantitative,
      quantitativeMissing: body.quantitative,
      attribution: body.attribution,
      activityDefinitionId: body.activityDefinitionId ?? null,
      templateVersionId: body.templateVersionId ?? null,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : null,
      piiAttestation: body.piiAttestation,
      contentLanguage: body.contentLanguage,
      contentHash: hash,
      requestFingerprint,
      localVersion: body.localVersion,
      submittedAt: new Date(),
      submittedById: user.id,
      idempotencyKey: scopedIdempotencyKey,
      isSnapshot: true,
    };
    const [version] = latest && !latest.isSnapshot
      ? await tx.update(recordVersions).set({ ...snapshotValues, updatedAt: new Date() }).where(and(eq(recordVersions.id, latest.id), eq(recordVersions.isSnapshot, false))).returning()
      : await tx.insert(recordVersions).values({ recordId: lockedRecord.id, versionNumber: snapshotNumber === 0 ? 1 : snapshotNumber, ...snapshotValues }).returning();
    if (!version) throw new ApiError("CONFLICT", "Record version changed concurrently", 409);

    const [submittedRecord] = await tx.update(records).set({
      recordStatus: "submitted",
      reviewStatus: "pending",
      privacyStatus: scan.status,
      aiStatus,
      visitId,
      siteId: body.siteId ?? lockedRecord.siteId,
      programId: body.programId ?? lockedRecord.programId,
      taskId: body.taskId ?? lockedRecord.taskId,
      taskAssignmentId: body.taskAssignmentId ?? lockedRecord.taskAssignmentId,
      activityDefinitionId: body.activityDefinitionId ?? lockedRecord.activityDefinitionId,
      headVersionId: version.id,
      completenessScore: completeness(body.quantitative, fieldCount),
      updatedAt: new Date(),
    }).where(eq(records.id, lockedRecord.id)).returning();

    if (body.taskAssignmentId) {
      const assignment = (await tx.select().from(taskAssignments).where(eq(taskAssignments.id, body.taskAssignmentId)).limit(1))[0];
      if (!assignment || assignment.assigneeId !== user.id || assignment.taskId !== body.taskId) throw new ApiError("CONFLICT", "Task assignment changed before submission", 409);
      if (assignment.status !== "completed" || assignment.recordId !== lockedRecord.id) {
        const [completed] = await tx.update(taskAssignments).set({ status: "completed", recordId: lockedRecord.id, completedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(taskAssignments.id, body.taskAssignmentId), inArray(taskAssignments.status, ["assigned", "in_progress"]))).returning();
        if (!completed) throw new ApiError("CONFLICT", "Task assignment changed before submission", 409);
      }
    }
    await audit({ actorId: user.id, action: "submit", entityType: "record", entityId: lockedRecord.id, metadata: { versionId: version.id, privacy: scan.status } }, (values) => tx.insert(auditEvents).values(values));
    if (scan.status === "flagged") await tx.insert(privacyFlags).values({ recordId: lockedRecord.id, recordVersionId: version.id, status: "open", hits: scan.hits });
    return { record: submittedRecord, version, duplicate: false, privacy: scan };
  });

  if (!result.duplicate && scan.status !== "flagged") await enqueueAnalyze(result.version.id);
  return result;
}

export async function listRecordsForUser(user: SessionUser) {
  const rows = await db.select().from(records).orderBy(desc(records.updatedAt));
  const access = await getAccessContext(user.id);
  return rows.filter((record) => {
    const resource = resourceForRecord(record);
    if (evaluateAuthorization(access, "records.view", resource).allowed) return true;
    if (evaluateAuthorization(access, "records.view_own", resource).allowed) return true;
    return approvedEvidenceEligible(record) && evaluateAuthorization(access, "records.view_approved", { ...resource, dataClassification: "approved_evidence" }).allowed;
  });
}

export async function getRecordBundle(id: string, user: SessionUser) {
  const record = (await db.select().from(records).where(eq(records.id, id)).limit(1))[0];
  if (!record) return null;
  const accessMode = await recordAccessMode(user.id, record);
  if (!accessMode) return null;
  if (accessMode === "approved_evidence") return { record, versions: [], notes: [], accessMode };
  const versions = await db
    .select()
    .from(recordVersions)
    .where(eq(recordVersions.recordId, id))
    .orderBy(desc(recordVersions.versionNumber));
  const notes = await db.select().from(annotations).where(eq(annotations.recordId, id));
  const versionIds = versions.map((version) => version.id);
  const [structuredSelections, customEntries] = versionIds.length ? await Promise.all([
    db.select().from(recordStructuredSelections).where(inArray(recordStructuredSelections.recordVersionId, versionIds)),
    db.select().from(recordCustomEntries).where(inArray(recordCustomEntries.recordVersionId, versionIds)),
  ]) : [[], []];
  return { record, versions, notes, structuredSelections, customEntries, accessMode };
}
