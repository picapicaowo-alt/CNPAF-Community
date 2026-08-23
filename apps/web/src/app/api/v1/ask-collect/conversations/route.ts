import { NextResponse } from "next/server";
import { askConversationBodySchema } from "@cnpaf/shared";
import { createAskConversation } from "@/lib/ask-collect";
import { jsonError, requirePermission } from "@/lib/http";

export async function POST(req: Request) {
  const { user, error } = await requirePermission("chat.ask_collect");
  if (error || !user) return error;
  const parsed = askConversationBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  return NextResponse.json({ conversation: await createAskConversation(user.id, parsed.data) }, { status: 201 });
}
