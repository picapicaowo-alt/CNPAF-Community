import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  approvedFindings,
  attachments,
  auditEvents,
  programs,
  records,
  recordVersions,
  reportArtifacts,
  reportEvidenceLinks,
  reportRuns,
  reportTemplateVersions,
  reportSections,
  reports,
  reportVersionEvidenceLinks,
  reportVersions,
  datasetVersions,
  datasets,
  users,
} from "@cnpaf/db/schema";
import type { z } from "zod";
import type {
  editableReportCreateBodySchema,
  editableReportUpdateBodySchema,
  editableReportVersionBodySchema,
  reportSectionAiDraftBodySchema,
  reportSectionDuplicateBodySchema,
  reportSectionInputSchema,
  reportSectionUpdateBodySchema,
} from "@cnpaf/shared";
import { db } from "../db";
import { audit } from "../audit";
import { ApiError } from "../api-error";
import { authorize, evaluateAuthorization, getAccessContext } from "../authorization";
import { executeConfiguredWorkflow } from "../ai";
import {
  getDatasetEvidenceForAi,
  getDatasetVersionForReport,
} from "./datasets";
import { toAttachmentSummary, toFrozenAttachmentManifest } from "../attachments";
import {
  markDatasetImagesSentToAi,
  prepareDatasetAiMedia,
} from "../dataset-ai-media";

type ReportCreate = z.infer<typeof editableReportCreateBodySchema>;
type ReportUpdate = z.infer<typeof editableReportUpdateBodySchema>;
type VersionCreate = z.infer<typeof editableReportVersionBodySchema>;
type SectionCreate = z.infer<typeof reportSectionInputSchema>;
type SectionUpdate = z.infer<typeof reportSectionUpdateBodySchema>;
type AiDraftInput = z.infer<typeof reportSectionAiDraftBodySchema>;
type SectionDuplicate = z.infer<typeof reportSectionDuplicateBodySchema>;

function reportResource(report: typeof reports.$inferSelect) {
  return { organizationId: report.organizationId, programId: report.programId, reportId: report.id };
}

async function requireReport(actorId: string, reportId: string, permission: string) {
  const report = (await db.select().from(reports).where(eq(reports.id, reportId)).limit(1))[0];
  if (!report) throw new ApiError("NOT_FOUND", "Report not found", 404);
  if (!(await authorize({ userId: actorId, permission, resource: reportResource(report) })).allowed) {
    throw new ApiError("FORBIDDEN", "Report is outside the assigned scope", 403);
  }
  return report;
}

async function requireVersion(actorId: string, versionId: string, permission: string) {
  const version = (await db.select().from(reportVersions).where(eq(reportVersions.id, versionId)).limit(1))[0];
  if (!version) throw new ApiError("NOT_FOUND", "Report version not found", 404);
  const report = await requireReport(actorId, version.reportId, permission);
  return { report, version };
}

async function requireSection(actorId: string, sectionId: string, permission: string) {
  const section = (await db.select().from(reportSections).where(eq(reportSections.id, sectionId)).limit(1))[0];
  if (!section) throw new ApiError("NOT_FOUND", "Report section not found", 404);
  const { report, version } = await requireVersion(actorId, section.reportVersionId, permission);
  return { report, version, section };
}

export async function listEditableReports(actorId: string) {
  const [access, rows] = await Promise.all([
    getAccessContext(actorId),
    db.select().from(reports).orderBy(desc(reports.updatedAt)),
  ]);
  return rows.filter((report) => evaluateAuthorization(access, "reports.view", reportResource(report)).allowed);
}

export async function getEditableReport(actorId: string, reportId: string) {
  const report = await requireReport(actorId, reportId, "reports.view");
  const versions = await db.select().from(reportVersions).where(eq(reportVersions.reportId, reportId)).orderBy(desc(reportVersions.versionNumber));
  const head = report.headVersionId ? versions.find((version) => version.id === report.headVersionId) ?? null : versions[0] ?? null;
  const sections = head ? await db.select().from(reportSections).where(eq(reportSections.reportVersionId, head.id)).orderBy(asc(reportSections.sortOrder)) : [];
  const editorIds = [...new Set(sections.map((section) => section.lastEditedById).filter(Boolean))] as string[];
  const editors = editorIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, editorIds)) : [];
  const editorById = new Map(editors.map((editor) => [editor.id, editor]));
  const sourceDataset = head?.sourceDatasetVersionId
    ? (await db.select({ dataset: datasets, version: datasetVersions })
        .from(datasetVersions)
        .innerJoin(datasets, eq(datasetVersions.datasetId, datasets.id))
        .where(eq(datasetVersions.id, head.sourceDatasetVersionId))
        .limit(1))[0] ?? null
    : null;
  return {
    report,
    versions,
    headVersion: head,
    sourceDataset,
    sections: sections.map((section) => ({
      ...section,
      lastEditedBy: section.lastEditedById ? editorById.get(section.lastEditedById) ?? null : null,
    })),
  };
}

export async function createEditableReport(actorId: string, input: ReportCreate, requestId?: string) {
  if (!(await authorize({ userId: actorId, permission: "reports.edit", resource: { organizationId: input.organizationId, programId: input.programId } })).allowed) {
    throw new ApiError("FORBIDDEN", "Cannot create a report in this scope", 403);
  }
  const [program, templateVersion] = await Promise.all([
    input.programId ? db.select().from(programs).where(eq(programs.id, input.programId)).limit(1).then((rows) => rows[0]) : Promise.resolve(null),
    input.reportTemplateVersionId ? db.select().from(reportTemplateVersions).where(eq(reportTemplateVersions.id, input.reportTemplateVersionId)).limit(1).then((rows) => rows[0]) : Promise.resolve(null),
  ]);
  if (input.programId && (!program || program.organizationId !== input.organizationId)) throw new ApiError("BAD_REQUEST", "Report program must belong to the selected organization", 400);
  if (input.reportTemplateVersionId && (!templateVersion || templateVersion.status !== "published")) throw new ApiError("BAD_REQUEST", "Report template version must be published", 400);
  const source = input.sourceReportArtifactId
    ? (await db.select({ artifact: reportArtifacts, run: reportRuns }).from(reportArtifacts)
        .innerJoin(reportRuns, eq(reportArtifacts.reportRunId, reportRuns.id))
        .where(eq(reportArtifacts.id, input.sourceReportArtifactId)).limit(1))[0]
    : null;
  const datasetSource = input.sourceDatasetVersionId
    ? await getDatasetVersionForReport(actorId, input.sourceDatasetVersionId)
    : null;
  if (input.sourceReportArtifactId && !source) throw new ApiError("NOT_FOUND", "Source report artifact not found", 404);
  if (datasetSource) {
    if (datasetSource.dataset.organizationId !== input.organizationId || datasetSource.dataset.programId !== (input.programId ?? null)) {
      throw new ApiError("BAD_REQUEST", "Report scope must exactly match the source Dataset", 400);
    }
    if (datasetSource.dataset.dataClassification !== "approved_evidence") {
      throw new ApiError("FORBIDDEN", "Initial reports can only use approved-evidence Datasets", 403);
    }
  }
  if (source) {
    const sourceRows = await db.select({ approved: approvedFindings, record: records })
      .from(reportEvidenceLinks)
      .innerJoin(approvedFindings, eq(reportEvidenceLinks.evidenceId, approvedFindings.id))
      .innerJoin(recordVersions, eq(approvedFindings.recordVersionId, recordVersions.id))
      .innerJoin(records, eq(recordVersions.recordId, records.id))
      .where(eq(reportEvidenceLinks.reportArtifactId, source.artifact.id));
    const access = await getAccessContext(actorId);
    if (sourceRows.some(({ approved, record }) => approved.status !== "approved" || !["clear", "redacted"].includes(record.privacyStatus) || record.researchUseStatus === "restricted" || !evaluateAuthorization(access, "records.view_approved", {
      organizationId: record.organizationId,
      programId: record.programId,
      siteId: record.siteId,
      serviceKey: record.sourceKind,
      researchUse: record.researchUseStatus,
      dataClassification: "approved_evidence",
    }).allowed)) throw new ApiError("FORBIDDEN", "Source report includes evidence outside the current access scope", 403);
  }
  const sourceLinks = source ? await db.select().from(reportEvidenceLinks).where(eq(reportEvidenceLinks.reportArtifactId, source.artifact.id)) : [];
  const datasetFindingLinks = datasetSource ? datasetSource.findings.map(({ finding, frozen }) => ({
    evidenceType: "approved_finding",
    evidenceId: finding.id,
    citationLabel: `Dataset v${datasetSource.version.versionNumber} / Record ${frozen.recordId.slice(0, 8)}`,
    metadata: {
      datasetId: datasetSource.dataset.id,
      datasetVersionId: datasetSource.version.id,
      datasetContentHash: datasetSource.version.contentHash,
      recordId: frozen.recordId,
      recordVersionId: frozen.recordVersionId,
      ordinal: frozen.ordinal,
    },
  })) : [];
  const frozenByVersionId = new Map(datasetSource?.frozenRows.map((row) => [row.recordVersionId, row]) ?? []);
  const datasetMediaLinks = datasetSource ? datasetSource.mediaAttachments.flatMap((attachment) => {
    const frozen = frozenByVersionId.get(attachment.recordVersionId);
    if (!frozen) return [];
    const summary = toFrozenAttachmentManifest(attachment);
    return [{
      evidenceType: "attachment",
      evidenceId: attachment.id,
      citationLabel: `Dataset v${datasetSource.version.versionNumber} / ${summary.kind} ${summary.originalName}`,
      metadata: {
        datasetId: datasetSource.dataset.id,
        datasetVersionId: datasetSource.version.id,
        datasetContentHash: datasetSource.version.contentHash,
        recordId: frozen.recordId,
        recordVersionId: frozen.recordVersionId,
        attachment: summary,
        ordinal: frozen.ordinal,
      },
    }];
  }) : [];
  const datasetLinks = [...datasetFindingLinks, ...datasetMediaLinks];
  const datasetSelection = datasetSource?.version.selectionQuery as { filters?: ReportCreate["filters"] } | null;
  const filters = datasetSource
    ? datasetSelection?.filters ?? {}
    : Object.keys(input.filters).length ? input.filters : (source?.run.filters ?? {});
  const evidencePolicy = Object.keys(input.evidencePolicy).length ? input.evidencePolicy : (source?.run.evidencePolicy ?? {});
  return db.transaction(async (tx) => {
    const [report] = await tx.insert(reports).values({
      organizationId: input.organizationId,
      programId: input.programId,
      reportTemplateVersionId: input.reportTemplateVersionId,
      title: input.title,
      createdById: actorId,
    }).returning();
    const [version] = await tx.insert(reportVersions).values({
      reportId: report.id,
      versionNumber: 1,
      title: input.title,
      filters,
      evidencePolicy,
      sourceReportArtifactId: input.sourceReportArtifactId,
      sourceDatasetVersionId: input.sourceDatasetVersionId,
      createdById: actorId,
    }).returning();
    const sections = await tx.insert(reportSections).values(input.sections.map((section) => ({
      reportVersionId: version.id,
      ...section,
      lastEditedById: actorId,
    }))).returning();
    if (sourceLinks.length) await tx.insert(reportVersionEvidenceLinks).values(sourceLinks.map((link) => ({
      reportVersionId: version.id,
      reportSectionId: null,
      evidenceType: link.evidenceType,
      evidenceId: link.evidenceId,
      citationLabel: link.citationLabel,
      metadata: link.metadata,
    })));
    if (datasetLinks.length) await tx.insert(reportVersionEvidenceLinks).values(datasetLinks.map((link) => ({
      reportVersionId: version.id,
      reportSectionId: null,
      ...link,
    })));
    await tx.update(reports).set({ headVersionId: version.id, updatedAt: new Date() }).where(eq(reports.id, report.id));
    await audit({ actorId, action: "report.created", entityType: "report", entityId: report.id, afterState: { report, version, sections }, metadata: { requestId } }, (values) => tx.insert(auditEvents).values(values));
    return { report: { ...report, headVersionId: version.id }, version, sections };
  });
}

export async function updateEditableReport(actorId: string, reportId: string, input: ReportUpdate, requestId?: string) {
  const before = await requireReport(actorId, reportId, "reports.edit");
  if (before.status !== "draft" && (input.title !== undefined || input.programId !== undefined)) {
    throw new ApiError("CONFLICT", "Create a new draft version before changing a published report", 409);
  }
  if (input.status === "draft" && before.status !== "draft") throw new ApiError("INVALID_TRANSITION", "A published or archived report cannot be reopened through profile editing", 409);
  if (before.status === "archived") throw new ApiError("INVALID_TRANSITION", "Archived reports are read-only", 409);
  if (input.programId) {
    const program = (await db.select().from(programs).where(eq(programs.id, input.programId)).limit(1))[0];
    if (!program || program.organizationId !== before.organizationId) throw new ApiError("BAD_REQUEST", "Report program must belong to the report organization", 400);
  }
  return db.transaction(async (tx) => {
    const [after] = await tx.update(reports).set({ ...input, updatedAt: new Date() }).where(eq(reports.id, reportId)).returning();
    await audit({ actorId, action: "report.updated", entityType: "report", entityId: reportId, beforeState: before, afterState: after, metadata: { requestId } }, (values) => tx.insert(auditEvents).values(values));
    return after;
  });
}

export async function createReportVersion(actorId: string, reportId: string, input: VersionCreate, requestId?: string) {
  const report = await requireReport(actorId, reportId, "reports.edit");
  if (report.status === "archived") throw new ApiError("INVALID_TRANSITION", "Archived reports are read-only", 409);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from reports where id = ${reportId} for update`);
    const latest = (await tx.select().from(reportVersions).where(eq(reportVersions.reportId, reportId)).orderBy(desc(reportVersions.versionNumber)).limit(1))[0];
    const [version] = await tx.insert(reportVersions).values({
      reportId,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      title: input.title ?? report.title,
      changeSummary: input.changeSummary,
      filters: input.filters ?? latest?.filters ?? {},
      evidencePolicy: input.evidencePolicy ?? latest?.evidencePolicy ?? {},
      sourceDatasetVersionId: latest?.sourceDatasetVersionId,
      createdById: actorId,
    }).returning();
    const sections = await tx.insert(reportSections).values(input.sections.map((section) => ({ ...section, reportVersionId: version.id, lastEditedById: actorId }))).returning();
    if (latest) {
      const [previousSections, previousLinks] = await Promise.all([
        tx.select().from(reportSections).where(eq(reportSections.reportVersionId, latest.id)),
        tx.select().from(reportVersionEvidenceLinks).where(eq(reportVersionEvidenceLinks.reportVersionId, latest.id)),
      ]);
      const oldKeyById = new Map(previousSections.map((section) => [section.id, section.sectionKey]));
      const newIdByKey = new Map(sections.map((section) => [section.sectionKey, section.id]));
      if (previousLinks.length) await tx.insert(reportVersionEvidenceLinks).values(previousLinks.map((link) => ({
        reportVersionId: version.id,
        reportSectionId: link.reportSectionId ? newIdByKey.get(oldKeyById.get(link.reportSectionId) ?? "") ?? null : null,
        evidenceType: link.evidenceType,
        evidenceId: link.evidenceId,
        citationLabel: link.citationLabel,
        metadata: link.metadata,
      })));
    }
    await tx.update(reports).set({ status: "draft", headVersionId: version.id, updatedAt: new Date() }).where(eq(reports.id, reportId));
    await audit({ actorId, action: "report.version_created", entityType: "report_version", entityId: version.id, afterState: { version, sections }, metadata: { requestId, reportId } }, (values) => tx.insert(auditEvents).values(values));
    return { version, sections };
  });
}

export async function updateReportVersion(actorId: string, versionId: string, input: { title?: string; changeSummary?: string | null }, requestId?: string) {
  const { version: before } = await requireVersion(actorId, versionId, "reports.edit");
  if (before.status !== "draft") throw new ApiError("CONFLICT", "Published report versions are immutable; create a new draft version", 409);
  return db.transaction(async (tx) => {
    const [after] = await tx.update(reportVersions).set({ ...input, updatedAt: new Date() }).where(eq(reportVersions.id, versionId)).returning();
    await audit({ actorId, action: "report.version_updated", entityType: "report_version", entityId: versionId, beforeState: before, afterState: after, metadata: { requestId } }, (values) => tx.insert(auditEvents).values(values));
    return after;
  });
}

export async function publishReportVersion(actorId: string, versionId: string, requestId?: string) {
  const { report, version } = await requireVersion(actorId, versionId, "reports.publish");
  if (version.status !== "draft") throw new ApiError("INVALID_TRANSITION", "Only a draft report version can be published", 409);
  return db.transaction(async (tx) => {
    const now = new Date();
    const [published] = await tx.update(reportVersions).set({ status: "published", publishedAt: now, updatedAt: now }).where(and(eq(reportVersions.id, versionId), eq(reportVersions.status, "draft"))).returning();
    if (!published) throw new ApiError("CONFLICT", "Report version changed concurrently", 409);
    await tx.update(reports).set({ status: "published", title: published.title, headVersionId: published.id, publishedById: actorId, publishedAt: now, updatedAt: now }).where(eq(reports.id, report.id));
    await audit({ actorId, action: "report.published", entityType: "report_version", entityId: versionId, beforeState: version, afterState: published, metadata: { requestId, reportId: report.id } }, (values) => tx.insert(auditEvents).values(values));
    return published;
  });
}

export async function addReportSection(actorId: string, versionId: string, input: SectionCreate, requestId?: string) {
  const { version } = await requireVersion(actorId, versionId, "reports.edit");
  if (version.status !== "draft") throw new ApiError("CONFLICT", "Published report versions are immutable", 409);
  return db.transaction(async (tx) => {
    const [section] = await tx.insert(reportSections).values({ ...input, reportVersionId: versionId, lastEditedById: actorId }).returning();
    await audit({ actorId, action: "report.section_added", entityType: "report_section", entityId: section.id, afterState: section, metadata: { requestId, versionId } }, (values) => tx.insert(auditEvents).values(values));
    return section;
  });
}

export async function updateReportSection(actorId: string, sectionId: string, input: SectionUpdate, requestId?: string) {
  const { version, section: before } = await requireSection(actorId, sectionId, "reports.edit");
  if (version.status !== "draft") throw new ApiError("CONFLICT", "Published report sections are immutable", 409);
  const changes: Partial<typeof reportSections.$inferInsert> = {
    title: input.title,
    content: input.content,
    sortOrder: input.sortOrder,
    lastEditedById: actorId,
    updatedAt: new Date(),
  };
  if (input.aiSuggestionAction === "accept") {
    if (!before.aiSuggestion) throw new ApiError("CONFLICT", "No AI suggestion is ready", 409);
    changes.content = before.aiSuggestion;
    changes.aiSuggestionStatus = "accepted";
  } else if (input.aiSuggestionAction === "dismiss") {
    changes.aiSuggestionStatus = "dismissed";
  }
  return db.transaction(async (tx) => {
    const [after] = await tx.update(reportSections).set(changes).where(eq(reportSections.id, sectionId)).returning();
    await audit({ actorId, action: input.aiSuggestionAction === "accept" ? "report.ai_suggestion_accepted" : "report.section_updated", entityType: "report_section", entityId: sectionId, beforeState: before, afterState: after, metadata: { requestId } }, (values) => tx.insert(auditEvents).values(values));
    return after;
  });
}

export async function duplicateReportSection(actorId: string, sectionId: string, input: SectionDuplicate, requestId?: string) {
  const { version, section: source } = await requireSection(actorId, sectionId, "reports.edit");
  if (version.status !== "draft") throw new ApiError("CONFLICT", "Published report sections are immutable", 409);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from report_versions where id = ${version.id} for update`);
    const maxOrder = (await tx.select({ value: sql<number>`coalesce(max(${reportSections.sortOrder}), -1)` }).from(reportSections).where(eq(reportSections.reportVersionId, version.id)))[0]?.value ?? -1;
    const sectionKey = input.sectionKey ?? `${source.sectionKey}_copy_${crypto.randomUUID().slice(0, 8)}`;
    const [copy] = await tx.insert(reportSections).values({
      reportVersionId: version.id,
      sectionKey,
      title: input.title ?? source.title,
      content: source.content,
      sortOrder: Number(maxOrder) + 1,
      lastEditedById: actorId,
    }).returning();
    const links = await tx.select().from(reportVersionEvidenceLinks).where(eq(reportVersionEvidenceLinks.reportSectionId, source.id));
    if (links.length) await tx.insert(reportVersionEvidenceLinks).values(links.map((link) => ({
      reportVersionId: version.id,
      reportSectionId: copy.id,
      evidenceType: link.evidenceType,
      evidenceId: link.evidenceId,
      citationLabel: link.citationLabel,
      metadata: link.metadata,
    })));
    await audit({ actorId, action: "report.section_duplicated", entityType: "report_section", entityId: copy.id, afterState: copy, metadata: { requestId, sourceSectionId: source.id } }, (values) => tx.insert(auditEvents).values(values));
    return copy;
  });
}

export async function deleteReportSection(actorId: string, sectionId: string, requestId?: string) {
  const { version, section } = await requireSection(actorId, sectionId, "reports.edit");
  if (version.status !== "draft") throw new ApiError("CONFLICT", "Published report sections are immutable", 409);
  return db.transaction(async (tx) => {
    await tx.delete(reportVersionEvidenceLinks).where(eq(reportVersionEvidenceLinks.reportSectionId, sectionId));
    await tx.delete(reportSections).where(eq(reportSections.id, sectionId));
    await audit({ actorId, action: "report.section_deleted", entityType: "report_section", entityId: sectionId, beforeState: section, metadata: { requestId } }, (values) => tx.insert(auditEvents).values(values));
    return { id: sectionId, deleted: true };
  });
}

export async function draftReportSectionWithAi(actorId: string, sectionId: string, input: AiDraftInput, requestId?: string) {
  const { report, version, section } = await requireSection(actorId, sectionId, "reports.edit");
  if (version.status !== "draft") throw new ApiError("CONFLICT", "Published report sections are immutable", 409);
  const sources = await getReportSectionSources(actorId, sectionId);
  const datasetRecordSources = version.sourceDatasetVersionId
    ? await getDatasetEvidenceForAi(actorId, version.sourceDatasetVersionId)
    : [];
  const media = input.includeMedia && version.sourceDatasetVersionId
    ? await prepareDatasetAiMedia(actorId, version.sourceDatasetVersionId)
    : null;
  const generation = await executeConfiguredWorkflow({
    workflowKey: "report_section_draft",
    workflowVersionId: input.workflowVersionId,
    idempotencyKey: `report-section:${section.id}:${actorId}:${input.idempotencyKey}`,
    createdByUserId: actorId,
    inputSnapshot: {
      reportId: report.id,
      reportVersionId: version.id,
      sectionId: section.id,
      instruction: input.instruction,
      currentHumanText: section.content,
      approvedSources: [...sources, ...datasetRecordSources],
      mediaContext: {
        requested: input.includeMedia,
        includedByDatasetPolicy: media?.mediaIncluded ?? false,
        attachmentSourceIds: media?.mediaSources.map((source) => source.id) ?? [],
        omittedAttachmentCount: (media?.totalAttachmentCount ?? 0) - (media?.mediaSources.length ?? 0),
      },
    },
    localOutput: { suggestion: section.content || input.instruction },
    imageInputs: media?.imageInputs,
    fileInputs: media?.fileInputs,
  });
  const suggestion = (generation.output as { suggestion?: unknown } | null)?.suggestion;
  if (typeof suggestion !== "string" || !suggestion.trim()) throw new ApiError("CONFLICT", "AI workflow did not return a section suggestion", 409);
  if (generation.run.provider === "openai" && media?.selectedAttachments.length && version.sourceDatasetVersionId) {
    await markDatasetImagesSentToAi({
      actorId,
      aiRunId: generation.run.id,
      attachmentIds: media.selectedAttachments.map((attachment) => attachment.id),
      datasetVersionId: version.sourceDatasetVersionId,
      context: { reportId: report.id, reportSectionId: section.id },
    });
  }
  return db.transaction(async (tx) => {
    const [after] = await tx.update(reportSections).set({
      aiSuggestion: suggestion,
      aiSuggestionRunId: generation.run.id,
      aiSuggestionStatus: "ready",
      aiSuggestedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(reportSections.id, sectionId)).returning();
    await audit({ actorId, action: "report.ai_suggestion_created", entityType: "report_section", entityId: sectionId, beforeState: { aiSuggestionStatus: section.aiSuggestionStatus }, afterState: { aiSuggestionStatus: after.aiSuggestionStatus, aiSuggestionRunId: generation.run.id }, metadata: { requestId } }, (values) => tx.insert(auditEvents).values(values));
    return after;
  });
}

export async function getReportSectionSources(actorId: string, sectionId: string) {
  const { version } = await requireSection(actorId, sectionId, "reports.view");
  const links = await db.select().from(reportVersionEvidenceLinks).where(eq(reportVersionEvidenceLinks.reportVersionId, version.id));
  const applicable = links.filter((link) => !link.reportSectionId || link.reportSectionId === sectionId);
  const findingIds = applicable.filter((link) => link.evidenceType === "approved_finding").map((link) => link.evidenceId);
  const attachmentIds = applicable.filter((link) => link.evidenceType === "attachment").map((link) => link.evidenceId);
  const rows = findingIds.length ? await db.select({ approved: approvedFindings, record: records })
    .from(approvedFindings)
    .innerJoin(recordVersions, eq(approvedFindings.recordVersionId, recordVersions.id))
    .innerJoin(records, eq(recordVersions.recordId, records.id))
    .where(inArray(approvedFindings.id, findingIds)) : [];
  const mediaRows = attachmentIds.length ? await db.select({ attachment: attachments, record: records })
    .from(attachments)
    .innerJoin(recordVersions, eq(attachments.recordVersionId, recordVersions.id))
    .innerJoin(records, eq(recordVersions.recordId, records.id))
    .where(inArray(attachments.id, attachmentIds)) : [];
  const access = await getAccessContext(actorId);
  const byId = new Map(rows.filter(({ approved, record }) => approved.status === "approved" && ["clear", "redacted"].includes(record.privacyStatus) && record.researchUseStatus !== "restricted" && evaluateAuthorization(access, "records.view_approved", {
    organizationId: record.organizationId,
    programId: record.programId,
    siteId: record.siteId,
    serviceKey: record.sourceKind,
    researchUse: record.researchUseStatus,
    dataClassification: "approved_evidence",
  }).allowed).map((row) => [row.approved.id, row]));
  const mediaById = new Map(mediaRows.filter(({ record }) => ["clear", "redacted"].includes(record.privacyStatus) && record.researchUseStatus !== "restricted" && evaluateAuthorization(access, "records.view_approved", {
    organizationId: record.organizationId,
    programId: record.programId,
    siteId: record.siteId,
    serviceKey: record.sourceKind,
    researchUse: record.researchUseStatus,
    dataClassification: "approved_evidence",
  }).allowed).map((row) => [row.attachment.id, row]));
  const visibleSources: Array<{
    id: string;
    evidenceType: string;
    evidenceId: string;
    citationLabel: string | null;
    metadata: unknown;
    finding: unknown | null;
    attachment: ReturnType<typeof toAttachmentSummary> | null;
    record: { id: string; programId: string | null; locationId: string | null; sourceKind: string };
  }> = [];
  for (const link of applicable) {
    const row = byId.get(link.evidenceId);
    if (row) {
      visibleSources.push({ id: link.id, evidenceType: link.evidenceType, evidenceId: link.evidenceId, citationLabel: link.citationLabel, metadata: link.metadata, finding: row.approved.approvedValue, attachment: null, record: { id: row.record.id, programId: row.record.programId, locationId: row.record.siteId, sourceKind: row.record.sourceKind } });
      continue;
    }
    const media = mediaById.get(link.evidenceId);
    if (media) visibleSources.push({ id: link.id, evidenceType: link.evidenceType, evidenceId: link.evidenceId, citationLabel: link.citationLabel, metadata: link.metadata, finding: null, attachment: toAttachmentSummary(media.attachment), record: { id: media.record.id, programId: media.record.programId, locationId: media.record.siteId, sourceKind: media.record.sourceKind } });
  }
  return visibleSources;
}
