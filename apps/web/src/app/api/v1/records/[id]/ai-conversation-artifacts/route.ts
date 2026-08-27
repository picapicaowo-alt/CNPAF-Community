import { z } from "zod";
import { privateNoStoreJson, requireUser } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { createAiConversationArtifact } from "@/lib/ai-conversation-artifacts";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  title: z.string().trim().min(1).max(140).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const traceId = requestId(req);
  const { user, error } = await requireUser();
  if (error || !user) return error;
  try {
    const body = bodySchema.parse(await req.json());
    return privateNoStoreJson({
      artifact: await createAiConversationArtifact({
        actorId: user.id,
        recordId: (await ctx.params).id,
        conversationId: body.conversationId,
        title: body.title,
        requestId: traceId,
      }),
    }, { status: 201 });
  } catch (caught) {
    return apiErrorResponse(caught, traceId);
  }
}
