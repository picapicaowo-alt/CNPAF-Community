import { dataDownloadBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { downloadRecord } from "@/lib/modules/datasets";

type Context = { params: Promise<{ id: string }> };
export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("records.download");
    if (error || !user) return error;
    const result = await downloadRecord(user.id, (await params).id, dataDownloadBodySchema.parse(await req.json()), traceId);
    return new Response(new Uint8Array(result.body), { headers: { "content-type": result.mimeType, "content-disposition": `attachment; filename="record.${result.extension}"`, "x-request-id": traceId } });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
