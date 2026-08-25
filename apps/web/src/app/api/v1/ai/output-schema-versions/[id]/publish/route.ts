import { NextResponse } from "next/server";
import { publishOutputSchemaVersion } from "@/lib/ai-workflows";
import { jsonError, requirePermission } from "@/lib/http";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("ai.configure_workflows");
  if (error || !user) return error;
  try {
    return NextResponse.json({ outputSchemaVersion: await publishOutputSchemaVersion((await params).id, user.id) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not publish output schema version", 409);
  }
}
