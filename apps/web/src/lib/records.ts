import { desc, eq } from "drizzle-orm";
import {
  activityDefinitions,
  annotations,
  records,
  recordVersions,
  visits,
} from "@cnpaf/db/schema";
import {
  getSourceKindHandler,
  type DraftBody,
  type SubmitBody,
} from "@cnpaf/shared";
import { db } from "./db";
import { audit } from "./audit";
import { contentHash } from "./crypto";
import { enqueueAnalyze } from "./jobs";
import { scanPrivacy } from "./pii";
import type { SessionUser } from "./session";

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

export async function upsertDraft(user: SessionUser, body: DraftBody) {
  const handler = getSourceKindHandler(body.sourceKind);
  if (!handler) throw new Error("Unknown sourceKind");

  let record = await loadRecordByClient(body.clientRecordId);
  if (record && record.createdById !== user.id && user.role === "volunteer") {
    throw new Error("Forbidden");
  }

  if (
    record &&
    record.recordStatus === "submitted" &&
    record.reviewStatus !== "needs_completion"
  ) {
    return { record, conflict: false, immutable: true };
  }

  if (!record) {
    const [created] = await db
      .insert(records)
      .values({
        clientRecordId: body.clientRecordId,
        sourceKind: body.sourceKind,
        createdById: user.id,
        organizationId: user.organizationId,
        siteId: body.siteId ?? null,
        visitId: body.visitId ?? null,
        activityDefinitionId: body.activityDefinitionId ?? null,
        collectionPurpose: "operational",
        researchUseStatus: "not_assessed",
        recordStatus: "draft",
        reviewStatus: "not_submitted",
      })
      .onConflictDoNothing({ target: records.clientRecordId })
      .returning();
    record = created ?? (await loadRecordByClient(body.clientRecordId));
  }

  if (!record) throw new Error("Could not create record");

  const allVersions = await db
    .select()
    .from(recordVersions)
    .where(eq(recordVersions.recordId, record.id))
    .orderBy(desc(recordVersions.versionNumber));
  const head = allVersions[0];
  let draft = head && !head.isSnapshot ? head : undefined;
  if (!draft && record.reviewStatus === "needs_completion") {
    draft = undefined;
  }
  if (draft && body.localVersion < draft.localVersion) {
    return { record, draft, conflict: true, immutable: false };
  }

  const payload = {
    qualitative: body.qualitative,
    quantitative: body.quantitative,
    attribution: body.attribution,
    activityDefinitionId: body.activityDefinitionId ?? null,
    contentLanguage: body.contentLanguage,
    localVersion: body.localVersion,
    serverVersion: (draft?.serverVersion ?? 0) + 1,
    submittedById: user.id,
    isSnapshot: false,
  };

  if (!draft) {
    const nextNumber = (head?.versionNumber ?? 0) + 1;
    const [created] = await db
      .insert(recordVersions)
      .values({
        recordId: record.id,
        versionNumber: nextNumber || 1,
        ...payload,
      })
      .returning();
    draft = created;
  } else {
    const [updated] = await db
      .update(recordVersions)
      .set({ ...payload, updatedAt: new Date() })
      .where(eq(recordVersions.id, draft.id))
      .returning();
    draft = updated;
  }

  await db
    .update(records)
    .set({
      sourceKind: body.sourceKind,
      siteId: body.siteId ?? record.siteId,
      activityDefinitionId: body.activityDefinitionId ?? record.activityDefinitionId,
      headVersionId: draft.id,
      updatedAt: new Date(),
    })
    .where(eq(records.id, record.id));

  return { record, draft, conflict: false, immutable: false };
}

export async function submitRecord(user: SessionUser, body: SubmitBody) {
  const handler = getSourceKindHandler(body.sourceKind);
  if (!handler) throw new Error("Unknown sourceKind");

  const attrErrors = handler.validateAttribution(body.attribution ?? {});
  if (attrErrors.length) throw new Error(attrErrors.join("; "));
  if (handler.requiresPiiAttestation && !body.piiAttestation) {
    throw new Error("De-identification attestation is required for field visits");
  }
  if (handler.requiresSite && !body.siteId) throw new Error("Site is required");
  if (handler.requiresActivity && !body.activityDefinitionId) throw new Error("Activity is required");
  if (!body.qualitative.trim()) throw new Error("Qualitative notes are required");

  const existing = body.idempotencyKey
    ? (
        await db
          .select()
          .from(recordVersions)
          .where(eq(recordVersions.idempotencyKey, body.idempotencyKey))
          .limit(1)
      )[0]
    : null;
  if (existing?.isSnapshot) {
    const record = (await db.select().from(records).where(eq(records.id, existing.recordId)).limit(1))[0];
    return { record, version: existing, duplicate: true };
  }

  const { record } = await upsertDraft(user, body);
  if (!record) throw new Error("Missing record");

  let visitId = body.visitId ?? record.visitId;
  if (handler.requiresVisit && body.siteId) {
    const [visit] = await db
      .insert(visits)
      .values({
        siteId: body.siteId,
        activityDefinitionId: body.activityDefinitionId ?? null,
        conductedById: user.id,
        submittedAt: new Date(),
      })
      .returning();
    visitId = visit.id;
  }

  const latest = (
    await db
      .select()
      .from(recordVersions)
      .where(eq(recordVersions.recordId, record.id))
      .orderBy(desc(recordVersions.versionNumber))
      .limit(1)
  )[0];

  const nextNumber = (latest?.versionNumber ?? 0) + (latest?.isSnapshot ? 1 : 0);
  const snapshotNumber = latest && !latest.isSnapshot ? latest.versionNumber : nextNumber || 1;

  const hash = contentHash({
    qualitative: body.qualitative,
    quantitative: body.quantitative,
    attribution: body.attribution,
  });

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

  const snapshotValues = {
    qualitative: body.qualitative,
    quantitative: body.quantitative,
    quantitativeMissing: body.quantitative,
    attribution: body.attribution,
    activityDefinitionId: body.activityDefinitionId ?? null,
    piiAttestation: body.piiAttestation,
    contentLanguage: body.contentLanguage,
    contentHash: hash,
    localVersion: body.localVersion,
    submittedAt: new Date(),
    submittedById: user.id,
    idempotencyKey: body.idempotencyKey,
    isSnapshot: true,
  };

  let version;
  if (latest && !latest.isSnapshot) {
    [version] = await db
      .update(recordVersions)
      .set({ ...snapshotValues, updatedAt: new Date() })
      .where(eq(recordVersions.id, latest.id))
      .returning();
  } else {
    [version] = await db
      .insert(recordVersions)
      .values({
        recordId: record.id,
        versionNumber: snapshotNumber === 0 ? 1 : snapshotNumber,
        ...snapshotValues,
      })
      .returning();
  }

  const scan = scanPrivacy({
    sourceKind: body.sourceKind,
    qualitative: body.qualitative,
    attribution: body.attribution ?? {},
  });

  const aiStatus = scan.status === "flagged" ? "skipped_privacy" : "queued";

  await db
    .update(records)
    .set({
      recordStatus: "submitted",
      reviewStatus: "pending",
      privacyStatus: scan.status,
      aiStatus,
      visitId,
      siteId: body.siteId ?? record.siteId,
      activityDefinitionId: body.activityDefinitionId ?? record.activityDefinitionId,
      headVersionId: version.id,
      completenessScore: completeness(body.quantitative, fieldCount),
      updatedAt: new Date(),
    })
    .where(eq(records.id, record.id));

  await audit({
    actorId: user.id,
    action: "submit",
    entityType: "record",
    entityId: record.id,
    metadata: { versionId: version.id, privacy: scan.status },
  });

  if (scan.status !== "flagged") {
    await enqueueAnalyze(version.id);
  }

  return { record, version, duplicate: false, privacy: scan };
}

export async function listRecordsForUser(user: SessionUser) {
  if (user.role === "volunteer") {
    return db
      .select()
      .from(records)
      .where(eq(records.createdById, user.id))
      .orderBy(desc(records.updatedAt));
  }
  return db.select().from(records).orderBy(desc(records.updatedAt));
}

export async function getRecordBundle(id: string, user: SessionUser) {
  const record = (await db.select().from(records).where(eq(records.id, id)).limit(1))[0];
  if (!record) return null;
  if (user.role === "volunteer" && record.createdById !== user.id) return null;
  const versions = await db
    .select()
    .from(recordVersions)
    .where(eq(recordVersions.recordId, id))
    .orderBy(desc(recordVersions.versionNumber));
  const notes = await db.select().from(annotations).where(eq(annotations.recordId, id));
  return { record, versions, notes };
}
