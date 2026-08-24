import { and, desc, eq, sql } from "drizzle-orm";
import { auditEvents, privacyFlags, recordCustomEntries, records, recordStructuredSelections, recordVersions } from "@cnpaf/db/schema";
import type { z } from "zod";
import type { privacyResolveBodySchema } from "@cnpaf/shared";
import { db } from "./db";
import { getAccessContext, evaluateAuthorization } from "./authorization";
import { enqueueAnalyze } from "./jobs";
import { contentHash } from "./crypto";
import { audit } from "./audit";
import { ApiError } from "./api-error";

type PrivacyResolution = z.infer<typeof privacyResolveBodySchema>;

export async function listPrivacyQueue(userId: string) {
  const rows = await db
    .select({ flag: privacyFlags, record: records })
    .from(privacyFlags)
    .innerJoin(records, eq(privacyFlags.recordId, records.id))
    .orderBy(desc(privacyFlags.createdAt));
  const context = await getAccessContext(userId);
  return rows.filter(({ record }) =>
    evaluateAuthorization(context, "privacy.view", {
      organizationId: record.organizationId,
      programId: record.programId,
      siteId: record.siteId,
      serviceKey: record.sourceKind,
      researchUse: record.researchUseStatus,
    }).allowed,
  );
}

export async function resolvePrivacyFlag(input: {
  flagId: string;
  actorId: string;
  body: PrivacyResolution;
}) {
  const row = (await db
    .select({ flag: privacyFlags, record: records, version: recordVersions })
    .from(privacyFlags)
    .innerJoin(records, eq(privacyFlags.recordId, records.id))
    .innerJoin(recordVersions, eq(privacyFlags.recordVersionId, recordVersions.id))
    .where(eq(privacyFlags.id, input.flagId))
    .limit(1))[0];
  if (!row) throw new ApiError("NOT_FOUND", "Privacy flag not found", 404);
  const access = await getAccessContext(input.actorId);
  if (!evaluateAuthorization(access, "privacy.resolve", {
    organizationId: row.record.organizationId,
    programId: row.record.programId,
    siteId: row.record.siteId,
    serviceKey: row.record.sourceKind,
    researchUse: row.record.researchUseStatus,
  }).allowed) throw new ApiError("FORBIDDEN", "Privacy flag is outside the assigned scope", 403);
  if (row.flag.status !== "open") throw new ApiError("INVALID_TRANSITION", "Privacy flag is already resolved", 409);

  if (input.body.resolution === "dismissed") {
    const dismissed = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from records where id = ${row.record.id} for update`);
      const [flag] = await tx.update(privacyFlags).set({
        status: "dismissed",
        resolution: "dismissed",
        resolvedById: input.actorId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(eq(privacyFlags.id, input.flagId), eq(privacyFlags.status, "open"))).returning();
      if (!flag) throw new ApiError("CONFLICT", "Privacy flag changed concurrently", 409);
      const [updatedRecord] = await tx.update(records).set({ privacyStatus: "clear", aiStatus: "queued", updatedAt: new Date() })
        .where(and(eq(records.id, row.record.id), eq(records.headVersionId, row.version.id))).returning();
      if (!updatedRecord) throw new ApiError("CONFLICT", "Record changed concurrently", 409);
      await audit({ actorId: input.actorId, action: "privacy.dismissed", entityType: "privacy_flag", entityId: input.flagId, beforeState: row.flag, afterState: flag, reason: input.body.notes ?? null }, (values) => tx.insert(auditEvents).values(values));
      return flag;
    });
    await enqueueAnalyze(row.version.id, `privacy-dismissed:${row.version.id}`);
    return { flag: dismissed, recordVersion: row.version, queuedForAi: true };
  }

  const safeText = input.body.resolution === "redacted" ? input.body.redactedText?.trim() : row.version.qualitative;
  if (!safeText) throw new ApiError("BAD_REQUEST", "redactedText is required for a redacted resolution", 400);
  const [structured, custom] = await Promise.all([
    db.select().from(recordStructuredSelections).where(eq(recordStructuredSelections.recordVersionId, row.version.id)),
    db.select().from(recordCustomEntries).where(eq(recordCustomEntries.recordVersionId, row.version.id)),
  ]);
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from records where id = ${row.record.id} for update`);
    const currentRecord = (await tx.select().from(records).where(eq(records.id, row.record.id)).limit(1))[0];
    const currentFlag = (await tx.select().from(privacyFlags).where(eq(privacyFlags.id, input.flagId)).limit(1))[0];
    if (!currentRecord || currentRecord.headVersionId !== row.version.id || currentFlag?.status !== "open") {
      throw new ApiError("CONFLICT", "Record or privacy flag changed concurrently", 409);
    }
    const latest = (await tx.select().from(recordVersions).where(eq(recordVersions.recordId, row.record.id)).orderBy(desc(recordVersions.versionNumber)).limit(1))[0];
    let [version] = await tx.insert(recordVersions).values({
      recordId: row.record.id,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      occurredAt: row.version.occurredAt,
      submittedAt: new Date(),
      submittedById: input.actorId,
      activityDefinitionId: row.version.activityDefinitionId,
      templateVersionId: row.version.templateVersionId,
      quantitative: row.version.quantitative,
      quantitativeMissing: row.version.quantitativeMissing,
      qualitative: safeText,
      attribution: row.version.attribution,
      piiAttestation: row.version.piiAttestation,
      contentLanguage: row.version.contentLanguage,
      contentHash: contentHash({ qualitative: safeText, quantitative: row.version.quantitative, attribution: row.version.attribution }),
      localVersion: row.version.localVersion,
      serverVersion: row.version.serverVersion + 1,
      isSnapshot: false,
    }).returning();
    if (structured.length) await tx.insert(recordStructuredSelections).values(structured.map((selection) => ({ recordVersionId: version.id, templateFieldId: selection.templateFieldId, optionId: selection.optionId, value: selection.value })));
    if (custom.length) await tx.insert(recordCustomEntries).values(custom.map((entry) => ({ recordVersionId: version.id, templateFieldId: entry.templateFieldId, categoryId: entry.categoryId, customText: entry.customText, mappingStatus: "pending" })));
    [version] = await tx.update(recordVersions).set({ isSnapshot: true, updatedAt: new Date() }).where(eq(recordVersions.id, version.id)).returning();
    const [flag] = await tx.update(privacyFlags).set({
      status: "resolved",
      resolution: input.body.resolution,
      redactedText: safeText,
      resolvedById: input.actorId,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(privacyFlags.id, input.flagId), eq(privacyFlags.status, "open"))).returning();
    if (!flag) throw new ApiError("CONFLICT", "Privacy flag changed concurrently", 409);
    await tx.insert(privacyFlags).values({
      recordId: row.record.id,
      recordVersionId: version.id,
      status: "resolved",
      hits: row.flag.hits,
      redactedText: safeText,
      resolution: input.body.resolution,
      resolvedById: input.actorId,
      resolvedAt: new Date(),
    });
    const [updatedRecord] = await tx.update(records).set({
      headVersionId: version.id,
      privacyStatus: input.body.resolution,
      aiStatus: "queued",
      updatedAt: new Date(),
    }).where(and(eq(records.id, row.record.id), eq(records.headVersionId, row.version.id))).returning();
    if (!updatedRecord) throw new ApiError("CONFLICT", "Record changed concurrently", 409);
    await audit({ actorId: input.actorId, action: `privacy.${input.body.resolution}`, entityType: "privacy_flag", entityId: input.flagId, beforeState: row.flag, afterState: flag, reason: input.body.notes ?? null, metadata: { clearedRecordVersionId: version.id } }, (values) => tx.insert(auditEvents).values(values));
    return { flag, version };
  });
  await enqueueAnalyze(result.version.id, `privacy-clearance:${result.version.id}`);
  return { flag: result.flag, recordVersion: result.version, queuedForAi: true };
}
