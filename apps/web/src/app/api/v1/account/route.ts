import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { records, recordVersions, users } from "@cnpaf/db/schema";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/http";
import { audit } from "@/lib/audit";
import { destroySession } from "@/lib/session";
import { deleteObject } from "@/lib/storage";

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
  const account = (
    await db
      .select({ avatarStorageKey: users.avatarStorageKey })
      .from(users)
      .where(eq(users.id, user!.id))
      .limit(1)
  )[0];
  await db
    .update(users)
    .set({
      status: "deleted",
      email: `deleted+${user!.id}@invalid.local`,
      name: "Deleted user",
      avatarStorageKey: null,
      avatarMimeType: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user!.id));
  if (account?.avatarStorageKey) {
    await deleteObject(account.avatarStorageKey).catch((cleanupError) =>
      console.error("Could not delete account avatar", {
        userId: user!.id,
        cleanupError,
      }),
    );
  }
  await audit({ actorId: user!.id, action: "delete", entityType: "user", entityId: user!.id });
  await destroySession();
  return NextResponse.json({ ok: true });
}
