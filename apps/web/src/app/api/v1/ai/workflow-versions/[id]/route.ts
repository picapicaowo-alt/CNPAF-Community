import { NextResponse } from "next/server";
import { aiWorkflowVersionUpdateBodySchema } from "@cnpaf/shared";
import { updateAiWorkflowVersion } from "@/lib/ai-workflows";
import { jsonError, requirePermission } from "@/lib/http";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("ai.configure_workflows");
  if (error || !user) return error;
  const parsed = aiWorkflowVersionUpdateBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  try {
    return NextResponse.json({ version: await updateAiWorkflowVersion((await params).id, parsed.data, user.id) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not update workflow version", 409);
  }
}
