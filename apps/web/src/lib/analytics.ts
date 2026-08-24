import { inArray } from "drizzle-orm";
import { concerns, records, recordVersions } from "@cnpaf/db/schema";
import { db } from "./db";
import { evaluateAuthorization, getAccessContext } from "./authorization";

export async function analyticsSummary(userId: string) {
  const allRecords = await db.select().from(records);
  const access = await getAccessContext(userId);
  const authorized = allRecords.filter((record) => evaluateAuthorization(access, "analytics.view", {
    organizationId: record.organizationId,
    programId: record.programId,
    siteId: record.siteId,
    serviceKey: record.sourceKind,
    researchUse: record.researchUseStatus,
  }).allowed);
  const approved = authorized.filter((record) => record.reviewStatus === "approved");
  const approvedIds = approved.map((record) => record.id);
  const concernRows = approvedIds.length ? await db.select().from(concerns).where(inArray(concerns.recordId, approvedIds)) : [];
  const versionIds = [...new Set([
    ...concernRows.map((concern) => concern.recordVersionId),
    ...(approved.map((record) => record.headVersionId).filter(Boolean) as string[]),
  ])];
  const versions = versionIds.length ? await db.select().from(recordVersions).where(inArray(recordVersions.id, versionIds)) : [];
  const versionById = new Map(versions.map((version) => [version.id, version]));
  const themeCounts = new Map<string, { origin: string; themeId: string | null; n: number }>();
  for (const concern of concernRows) {
    const key = `${concern.origin}:${concern.canonicalThemeId ?? "none"}`;
    const current = themeCounts.get(key);
    themeCounts.set(key, { origin: concern.origin, themeId: concern.canonicalThemeId, n: (current?.n ?? 0) + 1 });
  }
  const quantitative = approved.filter((record) => record.headVersionId).map((record) => {
    const version = versionById.get(record.headVersionId!);
    return { recordId: record.id, sourceKind: record.sourceKind, programId: record.programId, siteId: record.siteId, templateVersionId: version?.templateVersionId ?? null, occurredAt: version?.occurredAt ?? null, quantitative: version?.quantitative ?? {} };
  });
  const bySource = new Map<string, { sourceKind: string; started: number; submitted: number; approved: number }>();
  for (const record of authorized) {
    const current = bySource.get(record.sourceKind) ?? { sourceKind: record.sourceKind, started: 0, submitted: 0, approved: 0 };
    current.started += 1;
    if (["pending", "approved", "needs_completion"].includes(record.reviewStatus)) current.submitted += 1;
    if (record.reviewStatus === "approved") current.approved += 1;
    bySource.set(record.sourceKind, current);
  }
  const concernsByOrigin = new Map<string, number>();
  const referencesByOrigin = new Map<string, Set<string>>();
  for (const concern of concernRows) {
    concernsByOrigin.set(concern.origin, (concernsByOrigin.get(concern.origin) ?? 0) + 1);
    const attribution = versionById.get(concern.recordVersionId)?.attribution as Record<string, unknown> | null;
    const reference = attribution?.url ?? attribution?.title ?? attribution?.professorName ?? attribution?.affiliation;
    if (reference) referencesByOrigin.set(concern.origin, new Set([...(referencesByOrigin.get(concern.origin) ?? []), String(reference)]));
  }
  const completionBySourceKind = [...bySource.values()].map((summary) => ({ ...summary, rate: summary.started ? summary.submitted / summary.started : 0 }));
  return {
    recordsBySourceKind: [...bySource.values()],
    concernsByOrigin: [...concernsByOrigin].map(([origin, count]) => ({ origin, count, uniqueReferences: referencesByOrigin.get(origin)?.size ?? 0 })),
    themesByOrigin: [...themeCounts.values()],
    quantitative,
    completionBySourceKind,
    scopeApplied: true,
    authorizedRecordCount: authorized.length,
  };
}
