import { and, eq, inArray } from "drizzle-orm";
import { canonicalThemes, concerns, records, recordVersions } from "@cnpaf/db/schema";
import { db } from "./db";
import { evaluateAuthorization, getAccessContext } from "./authorization";

const PSYCHOLOGICAL_CONCERN_TERMS = /lonely|loneliness|isolation|social connection|grief|loss|mood|anxiety|depress|attention|cognitive|engagement|孤独|社交|社会连接|哀伤|失落|情绪|焦虑|抑郁|注意力|认知|参与感/i;

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
  const concernRows = approvedIds.length
    ? await db.select().from(concerns).where(and(
        inArray(concerns.recordId, approvedIds),
        eq(concerns.reviewStatus, "approved"),
      ))
    : [];
  const versionIds = [...new Set([
    ...concernRows.map((concern) => concern.recordVersionId),
    ...(approved.map((record) => record.headVersionId).filter(Boolean) as string[]),
  ])];
  const versions = versionIds.length ? await db.select().from(recordVersions).where(inArray(recordVersions.id, versionIds)) : [];
  const versionById = new Map(versions.map((version) => [version.id, version]));
  const themeIds = [...new Set(concernRows.flatMap((concern) => concern.canonicalThemeId ? [concern.canonicalThemeId] : []))];
  const themeRows = themeIds.length
    ? await db.select().from(canonicalThemes).where(inArray(canonicalThemes.id, themeIds))
    : [];
  const themeById = new Map(themeRows.map((theme) => [theme.id, theme]));
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
  const groupedConcerns = new Map<string, typeof concernRows>();
  for (const concern of concernRows) {
    const key = concern.canonicalThemeId ?? concern.statement.trim().toLocaleLowerCase();
    groupedConcerns.set(key, [...(groupedConcerns.get(key) ?? []), concern]);
  }
  const leadingConcernGroup = [...groupedConcerns.values()].sort((left, right) => {
    const groupText = (group: typeof concernRows) => group.map((concern) => {
      const theme = concern.canonicalThemeId ? themeById.get(concern.canonicalThemeId) : null;
      return `${theme?.nameZh ?? ""} ${theme?.nameEn ?? ""} ${theme?.definition ?? ""} ${concern.statement}`;
    }).join(" ");
    const priorityDifference = Number(PSYCHOLOGICAL_CONCERN_TERMS.test(groupText(right)))
      - Number(PSYCHOLOGICAL_CONCERN_TERMS.test(groupText(left)));
    return priorityDifference || right.length - left.length;
  })[0] ?? [];
  const leadingConcern = leadingConcernGroup[0] ?? null;
  const leadingTheme = leadingConcern?.canonicalThemeId
    ? themeById.get(leadingConcern.canonicalThemeId) ?? null
    : null;
  const latestSignal = [...concernRows].sort(
    (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
  )[0] ?? null;
  const latestSignalTheme = latestSignal?.canonicalThemeId
    ? themeById.get(latestSignal.canonicalThemeId) ?? null
    : null;
  const leadingRecordIds = new Set(leadingConcernGroup.map((concern) => concern.recordId));
  const leadingSiteCount = new Set(
    approved.flatMap((record) => leadingRecordIds.has(record.id) && record.siteId ? [record.siteId] : []),
  ).size;
  return {
    recordsBySourceKind: [...bySource.values()],
    concernsByOrigin: [...concernsByOrigin].map(([origin, count]) => ({ origin, count, uniqueReferences: referencesByOrigin.get(origin)?.size ?? 0 })),
    themesByOrigin: [...themeCounts.values()],
    quantitative,
    completionBySourceKind,
    scopeApplied: true,
    authorizedRecordCount: authorized.length,
    dataHealth: {
      approvedRecordCount: approved.length,
      activeSiteCount: new Set(authorized.flatMap((record) => record.siteId ? [record.siteId] : [])).size,
      activeSourceCount: bySource.size,
    },
    fieldInsight: {
      recentSignal: latestSignal ? {
        statement: latestSignal.statement,
        titleZh: latestSignalTheme?.nameZh ?? "待分类一线信号",
        titleEn: latestSignalTheme?.nameEn ?? "Unclassified field signal",
        evidenceCount: concernRows.length,
        signalCount: new Set(concernRows.map((concern) => concern.statement.trim().toLocaleLowerCase())).size,
      } : null,
      leadingConcern: leadingConcern ? {
        statement: leadingConcern.statement,
        titleZh: leadingTheme?.nameZh ?? "待分类心理关注",
        titleEn: leadingTheme?.nameEn ?? "Unclassified psychological concern",
        evidenceCount: leadingConcernGroup.length,
        recordCount: leadingRecordIds.size,
        siteCount: leadingSiteCount,
      } : null,
      concernCount: groupedConcerns.size,
    },
  };
}
