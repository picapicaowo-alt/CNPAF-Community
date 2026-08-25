import { downloadExport } from "@/lib/exports";
import { jsonError, requirePermission } from "@/lib/http";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("exports.download");
  if (error || !user) return error;
  try {
    const result = await downloadExport((await params).id, user.id);
    if (!result) return jsonError("Export is not ready", 404);
    return new Response(new Uint8Array(result.object.body), {
      headers: {
        "Content-Type": result.job.mimeType ?? result.object.contentType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="cnpaf-export-${result.job.id}.${result.job.exportTypeKey.toLowerCase().includes("csv") ? "csv" : "json"}"`,
      },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not download export", 410);
  }
}
