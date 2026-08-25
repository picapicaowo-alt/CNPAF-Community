import { NextResponse } from "next/server";
import { count, eq, sql } from "drizzle-orm";
import { jobs } from "@cnpaf/db/schema";
import { db } from "@/lib/db";
import { storageBackend } from "@/lib/storage";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    const queued = await db.select({ n: count() }).from(jobs).where(eq(jobs.status, "queued"));
    const dead = await db.select({ n: count() }).from(jobs).where(eq(jobs.status, "dead"));
    return NextResponse.json({
      ok: true,
      db: true,
      storage: storageBackend(),
      jobs: { queued: Number(queued[0]?.n ?? 0), dead: Number(dead[0]?.n ?? 0) },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "health failed" },
      { status: 503 },
    );
  }
}
