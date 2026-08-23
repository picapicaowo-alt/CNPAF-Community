import { NextResponse } from "next/server";
import { lookups, activityDefinitions, canonicalThemes } from "@cnpaf/db/schema";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/http";

export async function GET() {
  const { error } = await requireUser();
  if (error) return error;
  const [lookupRows, activities, themes] = await Promise.all([
    db.select().from(lookups).where(eq(lookups.status, "active")),
    db.select().from(activityDefinitions).where(eq(activityDefinitions.status, "active")),
    db.select().from(canonicalThemes).where(eq(canonicalThemes.status, "active")),
  ]);
  return NextResponse.json({ lookups: lookupRows, activities, themes });
}
