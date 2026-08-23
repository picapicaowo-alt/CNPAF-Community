import { and, eq, sql } from "drizzle-orm";
import { concerns, records, recordVersions } from "@cnpaf/db/schema";
import { db } from "./db";

export async function analyticsSummary() {
  const field = await db
    .select({
      observations: sql<number>`count(*)::int`,
      visits: sql<number>`count(distinct ${records.visitId})::int`,
      sites: sql<number>`count(distinct ${records.siteId})::int`,
    })
    .from(concerns)
    .innerJoin(records, eq(concerns.recordId, records.id))
    .where(
      and(
        eq(records.reviewStatus, "approved"),
        sql`${concerns.origin} in ('field_observation','participant_feedback')`,
      ),
    );

  const expert = await db
    .select({
      experts: sql<number>`count(distinct ${recordVersions.attribution}->>'professorName')::int`,
      concerns: sql<number>`count(*)::int`,
    })
    .from(concerns)
    .innerJoin(records, eq(concerns.recordId, records.id))
    .innerJoin(recordVersions, eq(concerns.recordVersionId, recordVersions.id))
    .where(and(eq(records.reviewStatus, "approved"), eq(concerns.origin, "expert_interview")));

  const literature = await db
    .select({
      publications: sql<number>`count(distinct coalesce(${recordVersions.attribution}->>'url', ${recordVersions.attribution}->>'title'))::int`,
      concerns: sql<number>`count(*)::int`,
    })
    .from(concerns)
    .innerJoin(records, eq(concerns.recordId, records.id))
    .innerJoin(recordVersions, eq(concerns.recordVersionId, recordVersions.id))
    .where(and(eq(records.reviewStatus, "approved"), eq(concerns.origin, "literature")));

  const themes = await db
    .select({
      origin: concerns.origin,
      themeId: concerns.canonicalThemeId,
      n: sql<number>`count(*)::int`,
    })
    .from(concerns)
    .innerJoin(records, eq(concerns.recordId, records.id))
    .where(eq(records.reviewStatus, "approved"))
    .groupBy(concerns.origin, concerns.canonicalThemeId);

  const approvedField = await db
    .select({
      siteId: records.siteId,
      activityDefinitionId: records.activityDefinitionId,
      quantitative: recordVersions.quantitative,
      submittedAt: recordVersions.submittedAt,
    })
    .from(records)
    .innerJoin(recordVersions, eq(recordVersions.id, records.headVersionId))
    .where(and(eq(records.reviewStatus, "approved"), eq(records.sourceKind, "field_visit")));

  const quantitative = approvedField.map((row) => ({
    siteId: row.siteId,
    activityDefinitionId: row.activityDefinitionId,
    week: row.submittedAt,
    quantitative: row.quantitative,
  }));

  const started = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(records)
    .where(eq(records.sourceKind, "field_visit"));
  const submitted = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(records)
    .where(
      and(
        eq(records.sourceKind, "field_visit"),
        sql`${records.reviewStatus} in ('pending','approved','needs_completion')`,
      ),
    );

  const startN = started[0]?.n ?? 0;
  const submittedN = submitted[0]?.n ?? 0;

  return {
    fieldSignal: {
      observations: field[0]?.observations ?? 0,
      visits: field[0]?.visits ?? 0,
      sites: field[0]?.sites ?? 0,
    },
    expertSignal: {
      experts: expert[0]?.experts ?? 0,
      concerns: expert[0]?.concerns ?? 0,
    },
    literatureSupport: {
      publications: literature[0]?.publications ?? 0,
      concerns: literature[0]?.concerns ?? 0,
    },
    themesByOrigin: themes,
    quantitative,
    submissionCompletion: {
      submitted: submittedN,
      started: startN,
      rate: startN ? submittedN / startN : 0,
    },
  };
}
