import { NextResponse } from "next/server";
import { aiModelConfigUpdateBodySchema } from "@cnpaf/shared";
import { updateAiModelConfig } from "@/lib/ai-workflows";
import { jsonError, requirePermission } from "@/lib/http";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("ai.configure_workflows");
  if (error || !user) return error;
  const parsed = aiModelConfigUpdateBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  try {
    return NextResponse.json({ model: await updateAiModelConfig((await params).id, parsed.data, user.id) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not update model config", 409);
  }
}
