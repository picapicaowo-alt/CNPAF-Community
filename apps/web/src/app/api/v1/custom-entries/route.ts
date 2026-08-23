import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { listCustomEntries } from "@/lib/custom-entries";

export async function GET(req: Request) {
  const { user, error } = await requirePermission("taxonomy.approve_mapping");
  if (error || !user) return error;
  const status = new URL(req.url).searchParams.get("status") ?? "pending";
  return NextResponse.json({ entries: await listCustomEntries(user.id, status) });
}
