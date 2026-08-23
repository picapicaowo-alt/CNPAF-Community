import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { records, recordVersions, users } from "@cnpaf/db/schema";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/http";
import { audit } from "@/lib/audit";
import { destroySession } from "@/lib/session";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const mine = await db.select().from(records).where(eq(records.createdById, user!.id));
  const versions = [];
  for (const rec of mine) {
    const vs = await db.select().from(recordVersions).where(eq(recordVersions.recordId, rec.id));
    versions.push(...vs);
  }
  await audit({
    actorId: user!.id,
    action: "export",
    entityType: "user",
    entityId: user!.id,
  });
  return NextResponse.json({ user, records: mine, versions });
}

export async function DELETE() {
  const { user, error } = await requireUser();
  if (error) return error;
  await db
    .update(users)
    .set({ status: "deleted", email: `deleted+${user!.id}@invalid.local`, name: "Deleted user", updatedAt: new Date() })
    .where(eq(users.id, user!.id));
  await audit({ actorId: user!.id, action: "delete", entityType: "user", entityId: user!.id });
  await destroySession();
  return NextResponse.json({ ok: true });
}
