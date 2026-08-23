import { and, asc, eq, lte } from "drizzle-orm";
import { jobs, records } from "@cnpaf/db/schema";
import { db } from "./db";
import { runAnalysisJob } from "./ai";

const MAX_ATTEMPTS = 3;

export async function enqueueAnalyze(recordVersionId: string) {
  await db
    .insert(jobs)
    .values({
      kind: "analyze_record_version",
      recordVersionId,
      status: "queued",
      maxAttempts: MAX_ATTEMPTS,
    })
    .onConflictDoNothing({ target: [jobs.kind, jobs.recordVersionId] });
}

export async function processJobs(limit = 5): Promise<{ processed: number; errors: string[] }> {
  const due = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, "queued"), lte(jobs.runAfter, new Date())))
    .orderBy(asc(jobs.runAfter))
    .limit(limit);

  const errors: string[] = [];
  let processed = 0;

  for (const job of due) {
    await db
      .update(jobs)
      .set({ status: "running", attempts: job.attempts + 1, updatedAt: new Date() })
      .where(eq(jobs.id, job.id));
    try {
      if (job.kind === "analyze_record_version" && job.recordVersionId) {
        await runAnalysisJob(job.recordVersionId);
      }
      await db
        .update(jobs)
        .set({ status: "succeeded", lastError: null, updatedAt: new Date() })
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
