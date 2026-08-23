import { NextResponse } from "next/server";
import { reportTemplateVersionBodySchema } from "@cnpaf/shared";
import { createReportTemplateVersion } from "@/lib/reports";
import { jsonError, requirePermission } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("reports.publish");
  if (error) return error;
  const parsed = reportTemplateVersionBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  try {
    return NextResponse.json({ version: await createReportTemplateVersion((await params).id, parsed.data, user.id) }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not create report template version", 409);
  }
}
