import { desc, eq } from "drizzle-orm";
import {
  aiFindings,
  aiRuns,
  annotations,
  canonicalThemes,
  concerns,
  records,
  recordVersions,
  reviewDecisions,
  themeMappings,
} from "@cnpaf/db/schema";
import type { ReviewBody } from "@cnpaf/shared";
import { db } from "./db";
import { audit } from "./audit";
import type { SessionUser } from "./session";

export async function applyReview(user: SessionUser, recordId: string, body: ReviewBody) {
  const record = (await db.select().from(records).where(eq(records.id, recordId)).limit(1))[0];
  if (!record || !record.headVersionId) throw new Error("Record not found");
  const version = (
    await db.select().from(recordVersions).where(eq(recordVersions.id, record.headVersionId)).limit(1)
  )[0];
  if (!version) throw new Error("Version not found");

  const [decision] = await db
    .insert(reviewDecisions)
    .values({
      recordId,
      recordVersionId: version.id,
      reviewerId: user.id,
      action: body.action,
      annotation: body.annotation ?? null,
      findingDecisions: body.findings,
    })
    .returning();

  if (body.annotation) {
    await db.insert(annotations).values({
      recordId,
      recordVersionId: version.id,
      authorId: user.id,
      body: body.annotation,
      visibleToVolunteer: true,
    });
  }

  if (body.action === "needs_completion") {
    await db
      .update(records)
      .set({
        reviewStatus: "needs_completion",
        recordStatus: "draft",
        updatedAt: new Date(),
      })
      .where(eq(records.id, recordId));
    await audit({
      actorId: user.id,
      action: "reject",
      entityType: "record",
      entityId: recordId,
      metadata: { decisionId: decision.id },
    });
    return { decision };
  }

  const run = (
    await db.select().from(aiRuns).where(eq(aiRuns.recordVersionId, version.id)).limit(1)
  )[0];
  const findings = run
    ? await db.select().from(aiFindings).where(eq(aiFindings.aiRunId, run.id))
    : [];
  const findingById = new Map(findings.map((f) => [f.id, f]));
  const themes = await db.select().from(canonicalThemes);

  for (const item of body.findings) {
    const finding = findingById.get(item.findingId);
    if (!finding) continue;
    if (item.decision === "reject") continue;

    const statement =
      item.decision === "edit" && item.editedStatement ? item.editedStatement : finding.statement;
    const themeId = item.canonicalThemeId ?? finding.suggestedCanonicalThemeId;
    const origin = item.origin ?? finding.origin ?? "field_observation";

    if (finding.kind === "theme" && finding.suggestedRawLabel && themeId) {
      await db.insert(themeMappings).values({
        rawLabel: finding.suggestedRawLabel,
        canonicalThemeId: themeId,
        confidence: finding.confidence,
        approvedById: user.id,
        reviewDecisionId: decision.id,
        status: "approved",
      });
    }

    if (finding.kind === "concern") {
      await db.insert(concerns).values({
        recordId,
        recordVersionId: version.id,
        aiFindingId: finding.id,
        statement,
        canonicalThemeId: themeId,
        origin,
        evidence: finding.evidence,
        reviewStatus: "approved",
        aiConfidence: finding.confidence,
      });
    }
  }

  await db
    .update(records)
    .set({ reviewStatus: "approved", updatedAt: new Date() })
    .where(eq(records.id, recordId));

  await audit({
    actorId: user.id,
    action: "approve",
    entityType: "record",
    entityId: recordId,
    metadata: { decisionId: decision.id, unusedThemes: themes.length },
  });

  return { decision };
}

export async function reviewQueue() {
  return db
    .select()
    .from(records)
    .where(eq(records.reviewStatus, "pending"))
    .orderBy(desc(records.updatedAt));
}
