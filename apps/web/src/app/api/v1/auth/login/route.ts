import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { users } from "@cnpaf/db/schema";
import { loginBodySchema } from "@cnpaf/shared";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";
import { jsonError } from "@/lib/http";

export async function POST(req: Request) {
  const parsed = loginBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid credentials", 400);
  const user = (
    await db.select().from(users).where(eq(users.email, parsed.data.email.toLowerCase())).limit(1)
  )[0];
  if (!user || user.status !== "active") return jsonError("Invalid credentials", 401);
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return jsonError("Invalid credentials", 401);
  await createSession(user.id);
  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, locale: user.locale, mustChangePassword: user.mustChangePassword },
  });
}
