import { inArray } from "drizzle-orm";
import { concerns, records, recordVersions } from "@cnpaf/db/schema";
import { db } from "./db";
import { evaluateAuthorization, getAccessContext } from "./authorization";

export async function analyticsSummary(userId: string) {
  const allRecords = await db.select().from(records);
  const access = await getAccessContext(userId);
  const authorized = allRecords.filter((record) => evaluateAuthorization(access, "analytics.view", {
    organizationId: record.organizationId,
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
  const fieldOrigins = new Set(["field_observation", "participant_feedback"]);
  const fieldConcerns = concernRows.filter((concern) => fieldOrigins.has(concern.origin));
  const expertConcerns = concernRows.filter((concern) => concern.origin === "expert_interview");
  const literatureConcerns = concernRows.filter((concern) => concern.origin === "literature");
  const experts = new Set(expertConcerns.map((concern) => (versionById.get(concern.recordVersionId)?.attribution as { professorName?: string } | null)?.professorName).filter(Boolean));
  const publications = new Set(literatureConcerns.map((concern) => {
    const attribution = versionById.get(concern.recordVersionId)?.attribution as { url?: string; title?: string } | null;
    return attribution?.url ?? attribution?.title;
  }).filter(Boolean));
  const themeCounts = new Map<string, { origin: string; themeId: string | null; n: number }>();
  for (const concern of concernRows) {
    const key = `${concern.origin}:${concern.canonicalThemeId ?? "none"}`;
    const current = themeCounts.get(key);
    themeCounts.set(key, { origin: concern.origin, themeId: concern.canonicalThemeId, n: (current?.n ?? 0) + 1 });
  }
  const approvedField = approved.filter((record) => record.sourceKind === "field_visit" && record.headVersionId).map((record) => {
    const version = versionById.get(record.headVersionId!);
    return { siteId: record.siteId, activityDefinitionId: record.activityDefinitionId, week: version?.submittedAt ?? null, quantitative: version?.quantitative ?? {} };
  });
  const fieldRecords = approved.filter((record) => fieldConcerns.some((concern) => concern.recordId === record.id));
  const started = authorized.filter((record) => record.sourceKind === "field_visit").length;
  const submitted = authorized.filter((record) => record.sourceKind === "field_visit" && ["pending", "approved", "needs_completion"].includes(record.reviewStatus)).length;
  return {
    fieldSignal: { observations: fieldConcerns.length, visits: new Set(fieldRecords.map((record) => record.visitId).filter(Boolean)).size, sites: new Set(fieldRecords.map((record) => record.siteId).filter(Boolean)).size },
    expertSignal: { experts: experts.size, concerns: expertConcerns.length },
    literatureSupport: { publications: publications.size, concerns: literatureConcerns.length },
    themesByOrigin: [...themeCounts.values()],
    quantitative: approvedField,
    submissionCompletion: { submitted, started, rate: started ? submitted / started : 0 },
    scopeApplied: true,
    authorizedRecordCount: authorized.length,
  };
}
