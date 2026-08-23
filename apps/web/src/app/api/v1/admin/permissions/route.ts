import { NextResponse } from "next/server";
import { permissions } from "@cnpaf/db/schema";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/http";

export async function GET() {
  const { error } = await requirePermission("roles.view");
  if (error) return error;
  return NextResponse.json({ permissions: await db.select().from(permissions) });
}
