import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { invites, users } from "@cnpaf/db/schema";
import { acceptInviteBodySchema, inviteBodySchema } from "@cnpaf/shared";
import { db } from "@/lib/db";
import { requireOps } from "@/lib/http";
import { randomToken, sha256 } from "@/lib/crypto";
import { createSession } from "@/lib/session";
import { jsonError } from "@/lib/http";

export async function GET() {
  const { error } = await requireOps();
  if (error) return error;
  const rows = await db.select().from(invites);
  return NextResponse.json({
    invites: rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      acceptedAt: r.acceptedAt,
      expiresAt: r.expiresAt,
    })),
  });
}

export async function POST(req: Request) {
  const { user, error } = await requireOps();
  if (error) return error;
  const parsed = inviteBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid invite");
  const token = randomToken(24);
  await db.insert(invites).values({
    email: parsed.data.email.toLowerCase(),
    role: parsed.data.role,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
    createdById: user!.id,
  });
  return NextResponse.json({ token, acceptPath: `/invite/${token}` });
}

export async function PUT(req: Request) {
  const parsed = acceptInviteBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid payload");
  const invite = (
    await db.select().from(invites).where(eq(invites.tokenHash, sha256(parsed.data.token))).limit(1)
  )[0];
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return jsonError("Invite expired or invalid", 400);
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const [created] = await db
    .insert(users)
    .values({
      email: invite.email,
      name: parsed.data.name,
      passwordHash,
      role: invite.role,
    })
    .returning();
  await db
    .update(invites)
    .set({ acceptedAt: new Date(), updatedAt: new Date() })
    .where(eq(invites.id, invite.id));
  await createSession(created.id);
  return NextResponse.json({ user: { id: created.id, email: created.email, role: created.role } });
}
