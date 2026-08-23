import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { jobs } from "@cnpaf/db/schema";
import { db } from "@/lib/db";
import { requireOps, jsonError } from "@/lib/http";
import { processJobs, retryJob } from "@/lib/jobs";

export async function GET() {
  const { error } = await requireOps();
  if (error) return error;
  const rows = await db.select().from(jobs).orderBy(desc(jobs.updatedAt)).limit(100);
  return NextResponse.json({ jobs: rows });
}

export async function POST() {
  const { error } = await requireOps();
  if (error) return error;
  const result = await processJobs(10);
  return NextResponse.json(result);
}

export async function PATCH(req: Request) {
  const { error } = await requireOps();
  if (error) return error;
  const { id } = (await req.json()) as { id?: string };
  if (!id) return jsonError("id required");
  await retryJob(id);
  await db.update(jobs).set({ status: "queued" }).where(eq(jobs.id, id));
  return NextResponse.json({ ok: true });
}
