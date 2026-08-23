import { NextResponse } from "next/server";
import { aiProviderConfigBodySchema } from "@cnpaf/shared";
import { createAiProviderConfig, listAiProviderConfigs } from "@/lib/ai-workflows";
import { jsonError, requirePermission } from "@/lib/http";

export async function GET() {
  const { error } = await requirePermission("ai.configure_workflows");
  if (error) return error;
  return NextResponse.json({ providers: await listAiProviderConfigs() });
}

export async function POST(req: Request) {
  const { user, error } = await requirePermission("ai.configure_workflows");
  if (error || !user) return error;
  const parsed = aiProviderConfigBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  try {
    return NextResponse.json({ provider: await createAiProviderConfig(parsed.data, user.id) }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not create provider config", 409);
  }
}
