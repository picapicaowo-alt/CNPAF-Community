import { NextResponse } from "next/server";
import { aiModelConfigBodySchema } from "@cnpaf/shared";
import { createAiModelConfig, listAiProviderConfigs } from "@/lib/ai-workflows";
import { jsonError, requirePermission } from "@/lib/http";

export async function GET() {
  const { error } = await requirePermission("ai.configure_workflows");
  if (error) return error;
  const providers = await listAiProviderConfigs();
  return NextResponse.json({ models: providers.flatMap((entry) => entry.models) });
}

export async function POST(req: Request) {
  const { user, error } = await requirePermission("ai.configure_workflows");
  if (error || !user) return error;
  const parsed = aiModelConfigBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  try {
    return NextResponse.json({ model: await createAiModelConfig(parsed.data, user.id) }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not create model config", 409);
  }
}
