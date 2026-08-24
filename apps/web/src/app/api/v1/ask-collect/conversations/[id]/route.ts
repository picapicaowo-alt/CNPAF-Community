import { NextResponse } from "next/server";
import { getAskConversation } from "@/lib/ask-collect";
import { jsonError, requireAnyPermission } from "@/lib/http";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAnyPermission(["chat.ask_collect", "ask_collect.use"]);
  if (error || !user) return error;
  const conversation = await getAskConversation((await params).id, user.id);
  return conversation ? NextResponse.json(conversation) : jsonError("Conversation not found", 404);
}
