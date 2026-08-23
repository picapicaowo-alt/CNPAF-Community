import { NextResponse } from "next/server";
import { aiWorkflowVersionBodySchema } from "@cnpaf/shared";
import { createAiWorkflowVersion } from "@/lib/ai-workflows";
import { jsonError, requirePermission } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("ai.configure_workflows");
  if (error || !user) return error;
  const parsed = aiWorkflowVersionBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { id } = await params;
  return NextResponse.json({ version: await createAiWorkflowVersion(id, parsed.data, user.id) }, { status: 201 });
}
