import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { jobs, records } from "@cnpaf/db/schema";
import { db } from "./db";
import { runAnalysisJob } from "./ai";
import { runReportJob } from "./reports";
import { runExportJob } from "./exports";

const MAX_ATTEMPTS = 3;

export async function enqueueAnalyze(recordVersionId: string, idempotencyKey = `classify:${recordVersionId}`, aiRunId?: string | null) {
  await db
    .insert(jobs)
    .values({
      kind: "analyze_record_version",
      recordVersionId,
      status: "queued",
      maxAttempts: MAX_ATTEMPTS,
      idempotencyKey,
      payload: aiRunId ? { aiRunId } : {},
    })
    .onConflictDoNothing({ target: jobs.idempotencyKey });
}

export async function enqueueJob(kind: string, payload: Record<string, unknown>, idempotencyKey: string) {
  const [created] = await db.insert(jobs).values({ kind, payload, idempotencyKey, status: "queued", maxAttempts: MAX_ATTEMPTS }).onConflictDoNothing({ target: jobs.idempotencyKey }).returning();
  return created ?? (await db.select().from(jobs).where(eq(jobs.idempotencyKey, idempotencyKey)).limit(1))[0];
}

export async function processJobs(limit = 5): Promise<{ processed: number; errors: string[] }> {
  const workerId = `web:${process.pid}:${crypto.randomUUID()}`;
  const due = await db.transaction(async (tx) => {
    const claimed = await tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, "queued"), lte(jobs.runAfter, new Date())))
      .orderBy(asc(jobs.runAfter))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (!claimed.length) return [];
    await tx.update(jobs).set({ status: "running", lockedAt: new Date(), lockedBy: workerId, updatedAt: new Date() }).where(inArray(jobs.id, claimed.map((job) => job.id)));
    return claimed;
  });

  const errors: string[] = [];
  let processed = 0;

  for (const job of due) {
    await db.update(jobs).set({ attempts: job.attempts + 1, updatedAt: new Date() }).where(eq(jobs.id, job.id));
    try {
      if (job.kind === "analyze_record_version" && job.recordVersionId) {
        const payload = (job.payload ?? {}) as { aiRunId?: string };
        await runAnalysisJob(job.recordVersionId, payload.aiRunId);
      } else if (job.kind === "generate_report") {
        const payload = (job.payload ?? {}) as { reportRunId?: string };
        if (!payload.reportRunId) throw new Error("reportRunId missing from job payload");
        await runReportJob(payload.reportRunId);
      } else if (job.kind === "generate_export") {
        const payload = (job.payload ?? {}) as { exportJobId?: string };
        if (!payload.exportJobId) throw new Error("exportJobId missing from job payload");
        await runExportJob(payload.exportJobId);
      }
      await db
        .update(jobs)
        .set({ status: "succeeded", lastError: null, lockedAt: null, lockedBy: null, finishedAt: new Date(), updatedAt: new Date() })
        .where(eq(jobs.id, job.id));
      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      const dead = job.attempts + 1 >= job.maxAttempts;
      await db
        .update(jobs)
        .set({
          status: dead ? "dead" : "queued",
          lastError: message,
          runAfter: new Date(Date.now() + 30_000 * (job.attempts + 1)),
          lockedAt: null,
          lockedBy: null,
          finishedAt: dead ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));
      if (job.recordVersionId) {
        await db
          .update(records)
          .set({ aiStatus: dead ? "failed" : "queued", updatedAt: new Date() })
          .where(eq(records.headVersionId, job.recordVersionId));
      }
      errors.push(message);
    }
  }

  return { processed, errors };
}

export async function retryJob(jobId: string) {
  await db
    .update(jobs)
    .set({ status: "queued", runAfter: new Date(), lastError: null, updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
}
