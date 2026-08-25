import { desc, eq, inArray } from "drizzle-orm";
import { approvedFindings, exportJobs, records, recordVersions } from "@cnpaf/db/schema";
import type { z } from "zod";
import type { exportJobBodySchema } from "@cnpaf/shared";
import { db } from "./db";
import { evaluateAuthorization, getAccessContext } from "./authorization";
import { audit } from "./audit";
import { getObject, putObject } from "./storage";
import { matchesEvidenceFilters } from "./evidence-filters";

type ExportInput = z.infer<typeof exportJobBodySchema>;
type ExportScope = ExportInput["scope"];
type ExportFilters = ExportInput["filters"];

function csvCell(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function createExportJob(input: ExportInput, actorId: string) {
  const [job] = await db.insert(exportJobs).values({
    requestedById: actorId,
    exportTypeKey: input.exportTypeKey,
    scope: input.scope,
    filters: input.filters,
    dataClassification: input.dataClassification,
  }).returning();
  await audit({ actorId, action: "export.queued", entityType: "export_job", entityId: job.id, afterState: job });
  return job;
}

export async function runExportJob(exportJobId: string) {
  const job = (await db.select().from(exportJobs).where(eq(exportJobs.id, exportJobId)).limit(1))[0];
  if (!job) throw new Error("Export job not found");
  if (job.status === "succeeded") return job;
  await db.update(exportJobs).set({ status: "running", updatedAt: new Date() }).where(eq(exportJobs.id, exportJobId));
  try {
    const candidates = await db
      .select({ approved: approvedFindings, version: recordVersions, record: records })
      .from(approvedFindings)
      .innerJoin(recordVersions, eq(approvedFindings.recordVersionId, recordVersions.id))
      .innerJoin(records, eq(recordVersions.recordId, records.id))
      .where(eq(approvedFindings.status, "approved"));
    const access = await getAccessContext(job.requestedById);
    const scope = (job.scope ?? {}) as ExportScope;
    const filters = (job.filters ?? {}) as ExportFilters;
    const rows = candidates.filter(({ approved, version, record }) =>
      matchesEvidenceFilters(scope, record, version, approved) &&
      matchesEvidenceFilters(filters, record, version, approved) &&
      ["clear", "redacted"].includes(record.privacyStatus) &&
      record.researchUseStatus !== "restricted" &&
      evaluateAuthorization(access, "exports.create", {
        organizationId: record.organizationId,
        programId: record.programId,
        siteId: record.siteId,
        serviceKey: record.sourceKind,
        researchUse: record.researchUseStatus,
        dataClassification: job.dataClassification,
      }).allowed &&
      evaluateAuthorization(access, "records.view_approved", {
        organizationId: record.organizationId,
        programId: record.programId,
        siteId: record.siteId,
        serviceKey: record.sourceKind,
        researchUse: record.researchUseStatus,
        dataClassification: "approved_evidence",
      }).allowed,
    ).map(({ approved, record }) => ({
      approvedFindingId: approved.id,
      findingType: approved.findingType,
      approvedValue: approved.approvedValue,
      evidence: approved.evidence,
      organizationId: record.organizationId,
      programId: record.programId,
      siteId: record.siteId,
      serviceTypeKey: record.sourceKind,
      researchUseStatus: record.researchUseStatus,
    }));
    const asCsv = job.exportTypeKey.toLowerCase().includes("csv");
    const serialized = asCsv
      ? ["approved_finding_id,finding_type,approved_value,evidence,organization_id,site_id,service_type_key,research_use_status", ...rows.map((row) => [row.approvedFindingId, row.findingType, row.approvedValue, row.evidence, row.organizationId, row.siteId, row.serviceTypeKey, row.researchUseStatus].map(csvCell).join(","))].join("\n")
      : JSON.stringify({ generatedAt: new Date().toISOString(), dataClassification: job.dataClassification, rows }, null, 2);
    const body = Buffer.from(serialized, "utf8");
    const extension = asCsv ? "csv" : "json";
    const mimeType = asCsv ? "text/csv; charset=utf-8" : "application/json; charset=utf-8";
    const storageKey = `exports/${job.requestedById}/${job.id}.${extension}`;
    await putObject(storageKey, body, mimeType);
    const [completed] = await db.update(exportJobs).set({
      status: "succeeded",
      storageKey,
      mimeType,
      byteSize: body.byteLength,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      filters: { ...(job.filters as Record<string, unknown>), evidenceIds: rows.map((row) => row.approvedFindingId) },
      updatedAt: new Date(),
    }).where(eq(exportJobs.id, exportJobId)).returning();
    return completed;
  } catch (error) {
    await db.update(exportJobs).set({ status: "failed", errorMetadata: { message: error instanceof Error ? error.message : "export failed" }, updatedAt: new Date() }).where(eq(exportJobs.id, exportJobId));
    throw error;
  }
}

export async function listExportJobs(actorId: string) {
  return db.select().from(exportJobs).where(eq(exportJobs.requestedById, actorId)).orderBy(desc(exportJobs.createdAt));
}

export async function getExportJob(id: string, actorId: string) {
  const job = (await db.select().from(exportJobs).where(eq(exportJobs.id, id)).limit(1))[0];
  return job?.requestedById === actorId ? job : null;
}

export async function downloadExport(id: string, actorId: string) {
  const job = await getExportJob(id, actorId);
  if (!job?.storageKey || job.status !== "succeeded") return null;
  if (job.expiresAt && job.expiresAt < new Date()) throw new Error("Export has expired");
  const evidenceIds = ((job.filters ?? {}) as { evidenceIds?: string[] }).evidenceIds ?? [];
  if (evidenceIds.length) {
    const evidence = await db
      .select({ approved: approvedFindings, record: records })
      .from(approvedFindings)
      .innerJoin(recordVersions, eq(approvedFindings.recordVersionId, recordVersions.id))
      .innerJoin(records, eq(recordVersions.recordId, records.id))
      .where(inArray(approvedFindings.id, evidenceIds));
    const access = await getAccessContext(actorId);
    if (evidence.length !== evidenceIds.length || evidence.some(({ approved, record }) =>
      approved.status !== "approved" ||
      !["clear", "redacted"].includes(record.privacyStatus) ||
      record.researchUseStatus === "restricted" ||
      !evaluateAuthorization(access, "exports.download", { organizationId: record.organizationId, programId: record.programId, siteId: record.siteId, serviceKey: record.sourceKind, dataClassification: job.dataClassification }).allowed ||
      !evaluateAuthorization(access, "records.view_approved", { organizationId: record.organizationId, programId: record.programId, siteId: record.siteId, serviceKey: record.sourceKind, researchUse: record.researchUseStatus, dataClassification: "approved_evidence" }).allowed
    )) throw new Error("Export access has changed; create a new export");
  }
  return { job, object: await getObject(job.storageKey) };
}
