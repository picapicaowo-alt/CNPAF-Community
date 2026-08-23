import { after } from "next/server";
import { NextResponse } from "next/server";
import { draftBodySchema, submitBodySchema } from "@cnpaf/shared";
import { requireUser, jsonError } from "@/lib/http";
import { listRecordsForUser, submitRecord, upsertDraft } from "@/lib/records";
import { processJobs } from "@/lib/jobs";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const rows = await listRecordsForUser(user!);
  return NextResponse.json({ records: rows });
}

export async function POST(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  const json = await req.json();
  const parsed = draftBodySchema.safeParse(json);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid draft");
  try {
    const result = await upsertDraft(user!, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Draft failed", 400);
  }
}

export async function PUT(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  const parsed = submitBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid submit");
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
    return jsonError(err instanceof Error ? err.message : "Submit failed", 400);
  }
}
