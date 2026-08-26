import { desc, eq, inArray } from "drizzle-orm";
import {
  aiRuns,
  approvedFindings,
  records,
  recordVersions,
  reportArtifacts,
  reportEvidenceLinks,
  reportRuns,
  reportTemplateVersions,
  reportTemplates,
} from "@cnpaf/db/schema";
import type { z } from "zod";
import type { reportRunBodySchema } from "@cnpaf/shared";
import { db } from "./db";
import { evaluateAuthorization, getAccessContext } from "./authorization";
import { audit } from "./audit";
import { executeConfiguredWorkflow } from "./ai";
import { matchesEvidenceFilters } from "./evidence-filters";

type ReportRunInput = z.infer<typeof reportRunBodySchema>;

export async function listReportTemplates() {
  const [templates, versions] = await Promise.all([
    db.select().from(reportTemplates).orderBy(desc(reportTemplates.updatedAt)),
    db.select().from(reportTemplateVersions).orderBy(desc(reportTemplateVersions.version)),
  ]);
  return templates.map((template) => ({ template, versions: versions.filter((version) => version.reportTemplateId === template.id) }));
}

export async function createReportTemplate(input: z.infer<typeof import("@cnpaf/shared").reportTemplateBodySchema>, actorId: string) {
  const result = await db.transaction(async (tx) => {
    const [template] = await tx.insert(reportTemplates).values({ ...input, createdById: actorId }).returning();
    const [version] = await tx.insert(reportTemplateVersions).values({ reportTemplateId: template.id, version: 1, createdById: actorId }).returning();
    return { template, version };
  });
  await audit({ actorId, action: "report_template.created", entityType: "report_template", entityId: result.template.id, afterState: result });
  return result;
}

export async function createReportTemplateVersion(templateId: string, input: z.infer<typeof import("@cnpaf/shared").reportTemplateVersionBodySchema>, actorId: string) {
  const existing = await db.select().from(reportTemplateVersions).where(eq(reportTemplateVersions.reportTemplateId, templateId)).orderBy(desc(reportTemplateVersions.version));
  if (!existing.length) throw new Error("Report template not found");
  const source = input.fromVersionId ? existing.find((version) => version.id === input.fromVersionId) : existing[0];
  if (!source) throw new Error("Source report template version not found");
  const [version] = await db.insert(reportTemplateVersions).values({
    reportTemplateId: templateId,
    version: existing[0].version + 1,
    sections: input.sections.length ? input.sections : source.sections,
    configuration: Object.keys(input.configuration).length ? input.configuration : source.configuration,
    createdById: actorId,
  }).returning();
  await audit({ actorId, action: "report_template_version.created", entityType: "report_template_version", entityId: version.id, afterState: version });
  return version;
}

export async function updateReportTemplateVersion(id: string, input: z.infer<typeof import("@cnpaf/shared").reportTemplateVersionUpdateBodySchema>, actorId: string) {
  const current = (await db.select().from(reportTemplateVersions).where(eq(reportTemplateVersions.id, id)).limit(1))[0];
  if (!current) throw new Error("Report template version not found");
  if (current.status !== "draft") throw new Error("Published report template versions are immutable");
  const [version] = await db.update(reportTemplateVersions).set({ ...input, updatedAt: new Date() }).where(eq(reportTemplateVersions.id, id)).returning();
  await audit({ actorId, action: "report_template_version.updated", entityType: "report_template_version", entityId: id, beforeState: current, afterState: version });
  return version;
}

export async function publishReportTemplateVersion(id: string, actorId: string) {
  const result = await db.transaction(async (tx) => {
    const current = (await tx.select().from(reportTemplateVersions).where(eq(reportTemplateVersions.id, id)).limit(1))[0];
    if (!current) throw new Error("Report template version not found");
    if (current.status !== "draft") throw new Error("Only draft report template versions can be published");
    const [version] = await tx.update(reportTemplateVersions).set({ status: "published", publishedAt: new Date(), updatedAt: new Date() }).where(eq(reportTemplateVersions.id, id)).returning();
    await tx.update(reportTemplates).set({ status: "active", currentPublishedVersionId: id, updatedAt: new Date() }).where(eq(reportTemplates.id, current.reportTemplateId));
    return { current, version };
  });
  await audit({ actorId, action: "report_template_version.published", entityType: "report_template_version", entityId: id, beforeState: result.current, afterState: result.version });
  return result.version;
}

export async function createReportRun(input: ReportRunInput, actorId: string) {
  const template = (await db.select().from(reportTemplateVersions).where(eq(reportTemplateVersions.id, input.reportTemplateVersionId)).limit(1))[0];
  if (!template || template.status !== "published") throw new Error("Published report template version not found");
  const [run] = await db.insert(reportRuns).values({
    reportTemplateVersionId: input.reportTemplateVersionId,
    workflowVersionId: input.workflowVersionId,
    requestedById: actorId,
    filters: input.filters,
    evidencePolicy: { ...input.evidencePolicy, approvedOnly: true },
  }).returning();
  await audit({ actorId, action: "report_run.queued", entityType: "report_run", entityId: run.id, afterState: run });
  return run;
}

export async function runReportJob(reportRunId: string) {
  const run = (await db.select().from(reportRuns).where(eq(reportRuns.id, reportRunId)).limit(1))[0];
  if (!run) throw new Error("Report run not found");
  if (run.status === "succeeded") return run;
  await db.update(reportRuns).set({ status: "running", startedAt: new Date(), updatedAt: new Date() }).where(eq(reportRuns.id, reportRunId));
  try {
    const candidates = await db
      .select({ approved: approvedFindings, version: recordVersions, record: records })
      .from(approvedFindings)
      .innerJoin(recordVersions, eq(approvedFindings.recordVersionId, recordVersions.id))
      .innerJoin(records, eq(recordVersions.recordId, records.id))
      .where(eq(approvedFindings.status, "approved"));
    const access = await getAccessContext(run.requestedById);
    const filters = (run.filters ?? {}) as ReportRunInput["filters"];
    const evidence = candidates.filter(({ approved, version, record }) =>
      matchesEvidenceFilters(filters, record, version, approved) &&
      ["clear", "redacted"].includes(record.privacyStatus) &&
      record.researchUseStatus !== "restricted" &&
      evaluateAuthorization(access, "records.view_approved", {
        organizationId: record.organizationId,
        programId: record.programId,
        siteId: record.siteId,
        serviceKey: record.sourceKind,
        researchUse: record.researchUseStatus,
        dataClassification: "approved_evidence",
      }).allowed,
    );
    const byType = new Map<string, number>();
    const byOrigin = new Map<string, number>();
    const recordsByOrigin = new Map<string, Set<string>>();
    const sitesByOrigin = new Map<string, Set<string>>();
    const visitsByOrigin = new Map<string, Set<string>>();
    for (const row of evidence) {
      byType.set(row.approved.findingType, (byType.get(row.approved.findingType) ?? 0) + 1);
      const origin = (row.approved.approvedValue as { origin?: string } | null)?.origin ?? "unspecified";
      byOrigin.set(origin, (byOrigin.get(origin) ?? 0) + 1);
      (recordsByOrigin.get(origin) ?? recordsByOrigin.set(origin, new Set()).get(origin)!).add(row.record.id);
      if (row.record.siteId) (sitesByOrigin.get(origin) ?? sitesByOrigin.set(origin, new Set()).get(origin)!).add(row.record.siteId);
      if (row.record.visitId) (visitsByOrigin.get(origin) ?? visitsByOrigin.set(origin, new Set()).get(origin)!).add(row.record.visitId);
    }
    const template = (await db
      .select({ version: reportTemplateVersions, template: reportTemplates })
      .from(reportTemplateVersions)
      .innerJoin(reportTemplates, eq(reportTemplateVersions.reportTemplateId, reportTemplates.id))
      .where(eq(reportTemplateVersions.id, run.reportTemplateVersionId))
      .limit(1))[0];
    if (!template) throw new Error("Report template version not found");
    const metricsByFindingType = Object.fromEntries(byType);
    const metricsByOrigin = Object.fromEntries(byOrigin);
    const distinctUnitsByOrigin = Object.fromEntries([...byOrigin.keys()].map((origin) => [origin, {
      records: recordsByOrigin.get(origin)?.size ?? 0,
      sites: sitesByOrigin.get(origin)?.size ?? 0,
      visits: visitsByOrigin.get(origin)?.size ?? 0,
    }]));
    const evidenceInput = evidence.map(({ approved }) => ({
      id: approved.id,
      type: approved.findingType,
      value: approved.approvedValue,
    }));
    const configuredSections = Array.isArray(template.version.sections) ? template.version.sections.map(String) : [];
    const localOutput = {
      title: template.template.nameEn,
      executiveSummary: `${evidence.length} approved evidence item(s) matched the authorized report scope. Counts remain separated by evidence origin.`,
      sections: configuredSections.map((key) => ({
        key,
        title: key.replaceAll("_", " "),
        body: key === "metrics_by_origin"
          ? JSON.stringify({ metricsByOrigin, distinctUnitsByOrigin })
          : key === "approved_findings"
            ? `${evidence.length} approved finding(s).`
            : "Generated from authorized approved evidence.",
      })),
      citations: evidenceInput.map((item) => item.id),
    };
    const generation = await executeConfiguredWorkflow({
      workflowKey: "report_generation",
      workflowVersionId: run.workflowVersionId,
      idempotencyKey: `report-run:${run.id}:v1`,
      reportRunId: run.id,
      createdByUserId: run.requestedById,
      inputSnapshot: {
        reportRunId: run.id,
        reportTemplateVersionId: run.reportTemplateVersionId,
        reportSections: template.version.sections,
        filters,
        evidencePolicy: run.evidencePolicy,
        metricsByFindingType,
        metricsByOrigin,
        distinctUnitsByOrigin,
        approvedEvidence: evidenceInput,
      },
      localOutput,
    });
    const generatedOutput = generation.output as { title?: unknown; citations?: unknown } | null;
    const citations = Array.isArray(generatedOutput?.citations)
      ? generatedOutput.citations.filter((value): value is string => typeof value === "string")
      : [];
    const authorizedEvidenceIds = new Set(evidenceInput.map((item) => item.id));
    if (citations.some((id) => !authorizedEvidenceIds.has(id))) throw new Error("Report AI output cited evidence outside the authorized retrieval set");
    const provenance = {
      aiRunId: generation.run.id,
      workflowVersionId: generation.run.workflowVersionId,
      promptVersionId: generation.run.promptVersionId,
      outputSchemaVersionId: generation.run.outputSchemaVersionId,
      outputSchemaVersion: generation.run.outputSchemaVersion,
      provider: generation.run.provider,
      model: generation.run.model,
      externalSources: generation.externalSources,
    };
    const [artifact] = await db.insert(reportArtifacts).values({
      reportRunId,
      title: typeof generatedOutput?.title === "string" ? generatedOutput.title : template.template.nameEn,
      content: {
        generatedAt: new Date().toISOString(),
        filters,
        evidencePolicy: run.evidencePolicy,
        generationProvenance: provenance,
        generatedOutput: generation.output,
        evidenceCount: evidence.length,
        metricsByFindingType,
        metricsByOrigin,
        distinctUnitsByOrigin,
        sections: template.version.sections,
        findings: evidenceInput,
      },
    }).returning();
    if (evidence.length) {
      await db.insert(reportEvidenceLinks).values(evidence.map(({ approved }) => ({
        reportArtifactId: artifact.id,
        evidenceType: "approved_finding",
        evidenceId: approved.id,
        citationLabel: `AF-${approved.id.slice(0, 8)}`,
      })));
    }
    await db.update(reportRuns).set({ status: "succeeded", workflowVersionId: generation.run.workflowVersionId, finishedAt: new Date(), updatedAt: new Date() }).where(eq(reportRuns.id, reportRunId));
    return artifact;
  } catch (error) {
    await db.update(reportRuns).set({ status: "failed", finishedAt: new Date(), errorMetadata: { message: error instanceof Error ? error.message : "report generation failed" }, updatedAt: new Date() }).where(eq(reportRuns.id, reportRunId));
    throw error;
  }
}

export async function listReportsForUser(userId: string) {
  const rows = await db.select({ artifact: reportArtifacts, run: reportRuns }).from(reportArtifacts).innerJoin(reportRuns, eq(reportArtifacts.reportRunId, reportRuns.id)).orderBy(desc(reportArtifacts.createdAt));
  const access = await getAccessContext(userId);
  const evidenceAccess = await authorizedReportArtifactIds(userId, rows.map(({ artifact }) => artifact.id), access);
  return rows.filter(({ artifact, run }) => {
    const filters = (run.filters ?? {}) as ReportRunInput["filters"];
    const resources = [
      ...(filters.organizationIds ?? []).map((organizationId) => ({ organizationId })),
      ...(filters.programIds ?? []).map((programId) => ({ programId })),
      ...(filters.siteIds ?? []).map((siteId) => ({ siteId })),
      ...(filters.locationIds ?? []).map((locationId) => ({ locationId })),
      ...(filters.serviceTypeKeys ?? []).map((serviceKey) => ({ serviceKey })),
      ...(filters.templateVersionIds ?? []).map((templateId) => ({ templateId })),
      ...(filters.formVersionIds ?? []).map((formId) => ({ formId })),
    ];
    return evidenceAccess.has(artifact.id) && (resources.length ? resources : [{}]).every((resource) => evaluateAuthorization(access, "reports.view", resource).allowed);
  });
}

async function authorizedReportArtifactIds(userId: string, artifactIds: string[], existingAccess?: Awaited<ReturnType<typeof getAccessContext>>) {
  if (!artifactIds.length) return new Set<string>();
  const rows = await db
    .select({ artifactId: reportEvidenceLinks.reportArtifactId, approved: approvedFindings, record: records })
    .from(reportEvidenceLinks)
    .innerJoin(approvedFindings, eq(reportEvidenceLinks.evidenceId, approvedFindings.id))
    .innerJoin(recordVersions, eq(approvedFindings.recordVersionId, recordVersions.id))
    .innerJoin(records, eq(recordVersions.recordId, records.id))
    .where(inArray(reportEvidenceLinks.reportArtifactId, artifactIds));
  const access = existingAccess ?? await getAccessContext(userId);
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) grouped.set(row.artifactId, [...(grouped.get(row.artifactId) ?? []), row]);
  return new Set(artifactIds.filter((artifactId) => (grouped.get(artifactId) ?? []).every(({ approved, record }) =>
    approved.status === "approved" &&
    ["clear", "redacted"].includes(record.privacyStatus) &&
    record.researchUseStatus !== "restricted" &&
    evaluateAuthorization(access, "records.view_approved", {
      organizationId: record.organizationId,
      programId: record.programId,
      siteId: record.siteId,
      serviceKey: record.sourceKind,
      researchUse: record.researchUseStatus,
      dataClassification: "approved_evidence",
    }).allowed,
  )));
}

export async function canReadReportArtifact(userId: string, artifactId: string) {
  const exists = (await db.select({ id: reportArtifacts.id }).from(reportArtifacts).where(eq(reportArtifacts.id, artifactId)).limit(1))[0];
  return Boolean(exists) && (await authorizedReportArtifactIds(userId, [artifactId])).has(artifactId);
}

export async function canReadReportRun(userId: string, reportRunId: string) {
  const artifacts = await db.select({ id: reportArtifacts.id }).from(reportArtifacts).where(eq(reportArtifacts.reportRunId, reportRunId));
  if (!artifacts.length) {
    const run = (await db.select().from(reportRuns).where(eq(reportRuns.id, reportRunId)).limit(1))[0];
    return run?.requestedById === userId;
  }
  const allowed = await authorizedReportArtifactIds(userId, artifacts.map((artifact) => artifact.id));
  return allowed.size === artifacts.length;
}

export async function getReportRunBundle(id: string) {
  const run = (await db.select().from(reportRuns).where(eq(reportRuns.id, id)).limit(1))[0];
  if (!run) return null;
  const artifacts = await db.select().from(reportArtifacts).where(eq(reportArtifacts.reportRunId, id)).orderBy(desc(reportArtifacts.version));
  const generationRuns = await db.select().from(aiRuns).where(eq(aiRuns.reportRunId, id)).orderBy(desc(aiRuns.createdAt));
  return { run, artifacts, generationRuns };
}

export async function getReportArtifact(id: string) {
  const artifact = (await db.select().from(reportArtifacts).where(eq(reportArtifacts.id, id)).limit(1))[0];
  if (!artifact) return null;
  const run = (await db.select().from(reportRuns).where(eq(reportRuns.id, artifact.reportRunId)).limit(1))[0];
  const sources = await db.select().from(reportEvidenceLinks).where(eq(reportEvidenceLinks.reportArtifactId, id));
  const generationRuns = run ? await db.select().from(aiRuns).where(eq(aiRuns.reportRunId, run.id)).orderBy(desc(aiRuns.createdAt)) : [];
  return { artifact, run, sources, generationRuns };
}

export async function approveReportArtifact(id: string, actorId: string, decision: "approve" | "archive", notes?: string | null) {
  const current = (await db.select().from(reportArtifacts).where(eq(reportArtifacts.id, id)).limit(1))[0];
  if (!current) throw new Error("Report artifact not found");
  const [artifact] = await db.update(reportArtifacts).set({
    status: decision === "approve" ? "approved" : "archived",
    approvedById: decision === "approve" ? actorId : null,
    approvedAt: decision === "approve" ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(reportArtifacts.id, id)).returning();
  await audit({ actorId, action: `report.${decision}`, entityType: "report_artifact", entityId: id, beforeState: current, afterState: artifact, reason: notes ?? null });
  return artifact;
}
