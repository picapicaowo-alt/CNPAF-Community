import { after } from "next/server";
import { NextResponse } from "next/server";
import { draftBodySchema, submitBodySchema } from "@cnpaf/shared";
import { requirePermission, requireUser, jsonError } from "@/lib/http";
import { listRecordsForUser, submitRecord, upsertDraft } from "@/lib/records";
import { processJobs } from "@/lib/jobs";
import { apiErrorResponse, requestId } from "@/lib/api-error";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const rows = await listRecordsForUser(user!);
  return NextResponse.json({ records: rows });
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
