import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  approvedFindings,
  auditEvents,
  datasetRecords,
  datasets,
  datasetVersions,
  privacyFlags,
  programs,
  records,
  recordStructuredSelections,
  recordVersions,
  sharedDatasetAccessLogs,
  sharedDatasets,
  users,
} from "@cnpaf/db/schema";
import type { z } from "zod";
import type {
  dataDownloadBodySchema,
  datasetCreateBodySchema,
  datasetRefreshBodySchema,
  datasetShareBodySchema,
  recordShareBodySchema,
} from "@cnpaf/shared";
import { db } from "../db";
import { audit } from "../audit";
import { ApiError } from "../api-error";
import { authorize, evaluateAuthorization, getAccessContext } from "../authorization";
import { contentHash, sha256 } from "../crypto";
import { toCsv, toSimplePdf } from "../export-format";
import { matchesEvidenceFilters } from "../evidence-filters";
import { requireActiveRegistryItem } from "../registries";

type DatasetCreate = z.infer<typeof datasetCreateBodySchema>;
type DatasetRefresh = z.infer<typeof datasetRefreshBodySchema>;
type DatasetShare = z.infer<typeof datasetShareBodySchema>;
type RecordShare = z.infer<typeof recordShareBodySchema>;
type DownloadInput = z.infer<typeof dataDownloadBodySchema>;
type FieldPolicy = DatasetCreate["fieldPolicy"];

const MAX_DATASET_RECORDS = 10_000;

function datasetResource(dataset: typeof datasets.$inferSelect) {
  return {
    organizationId: dataset.organizationId,
    programId: dataset.programId,
    datasetId: dataset.id,
    dataClassification: dataset.dataClassification,
  };
}

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

function approvedEvidenceEligible(record: typeof records.$inferSelect) {
  return record.reviewStatus === "approved" &&
    ["clear", "redacted"].includes(record.privacyStatus) &&
    record.researchUseStatus === "approved_for_research";
}

function requestedFields(policy: FieldPolicy) {
  return new Set(policy.include.length ? policy.include : [
    "structured_answers",
    "approved_findings",
    "evidence_excerpts",
    "collector_notes",
    "form_version_information",
  ]);
}

function assertFieldPolicyAllowed(dataClassification: string, policy: FieldPolicy) {
  if (requestedFields(policy).has("personal_fields") && dataClassification !== "restricted_pii") {
    throw new ApiError("BAD_REQUEST", "personal_fields require the restricted_pii data classification", 400);
  }
}

async function requireDataset(actorId: string, datasetId: string, permission: string) {
  const dataset = (await db.select().from(datasets).where(eq(datasets.id, datasetId)).limit(1))[0];
  if (!dataset) throw new ApiError("NOT_FOUND", "Dataset not found", 404);
  if (!(await authorize({ userId: actorId, permission, resource: datasetResource(dataset) })).allowed) {
    throw new ApiError("FORBIDDEN", "Dataset is outside the assigned scope", 403);
  }
  return dataset;
}

async function requireFrozenRecordAccess(actorId: string, datasetVersionId: string, dataClassification: string) {
  const frozen = await db.select({ record: records }).from(datasetRecords)
    .innerJoin(records, eq(datasetRecords.recordId, records.id))
    .where(eq(datasetRecords.datasetVersionId, datasetVersionId));
  const access = await getAccessContext(actorId);
  const approvedOnly = dataClassification === "approved_evidence";
  for (const { record } of frozen) {
    if (approvedOnly) {
      if (!approvedEvidenceEligible(record) || !evaluateAuthorization(access, "records.view_approved", { ...recordResource(record), dataClassification }).allowed) {
        throw new ApiError("FORBIDDEN", "Dataset contains evidence that is no longer available in the current scope", 403);
      }
      continue;
    }
    const resource = { ...recordResource(record), dataClassification };
    if (!evaluateAuthorization(access, "records.view", resource).allowed || !evaluateAuthorization(access, "records.view_restricted_pii", resource).allowed) {
      throw new ApiError("FORBIDDEN", "Restricted dataset access requires explicit record and PII permissions", 403);
    }
  }
  return frozen;
}

async function selectRecordVersions(actorId: string, input: DatasetCreate["selection"], organizationId: string, dataClassification: string) {
  const recordIdSet = input.recordIds ? new Set(input.recordIds) : null;
  const [access, allRecords] = await Promise.all([
    getAccessContext(actorId),
    recordIdSet
      ? db.select().from(records).where(and(eq(records.organizationId, organizationId), inArray(records.id, [...recordIdSet])))
      : db.select().from(records).where(eq(records.organizationId, organizationId)),
  ]);
  const filters = input.filters;
  let candidates = allRecords.filter((record) => {
    if (record.organizationId !== organizationId || !record.headVersionId) return false;
    if (recordIdSet && !recordIdSet.has(record.id)) return false;
    const canRead = dataClassification === "approved_evidence"
      ? approvedEvidenceEligible(record) && evaluateAuthorization(access, "records.view_approved", { ...recordResource(record), dataClassification }).allowed
      : evaluateAuthorization(access, "records.view", { ...recordResource(record), dataClassification }).allowed &&
        evaluateAuthorization(access, "records.view_restricted_pii", { ...recordResource(record), dataClassification }).allowed;
    return canRead;
  });
  if (recordIdSet && candidates.length !== recordIdSet.size) {
    throw new ApiError("FORBIDDEN", "One or more selected records are missing, restricted, or outside scope", 403);
  }
  if (candidates.length > MAX_DATASET_RECORDS) throw new ApiError("BAD_REQUEST", `Dataset exceeds ${MAX_DATASET_RECORDS} records`, 400);
  const headIds = candidates.map((record) => record.headVersionId!);
  const [versions, findings] = headIds.length ? await Promise.all([
    db.select().from(recordVersions).where(inArray(recordVersions.id, headIds)),
    db.select().from(approvedFindings).where(and(inArray(approvedFindings.recordVersionId, headIds), eq(approvedFindings.status, "approved"))),
  ]) : [[], []];
  const versionById = new Map(versions.map((version) => [version.id, version]));
  const findingsByVersion = new Map<string, typeof findings>();
  for (const finding of findings) {
    if (!finding.recordVersionId) continue;
    findingsByVersion.set(finding.recordVersionId, [...(findingsByVersion.get(finding.recordVersionId) ?? []), finding]);
  }
  candidates = candidates.filter((record) => {
    const version = versionById.get(record.headVersionId!);
    if (!version?.isSnapshot) return false;
    if (!filters) return true;
    const recordFindings = findingsByVersion.get(version.id) ?? [];
    return (recordFindings.length ? recordFindings : [null]).some((finding) => matchesEvidenceFilters(filters, record, version, finding));
  }).sort((left, right) => left.id.localeCompare(right.id));
  return candidates.map((record) => ({ record, version: versionById.get(record.headVersionId!)! }));
}

async function createDatasetVersion(input: {
  actorId: string;
  dataset: typeof datasets.$inferSelect;
  selection: DatasetCreate["selection"];
  fieldPolicy: FieldPolicy;
  requestId?: string;
}) {
  const selected = await selectRecordVersions(input.actorId, input.selection, input.dataset.organizationId, input.dataset.dataClassification);
  const frozen = selected.map(({ record, version }) => ({ recordId: record.id, recordVersionId: version.id }));
  const hash = contentHash({ frozen, fieldPolicy: input.fieldPolicy });
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from datasets where id = ${input.dataset.id} for update`);
    const latest = (await tx.select().from(datasetVersions).where(eq(datasetVersions.datasetId, input.dataset.id)).orderBy(desc(datasetVersions.versionNumber)).limit(1))[0];
    const [version] = await tx.insert(datasetVersions).values({
      datasetId: input.dataset.id,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      selectionQuery: input.selection,
      fieldPolicy: input.fieldPolicy,
      recordCount: frozen.length,
      contentHash: hash,
      createdById: input.actorId,
      status: "building",
    }).returning();
    if (frozen.length) await tx.insert(datasetRecords).values(frozen.map((item, ordinal) => ({ ...item, datasetVersionId: version.id, ordinal, includedFields: input.fieldPolicy })));
    const [ready] = await tx.update(datasetVersions).set({ status: "ready" }).where(eq(datasetVersions.id, version.id)).returning();
    await tx.update(datasets).set({ headVersionId: ready.id, selectionQuery: input.selection, fieldPolicy: input.fieldPolicy, updatedAt: new Date() }).where(eq(datasets.id, input.dataset.id));
    await audit({ actorId: input.actorId, action: latest ? "dataset.refreshed" : "dataset.created", entityType: "dataset_version", entityId: ready.id, afterState: { datasetId: input.dataset.id, versionNumber: ready.versionNumber, recordCount: ready.recordCount, contentHash: ready.contentHash }, metadata: { requestId: input.requestId } }, (values) => tx.insert(auditEvents).values(values));
    return ready;
  });
}

export async function listDatasets(actorId: string) {
  const [access, rows] = await Promise.all([getAccessContext(actorId), db.select().from(datasets).orderBy(desc(datasets.updatedAt))]);
  return rows.filter((dataset) => evaluateAuthorization(access, "datasets.download", datasetResource(dataset)).allowed || evaluateAuthorization(access, "datasets.create", datasetResource(dataset)).allowed);
}

export async function getDataset(actorId: string, datasetId: string) {
  const dataset = await requireDataset(actorId, datasetId, "datasets.download");
  const versions = await db.select().from(datasetVersions).where(eq(datasetVersions.datasetId, datasetId)).orderBy(desc(datasetVersions.versionNumber));
  return { dataset, versions };
}

export async function createDataset(actorId: string, input: DatasetCreate, requestId?: string) {
  if (!(await authorize({ userId: actorId, permission: "datasets.create", resource: { organizationId: input.organizationId, programId: input.programId, dataClassification: input.dataClassification } })).allowed) {
    throw new ApiError("FORBIDDEN", "Cannot create a dataset in this scope", 403);
  }
  await requireActiveRegistryItem("data_classification", input.dataClassification, input.organizationId);
  if (input.programId) {
    const program = (await db.select().from(programs).where(eq(programs.id, input.programId)).limit(1))[0];
    if (!program || program.organizationId !== input.organizationId) throw new ApiError("BAD_REQUEST", "Dataset program must belong to the selected organization", 400);
  }
  assertFieldPolicyAllowed(input.dataClassification, input.fieldPolicy);
  const dataset = await db.transaction(async (tx) => {
    const [created] = await tx.insert(datasets).values({
      organizationId: input.organizationId,
      programId: input.programId,
      name: input.name,
      description: input.description,
      dataClassification: input.dataClassification,
      selectionQuery: input.selection,
      fieldPolicy: input.fieldPolicy,
      createdById: actorId,
    }).returning();
    return created;
  });
  try {
    const version = await createDatasetVersion({ actorId, dataset, selection: input.selection, fieldPolicy: input.fieldPolicy, requestId });
    return { dataset: { ...dataset, headVersionId: version.id }, version };
  } catch (error) {
    await db.update(datasets).set({ status: "archived", updatedAt: new Date() }).where(eq(datasets.id, dataset.id));
    throw error;
  }
}

export async function refreshDataset(actorId: string, datasetId: string, input: DatasetRefresh, requestId?: string) {
  const dataset = await requireDataset(actorId, datasetId, "datasets.refresh");
  const selection = (input.selection ?? dataset.selectionQuery) as DatasetCreate["selection"];
  const fieldPolicy = (input.fieldPolicy ?? dataset.fieldPolicy) as FieldPolicy;
  assertFieldPolicyAllowed(dataset.dataClassification, fieldPolicy);
  return createDatasetVersion({ actorId, dataset, selection, fieldPolicy, requestId });
}

async function loadDatasetRows(datasetVersionId: string, fieldPolicy?: FieldPolicy) {
  const frozenRows = await db.select({ frozen: datasetRecords, record: records, version: recordVersions })
    .from(datasetRecords)
    .innerJoin(records, eq(datasetRecords.recordId, records.id))
    .innerJoin(recordVersions, eq(datasetRecords.recordVersionId, recordVersions.id))
    .where(eq(datasetRecords.datasetVersionId, datasetVersionId))
    .orderBy(asc(datasetRecords.ordinal));
  const versionIds = frozenRows.map((row) => row.version.id);
  const [findings, selections, resolvedPrivacy] = versionIds.length ? await Promise.all([
    db.select().from(approvedFindings).where(inArray(approvedFindings.recordVersionId, versionIds)),
    db.select().from(recordStructuredSelections).where(inArray(recordStructuredSelections.recordVersionId, versionIds)),
    db.select().from(privacyFlags).where(and(inArray(privacyFlags.recordVersionId, versionIds), eq(privacyFlags.status, "resolved"))),
  ]) : [[], [], []];
  const effectivePolicy = fieldPolicy ?? { include: [], exclude: [], redactionProfileKey: null };
  const include = requestedFields(effectivePolicy);
  for (const excluded of effectivePolicy.exclude) include.delete(excluded);
  return frozenRows.map(({ record, version }) => {
    const privacy = resolvedPrivacy.find((flag) => flag.recordVersionId === version.id);
    const safeText = record.privacyStatus === "redacted" ? privacy?.redactedText ?? null : record.privacyStatus === "clear" ? version.qualitative : null;
    return {
      record: { id: record.id, sourceKind: record.sourceKind, programId: record.programId, siteId: record.siteId, reviewStatus: record.reviewStatus, researchUseStatus: record.researchUseStatus },
      recordVersionId: version.id,
      ...(include.has("form_version_information") ? { form: { templateVersionId: version.templateVersionId, versionNumber: version.versionNumber, occurredAt: version.occurredAt, submittedAt: version.submittedAt } } : {}),
      ...(include.has("structured_answers") ? { structuredAnswers: selections.filter((selection) => selection.recordVersionId === version.id), quantitative: version.quantitative } : {}),
      ...(include.has("approved_findings") ? { approvedFindings: findings.filter((finding) => finding.recordVersionId === version.id).map((finding) => finding.approvedValue) } : {}),
      ...(include.has("evidence_excerpts") ? { evidenceExcerpts: findings.filter((finding) => finding.recordVersionId === version.id).flatMap((finding) => finding.evidence as unknown[]) } : {}),
      ...(include.has("collector_notes") ? { collectorNotes: safeText } : {}),
      ...(include.has("personal_fields") ? { personalFields: { attribution: version.attribution } } : {}),
      ...(include.has("audit_metadata") ? { auditMetadata: { recordCreatedAt: record.createdAt, recordUpdatedAt: record.updatedAt, versionCreatedAt: version.createdAt, submittedById: version.submittedById, contentHash: version.contentHash } } : {}),
    };
  });
}

export async function downloadDataset(actorId: string, datasetId: string, input: DownloadInput, requestId?: string) {
  const dataset = await requireDataset(actorId, datasetId, "datasets.download");
  const versionId = input.versionId ?? dataset.headVersionId;
  if (!versionId) throw new ApiError("NOT_FOUND", "Dataset has no ready version", 404);
  const version = (await db.select().from(datasetVersions).where(and(eq(datasetVersions.id, versionId), eq(datasetVersions.datasetId, datasetId), eq(datasetVersions.status, "ready"))).limit(1))[0];
  if (!version) throw new ApiError("NOT_FOUND", "Ready dataset version not found", 404);
  if (input.format === "pdf") throw new ApiError("BAD_REQUEST", "Dataset downloads support JSON and CSV; PDF is available for a single record", 400);
  if (input.fieldPolicy && contentHash(input.fieldPolicy) !== contentHash(version.fieldPolicy)) throw new ApiError("BAD_REQUEST", "A frozen dataset version's field policy cannot be overridden during download", 400);
  assertFieldPolicyAllowed(dataset.dataClassification, version.fieldPolicy as FieldPolicy);
  await requireFrozenRecordAccess(actorId, version.id, dataset.dataClassification);
  const rows = await loadDatasetRows(version.id, version.fieldPolicy as FieldPolicy);
  await audit({ actorId, action: "dataset.downloaded", entityType: "dataset_version", entityId: version.id, metadata: { requestId, format: input.format, recordCount: rows.length } });
  return input.format === "csv"
    ? { body: Buffer.from(toCsv(rows.map((row) => ({ recordId: row.record.id, recordVersionId: row.recordVersionId, data: row })))), mimeType: "text/csv; charset=utf-8", extension: "csv" }
    : { body: Buffer.from(JSON.stringify({ dataset, version, rows }, null, 2)), mimeType: "application/json; charset=utf-8", extension: "json" };
}

export async function downloadRecord(actorId: string, recordId: string, input: DownloadInput, requestId?: string) {
  const record = (await db.select().from(records).where(eq(records.id, recordId)).limit(1))[0];
  if (!record) throw new ApiError("NOT_FOUND", "Record not found", 404);
  if (!(await authorize({ userId: actorId, permission: "records.download", resource: { ...recordResource(record), dataClassification: "approved_evidence" } })).allowed) {
    throw new ApiError("FORBIDDEN", "Record download is outside the assigned scope", 403);
  }
  if (!approvedEvidenceEligible(record)) throw new ApiError("FORBIDDEN", "Only approved, privacy-cleared, research-eligible records may be downloaded", 403);
  if (input.fieldPolicy) assertFieldPolicyAllowed("approved_evidence", input.fieldPolicy);
  const versionId = input.versionId ?? record.headVersionId;
  if (!versionId) throw new ApiError("NOT_FOUND", "Record version not found", 404);
  if (versionId !== record.headVersionId) throw new ApiError("FORBIDDEN", "Only the current approved record version may be downloaded", 403);
  const version = (await db.select().from(recordVersions).where(and(eq(recordVersions.id, versionId), eq(recordVersions.recordId, recordId), eq(recordVersions.isSnapshot, true))).limit(1))[0];
  if (!version) throw new ApiError("NOT_FOUND", "Submitted record version not found", 404);
  const rows = await loadDatasetRowsForRecord(record, version, input.fieldPolicy);
  await audit({ actorId, action: "record.downloaded", entityType: "record_version", entityId: version.id, metadata: { requestId, format: input.format } });
  if (input.format === "pdf") return { body: toSimplePdf(`CNPAF Record ${record.id}`, rows), mimeType: "application/pdf", extension: "pdf" };
  if (input.format === "csv") return { body: Buffer.from(toCsv([{ recordId: record.id, recordVersionId: version.id, data: rows }])), mimeType: "text/csv; charset=utf-8", extension: "csv" };
  return { body: Buffer.from(JSON.stringify(rows, null, 2)), mimeType: "application/json; charset=utf-8", extension: "json" };
}

async function loadDatasetRowsForRecord(record: typeof records.$inferSelect, version: typeof recordVersions.$inferSelect, policy?: FieldPolicy) {
  const include = requestedFields(policy ?? { include: [], exclude: [], redactionProfileKey: null });
  for (const excluded of policy?.exclude ?? []) include.delete(excluded);
  const [findings, selections, privacy] = await Promise.all([
    db.select().from(approvedFindings).where(eq(approvedFindings.recordVersionId, version.id)),
    db.select().from(recordStructuredSelections).where(eq(recordStructuredSelections.recordVersionId, version.id)),
    db.select().from(privacyFlags).where(and(eq(privacyFlags.recordVersionId, version.id), eq(privacyFlags.status, "resolved"))).limit(1).then((rows) => rows[0]),
  ]);
  const safeText = record.privacyStatus === "redacted" ? privacy?.redactedText ?? null : record.privacyStatus === "clear" ? version.qualitative : null;
  return {
    record: { id: record.id, sourceKind: record.sourceKind, programId: record.programId, siteId: record.siteId, reviewStatus: record.reviewStatus, researchUseStatus: record.researchUseStatus },
    recordVersionId: version.id,
    ...(include.has("form_version_information") ? { form: { templateVersionId: version.templateVersionId, versionNumber: version.versionNumber, occurredAt: version.occurredAt, submittedAt: version.submittedAt } } : {}),
    ...(include.has("structured_answers") ? { structuredAnswers: selections, quantitative: version.quantitative } : {}),
    ...(include.has("approved_findings") ? { approvedFindings: findings.map((finding) => finding.approvedValue) } : {}),
    ...(include.has("evidence_excerpts") ? { evidenceExcerpts: findings.flatMap((finding) => finding.evidence as unknown[]) } : {}),
    ...(include.has("collector_notes") ? { collectorNotes: safeText } : {}),
    ...(include.has("personal_fields") ? { personalFields: { attribution: version.attribution } } : {}),
    ...(include.has("audit_metadata") ? { auditMetadata: { recordCreatedAt: record.createdAt, recordUpdatedAt: record.updatedAt, versionCreatedAt: version.createdAt, submittedById: version.submittedById, contentHash: version.contentHash } } : {}),
  };
}

export async function shareDataset(actorId: string, datasetId: string, input: DatasetShare, requestId?: string) {
  const dataset = await requireDataset(actorId, datasetId, "datasets.share");
  const versionId = input.datasetVersionId ?? dataset.headVersionId;
  if (!versionId) throw new ApiError("NOT_FOUND", "Dataset has no ready version", 404);
  const version = (await db.select().from(datasetVersions).where(and(eq(datasetVersions.id, versionId), eq(datasetVersions.datasetId, datasetId), eq(datasetVersions.status, "ready"))).limit(1))[0];
  if (!version) throw new ApiError("NOT_FOUND", "Ready dataset version not found", 404);
  assertFieldPolicyAllowed(dataset.dataClassification, version.fieldPolicy as FieldPolicy);
  await requireFrozenRecordAccess(actorId, version.id, dataset.dataClassification);
  const token = randomBytes(32).toString("base64url");
  const share = await db.transaction(async (tx) => {
    const [created] = await tx.insert(sharedDatasets).values({
      datasetVersionId: version.id,
      tokenHash: sha256(token),
      recipientLabel: input.recipientLabel,
      accessScope: input.accessScope,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdById: actorId,
    }).returning();
    await audit({ actorId, action: "dataset.shared", entityType: "shared_dataset", entityId: created.id, afterState: { datasetVersionId: version.id, recipientLabel: input.recipientLabel, expiresAt: created.expiresAt, accessScope: created.accessScope }, metadata: { requestId } }, (values) => tx.insert(auditEvents).values(values));
    return created;
  });
  return { share: { ...share, tokenHash: undefined }, token };
}

export async function revokeDatasetShare(actorId: string, shareId: string, requestId?: string) {
  const before = (await db.select({ share: sharedDatasets, version: datasetVersions, dataset: datasets }).from(sharedDatasets)
    .innerJoin(datasetVersions, eq(sharedDatasets.datasetVersionId, datasetVersions.id))
    .innerJoin(datasets, eq(datasetVersions.datasetId, datasets.id))
    .where(eq(sharedDatasets.id, shareId)).limit(1))[0];
  if (!before) throw new ApiError("NOT_FOUND", "Dataset share not found", 404);
  if (!(await authorize({ userId: actorId, permission: "datasets.share", resource: datasetResource(before.dataset) })).allowed) throw new ApiError("FORBIDDEN", "Cannot revoke this share", 403);
  return db.transaction(async (tx) => {
    const now = new Date();
    const [after] = await tx.update(sharedDatasets).set({ status: "revoked", revokedAt: now, revokedById: actorId, updatedAt: now }).where(and(eq(sharedDatasets.id, shareId), eq(sharedDatasets.status, "active"))).returning();
    if (!after) throw new ApiError("CONFLICT", "Dataset share is already revoked", 409);
    await audit({ actorId, action: "dataset.share_revoked", entityType: "shared_dataset", entityId: shareId, beforeState: { status: before.share.status }, afterState: { status: after.status, revokedAt: after.revokedAt }, metadata: { requestId } }, (values) => tx.insert(auditEvents).values(values));
    return after;
  });
}

export async function accessSharedDataset(actorId: string, token: string, requestId?: string) {
  const row = (await db.select({ share: sharedDatasets, version: datasetVersions, dataset: datasets }).from(sharedDatasets)
    .innerJoin(datasetVersions, eq(sharedDatasets.datasetVersionId, datasetVersions.id))
    .innerJoin(datasets, eq(datasetVersions.datasetId, datasets.id))
    .where(eq(sharedDatasets.tokenHash, sha256(token))).limit(1))[0];
  if (!row || row.share.status !== "active" || (row.share.expiresAt && row.share.expiresAt <= new Date())) throw new ApiError("NOT_FOUND", "Active dataset share not found", 404);
  if (!(await authorize({ userId: actorId, permission: "datasets.download", resource: datasetResource(row.dataset) })).allowed) throw new ApiError("FORBIDDEN", "Shared dataset is outside the assigned scope", 403);
  const scope = row.share.accessScope as { userIds?: string[]; organizationIds?: string[] } | null;
  if (scope?.userIds?.length && !scope.userIds.includes(actorId)) throw new ApiError("FORBIDDEN", "Share is restricted to another recipient", 403);
  if (scope?.organizationIds?.length) {
    const actor = (await db.select({ organizationId: users.organizationId }).from(users).where(eq(users.id, actorId)).limit(1))[0];
    if (!actor?.organizationId || !scope.organizationIds.includes(actor.organizationId)) throw new ApiError("FORBIDDEN", "Share is restricted to another organization", 403);
  }
  await requireFrozenRecordAccess(actorId, row.version.id, row.dataset.dataClassification);
  assertFieldPolicyAllowed(row.dataset.dataClassification, row.version.fieldPolicy as FieldPolicy);
  await db.insert(sharedDatasetAccessLogs).values({ sharedDatasetId: row.share.id, action: "opened", actorUserId: actorId, requestId });
  return { dataset: row.dataset, version: row.version, rows: await loadDatasetRows(row.version.id, row.version.fieldPolicy as FieldPolicy) };
}

export async function shareRecord(actorId: string, recordId: string, input: RecordShare, requestId?: string) {
  const record = (await db.select().from(records).where(eq(records.id, recordId)).limit(1))[0];
  if (!record || !record.organizationId) throw new ApiError("NOT_FOUND", "Record not found", 404);
  const organizationId = record.organizationId;
  if (!(await authorize({ userId: actorId, permission: "records.share", resource: { ...recordResource(record), dataClassification: "approved_evidence" } })).allowed) throw new ApiError("FORBIDDEN", "Cannot share this record", 403);
  if (!approvedEvidenceEligible(record)) throw new ApiError("FORBIDDEN", "Only approved, privacy-cleared, research-eligible records may be shared", 403);
  assertFieldPolicyAllowed("approved_evidence", input.fieldPolicy);
  const versionId = input.recordVersionId ?? record.headVersionId;
  if (!versionId || versionId !== record.headVersionId) throw new ApiError("FORBIDDEN", "Only the current approved record version may be shared", 403);
  const version = (await db.select().from(recordVersions).where(and(
    eq(recordVersions.id, versionId),
    eq(recordVersions.recordId, record.id),
    eq(recordVersions.isSnapshot, true),
  )).limit(1))[0];
  if (!version) throw new ApiError("NOT_FOUND", "Approved record version not found", 404);

  const token = randomBytes(32).toString("base64url");
  const frozen = [{ recordId: record.id, recordVersionId: version.id }];
  const versionHash = contentHash({ frozen, fieldPolicy: input.fieldPolicy });
  return db.transaction(async (tx) => {
    const [dataset] = await tx.insert(datasets).values({
      organizationId,
      programId: record.programId,
      name: `Record ${record.id}`,
      description: "Controlled one-record share",
      dataClassification: "approved_evidence",
      selectionQuery: { recordIds: [record.id] },
      fieldPolicy: input.fieldPolicy,
      createdById: actorId,
    }).returning();
    const [buildingVersion] = await tx.insert(datasetVersions).values({
      datasetId: dataset.id,
      versionNumber: 1,
      selectionQuery: { recordIds: [record.id] },
      fieldPolicy: input.fieldPolicy,
      recordCount: 1,
      contentHash: versionHash,
      createdById: actorId,
      status: "building",
    }).returning();
    await tx.insert(datasetRecords).values({
      datasetVersionId: buildingVersion.id,
      recordId: record.id,
      recordVersionId: version.id,
      ordinal: 0,
      includedFields: input.fieldPolicy,
    });
    const [readyVersion] = await tx.update(datasetVersions).set({ status: "ready" }).where(eq(datasetVersions.id, buildingVersion.id)).returning();
    const [readyDataset] = await tx.update(datasets).set({ headVersionId: readyVersion.id, updatedAt: new Date() }).where(eq(datasets.id, dataset.id)).returning();
    const [share] = await tx.insert(sharedDatasets).values({
      datasetVersionId: readyVersion.id,
      tokenHash: sha256(token),
      recipientLabel: input.recipientLabel,
      accessScope: {},
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdById: actorId,
    }).returning();
    const writeAudit = (values: typeof auditEvents.$inferInsert) => tx.insert(auditEvents).values(values);
    await audit({ actorId, action: "dataset.created", entityType: "dataset_version", entityId: readyVersion.id, afterState: { datasetId: readyDataset.id, versionNumber: 1, recordCount: 1, contentHash: versionHash }, metadata: { requestId, singleRecordShare: true } }, writeAudit);
    await audit({ actorId, action: "dataset.shared", entityType: "shared_dataset", entityId: share.id, afterState: { datasetVersionId: readyVersion.id, recipientLabel: share.recipientLabel, expiresAt: share.expiresAt, accessScope: share.accessScope }, metadata: { requestId } }, writeAudit);
    await audit({ actorId, action: "record.shared", entityType: "record", entityId: record.id, metadata: { requestId, datasetId: readyDataset.id, datasetVersionId: readyVersion.id, shareId: share.id } }, writeAudit);
    return { dataset: readyDataset, version: readyVersion, share: { ...share, tokenHash: undefined }, token };
  });
}
