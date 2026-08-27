import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { recordLifecycleBodySchema } from "@cnpaf/shared";
import { aiFindings, aiRuns, approvedFindings, attachments, programs, reviewDecisions, safetyFlags, sites, templateVersions, users } from "@cnpaf/db/schema";
import { db } from "@/lib/db";
import { requireUser, jsonError } from "@/lib/http";
import { getRecordBundle } from "@/lib/records";
import { toAttachmentSummary } from "@/lib/attachments";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { applyRecordLifecycle } from "@/lib/modules/record-lifecycle";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const bundle = await getRecordBundle(id, user!);
  if (!bundle) return jsonError("Not found", 404);
  if (bundle.accessMode === "approved_evidence") {
    const approved = bundle.record.headVersionId
      ? await db.select().from(approvedFindings).where(eq(approvedFindings.recordVersionId, bundle.record.headVersionId))
      : [];
    return NextResponse.json({ record: bundle.record, approvedFindings: approved, accessMode: bundle.accessMode });
  }
  const headId = bundle.record.headVersionId;
  const run = headId
    ? (await db.select().from(aiRuns).where(eq(aiRuns.recordVersionId, headId)).orderBy(desc(aiRuns.createdAt)).limit(1))[0]
    : null;
  const findings = run
    ? await db.select().from(aiFindings).where(eq(aiFindings.aiRunId, run.id))
    : [];
  const flags = await db.select().from(safetyFlags).where(eq(safetyFlags.recordId, id));
  const files = headId
    ? await db.select().from(attachments).where(eq(attachments.recordVersionId, headId))
    : [];
  const [creator, site, program, formVersion, approvals] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, bundle.record.createdById)).limit(1).then((rows) => rows[0] ?? null),
    bundle.record.siteId ? db.select({
      id: sites.id,
      name: sites.name,
      nameEn: sites.nameEn,
      nameZh: sites.nameZh,
      region: sites.region,
      city: sites.city,
    }).from(sites).where(eq(sites.id, bundle.record.siteId)).limit(1).then((rows) => rows[0] ?? null) : Promise.resolve(null),
    bundle.record.programId ? db.select({ id: programs.id, nameEn: programs.nameEn, nameZh: programs.nameZh }).from(programs).where(eq(programs.id, bundle.record.programId)).limit(1).then((rows) => rows[0] ?? null) : Promise.resolve(null),
    headId ? db.select({ id: templateVersions.id, nameEn: templateVersions.nameEn, nameZh: templateVersions.nameZh, version: templateVersions.version }).from(templateVersions).where(eq(templateVersions.id, bundle.versions[0]?.templateVersionId ?? "00000000-0000-0000-0000-000000000000")).limit(1).then((rows) => rows[0] ?? null) : Promise.resolve(null),
    db.select({ decision: reviewDecisions, reviewer: { id: users.id, name: users.name, email: users.email } })
      .from(reviewDecisions)
      .innerJoin(users, eq(reviewDecisions.reviewerId, users.id))
      .where(eq(reviewDecisions.recordId, id))
      .orderBy(desc(reviewDecisions.createdAt)),
  ]);
  return NextResponse.json({
    ...bundle,
    run,
    findings,
    safetyFlags: flags,
    context: { creator, site, program, formVersion },
    reviewHistory: approvals,
    attachments: files.map((file) => toAttachmentSummary(
      file,
      `/api/v1/records/${bundle.record.id}/attachments/${file.id}`,
    )),
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const traceId = requestId(req);
  const { user, error } = await requireUser();
  if (error || !user) return error;
  const parsed = recordLifecycleBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid record action", 400);
  try {
    return NextResponse.json(await applyRecordLifecycle(user, (await ctx.params).id, parsed.data));
  } catch (caught) {
    return apiErrorResponse(caught, traceId);
  }
}
