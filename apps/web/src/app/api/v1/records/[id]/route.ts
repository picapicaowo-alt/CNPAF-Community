import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { aiFindings, aiRuns, attachments, safetyFlags } from "@cnpaf/db/schema";
import { db } from "@/lib/db";
import { requireUser, jsonError } from "@/lib/http";
import { getRecordBundle } from "@/lib/records";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const bundle = await getRecordBundle(id, user!);
  if (!bundle) return jsonError("Not found", 404);
  const headId = bundle.record.headVersionId;
  const run = headId
    ? (await db.select().from(aiRuns).where(eq(aiRuns.recordVersionId, headId)).limit(1))[0]
    : null;
  const findings = run
    ? await db.select().from(aiFindings).where(eq(aiFindings.aiRunId, run.id))
    : [];
  const flags = await db.select().from(safetyFlags).where(eq(safetyFlags.recordId, id));
  const files = headId
    ? await db.select().from(attachments).where(eq(attachments.recordVersionId, headId))
    : [];
  return NextResponse.json({ ...bundle, run, findings, safetyFlags: flags, attachments: files });
}
