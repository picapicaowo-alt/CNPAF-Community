import { NextResponse } from "next/server";
import { promptVersionBodySchema } from "@cnpaf/shared";
import { createPromptVersion, listPromptVersions } from "@/lib/ai-workflows";
import { jsonError, requirePermission } from "@/lib/http";

export async function GET() {
  const { error } = await requirePermission("ai.configure_prompts");
  if (error) return error;
  return NextResponse.json({ promptVersions: await listPromptVersions() });
}

export async function POST(req: Request) {
  const { user, error } = await requirePermission("ai.configure_prompts");
  if (error || !user) return error;
  const parsed = promptVersionBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  return NextResponse.json({ promptVersion: await createPromptVersion(parsed.data, user.id) }, { status: 201 });
}
