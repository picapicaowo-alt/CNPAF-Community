import { z } from "zod";
import { privateNoStoreJson, requireUser } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { updateAiConversationArtifact } from "@/lib/ai-conversation-artifacts";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), title: z.string().trim().min(1).max(140) }),
  z.object({ action: z.literal("refresh") }),
  z.object({ action: z.literal("archive"), reason: z.string().trim().min(1).max(500) }),
]);

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; artifactId: string }> }) {
  const traceId = requestId(req);
  const { user, error } = await requireUser();
  if (error || !user) return error;
  try {
    const body = bodySchema.parse(await req.json());
    const { id, artifactId } = await ctx.params;
    return privateNoStoreJson({
      artifact: await updateAiConversationArtifact({
        actorId: user.id,
        recordId: id,
        artifactId,
        requestId: traceId,
        ...body,
      }),
    });
  } catch (caught) {
    return apiErrorResponse(caught, traceId);
  }
}
