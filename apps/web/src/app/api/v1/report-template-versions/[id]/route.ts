import { NextResponse } from "next/server";
import { reportTemplateVersionUpdateBodySchema } from "@cnpaf/shared";
import { updateReportTemplateVersion } from "@/lib/reports";
import { jsonError, requirePermission } from "@/lib/http";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("reports.publish");
  if (error || !user) return error;
  const parsed = reportTemplateVersionUpdateBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  try {
    return NextResponse.json({ version: await updateReportTemplateVersion((await params).id, parsed.data, user.id) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not update report template version", 409);
  }
}
