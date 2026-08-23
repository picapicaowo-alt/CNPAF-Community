import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { safetyFlags } from "@cnpaf/db/schema";
import { db } from "@/lib/db";
import { requireOps, jsonError } from "@/lib/http";

export async function GET() {
  const { error } = await requireOps();
  if (error) return error;
  const rows = await db.select().from(safetyFlags).orderBy(desc(safetyFlags.createdAt));
  return NextResponse.json({ flags: rows });
}

export async function PATCH(req: Request) {
  const { error } = await requireOps();
  if (error) return error;
  const body = (await req.json()) as { id?: string; status?: string };
  if (!body.id || !body.status) return jsonError("id and status required");
  await db
    .update(safetyFlags)
    .set({ status: body.status, updatedAt: new Date() })
    .where(eq(safetyFlags.id, body.id));
  return NextResponse.json({ ok: true });
}
