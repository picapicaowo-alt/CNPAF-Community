import { NextResponse } from "next/server";
import { askMessageBodySchema } from "@cnpaf/shared";
import { addAskMessage } from "@/lib/ask-collect";
import { jsonError, requirePermission } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("chat.ask_collect");
  if (error || !user) return error;
  const parsed = askMessageBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  try {
    return NextResponse.json(await addAskMessage((await params).id, user.id, parsed.data.content), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not answer question";
    const status = message === "Conversation not found" ? 404 : message.includes("personal information") ? 400 : 409;
    return jsonError(message, status);
  }
}
