import { getDatasetAttachmentFile } from "@/lib/modules/datasets";
import { requirePermission } from "@/lib/http";
import { getObject } from "@/lib/storage";
import { inlineContentDisposition } from "@/lib/attachments";
import { apiErrorResponse } from "@/lib/api-error";

export async function GET(
  request: Request,
  context: { params: Promise<{ datasetId: string; attachmentId: string }> },
) {
  try {
    const { user, error } = await requirePermission("datasets.download");
    if (error || !user) return error;
    const { datasetId, attachmentId } = await context.params;
    const versionId = new URL(request.url).searchParams.get("versionId");
    const attachment = await getDatasetAttachmentFile(
      user.id,
      datasetId,
      attachmentId,
      versionId,
    );
    const { body, contentType } = await getObject(attachment.storageKey);
    return new Response(new Uint8Array(body), {
      headers: {
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": inlineContentDisposition(attachment.storageKey),
        "Content-Length": String(body.length),
        "Content-Type": contentType || attachment.mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (caught) { return apiErrorResponse(caught); }
}
