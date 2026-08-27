import { requireUser } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import {
  downloadAiConversationArtifact,
} from "@/lib/ai-conversation-artifacts";
import { aiConversationArtifactFilename } from "@/lib/ai-conversation-markdown";

export async function GET(req: Request, ctx: { params: Promise<{ id: string; artifactId: string }> }) {
  const traceId = requestId(req);
  const { user, error } = await requireUser();
  if (error || !user) return error;
  try {
    const { id, artifactId } = await ctx.params;
    const result = await downloadAiConversationArtifact({ actorId: user.id, recordId: id, artifactId });
    const filename = aiConversationArtifactFilename(result.artifact.title, result.version.revisionNumber);
    return new Response(result.object.body, {
      headers: {
        "Content-Type": result.object.contentType || "text/markdown; charset=utf-8",
        ...(result.object.contentLength ? { "Content-Length": String(result.object.contentLength) } : {}),
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename="ai-conversation-v${result.version.revisionNumber}.md"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (caught) {
    return apiErrorResponse(caught, traceId);
  }
}
