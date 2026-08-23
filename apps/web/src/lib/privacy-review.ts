import { desc, eq } from "drizzle-orm";
import { privacyFlags, recordCustomEntries, records, recordStructuredSelections, recordVersions } from "@cnpaf/db/schema";
import type { z } from "zod";
import type { privacyResolveBodySchema } from "@cnpaf/shared";
import { db } from "./db";
import { getAccessContext, evaluateAuthorization } from "./authorization";
import { enqueueAnalyze } from "./jobs";
import { contentHash } from "./crypto";
import { audit } from "./audit";

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
  if (!row) throw new Error("Privacy flag not found");
  if (row.flag.status !== "open") throw new Error("Privacy flag is already resolved");

  if (input.body.resolution === "dismissed") {
    const [flag] = await db.update(privacyFlags).set({
      status: "dismissed",
      resolution: "dismissed",
      resolvedById: input.actorId,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(privacyFlags.id, input.flagId)).returning();
    await audit({ actorId: input.actorId, action: "privacy.dismissed", entityType: "privacy_flag", entityId: input.flagId, beforeState: row.flag, afterState: flag, reason: input.body.notes ?? null });
    return { flag, recordVersion: row.version, queuedForAi: false };
  }

  const safeText = input.body.resolution === "redacted" ? input.body.redactedText?.trim() : row.version.qualitative;
  if (!safeText) throw new Error("redactedText is required for a redacted resolution");
  const latest = (await db.select().from(recordVersions).where(eq(recordVersions.recordId, row.record.id)).orderBy(desc(recordVersions.versionNumber)).limit(1))[0];
  const [structured, custom] = await Promise.all([
    db.select().from(recordStructuredSelections).where(eq(recordStructuredSelections.recordVersionId, row.version.id)),
    db.select().from(recordCustomEntries).where(eq(recordCustomEntries.recordVersionId, row.version.id)),
  ]);
  const result = await db.transaction(async (tx) => {
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
    }).where(eq(privacyFlags.id, input.flagId)).returning();
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
    await tx.update(records).set({
      headVersionId: version.id,
      privacyStatus: input.body.resolution,
      aiStatus: "queued",
      updatedAt: new Date(),
    }).where(eq(records.id, row.record.id));
    return { flag, version };
  });
  await enqueueAnalyze(result.version.id, `privacy-clearance:${result.version.id}`);
  await audit({ actorId: input.actorId, action: `privacy.${input.body.resolution}`, entityType: "privacy_flag", entityId: input.flagId, beforeState: row.flag, afterState: result.flag, reason: input.body.notes ?? null, metadata: { clearedRecordVersionId: result.version.id } });
  return { flag: result.flag, recordVersion: result.version, queuedForAi: true };
}
