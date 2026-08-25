import { NextResponse } from "next/server";
import { publishAiWorkflowVersion } from "@/lib/ai-workflows";
import { jsonError, requirePermission } from "@/lib/http";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("ai.configure_workflows");
  if (error || !user) return error;
  try {
    return NextResponse.json({ version: await publishAiWorkflowVersion((await params).id, user.id) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not publish workflow version", 409);
  }
}
