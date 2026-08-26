import { after } from "next/server";
import { NextResponse } from "next/server";
import {
  draftBodySchema,
  reportFiltersSchema,
  submitBodySchema,
} from "@cnpaf/shared";
import { requirePermission, requireUser, jsonError, privateNoStoreJson } from "@/lib/http";
import { listRecordsForUser, submitRecord, upsertDraft } from "@/lib/records";
import { processJobs } from "@/lib/jobs";
import { apiErrorResponse, requestId } from "@/lib/api-error";

const recordFilterArrayKeys = [
  "organizationIds",
  "programIds",
  "siteIds",
  "locationIds",
  "serviceTypeKeys",
  "populationKeys",
  "sourceOrigins",
  "templateVersionIds",
  "formVersionIds",
  "collectorIds",
  "reviewStatuses",
  "researchUseStatuses",
  "findingTypes",
  "themeOrConcernIds",
] as const;

export async function GET(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  const params = new URL(req.url).searchParams;
  const rawFilters: Record<string, string | string[]> = {};
  for (const key of ["dateFrom", "dateTo"] as const) {
    const value = params.get(key);
    if (value) rawFilters[key] = value;
  }
  for (const key of recordFilterArrayKeys) {
    const values = params.getAll(key).filter(Boolean);
    if (values.length) rawFilters[key] = values;
  }
  const parsed = reportFiltersSchema.safeParse(rawFilters);
  if (!parsed.success)
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid record filters", 400);
  const rows = await listRecordsForUser(
    user!,
    Object.keys(rawFilters).length ? parsed.data : undefined,
  );
  return privateNoStoreJson({ records: rows });
}

export async function POST(req: Request) {
  const traceId = requestId(req);
  const json = await req.json();
  const parsed = draftBodySchema.safeParse(json);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid draft");
  const { user, error } = await requirePermission("records.create", { organizationId: undefined, programId: parsed.data.programId, siteId: parsed.data.siteId, serviceKey: parsed.data.sourceKind });
  if (error || !user) return error;
  try {
    const result = await upsertDraft(user!, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return apiErrorResponse(err, traceId);
  }
}

export async function PUT(req: Request) {
  const traceId = requestId(req);
  const parsed = submitBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid submit");
  const { user, error } = await requirePermission("records.submit", { programId: parsed.data.programId, siteId: parsed.data.siteId, serviceKey: parsed.data.sourceKind });
  if (error || !user) return error;
  try {
    const result = await submitRecord(user!, parsed.data);
    after(async () => {
      try {
        await processJobs(3);
      } catch {
        /* durable queue will retry */
      }
    });
    return NextResponse.json(result);
  } catch (err) {
    return apiErrorResponse(err, traceId);
  }
}
