import { NextResponse } from "next/server";
import { aiWorkflowBodySchema } from "@cnpaf/shared";
import { createAiWorkflow, listAiWorkflows } from "@/lib/ai-workflows";
import { jsonError, requirePermission } from "@/lib/http";

export async function GET() {
  const { error } = await requirePermission("ai.configure_workflows");
  if (error) return error;
  return NextResponse.json({ workflows: await listAiWorkflows() });
}

export async function POST(req: Request) {
  const { user, error } = await requirePermission("ai.configure_workflows");
  if (error || !user) return error;
  const parsed = aiWorkflowBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  return NextResponse.json({ workflow: await createAiWorkflow(parsed.data, user.id) }, { status: 201 });
}
