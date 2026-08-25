import { NextResponse } from "next/server";
import { reportTemplateBodySchema } from "@cnpaf/shared";
import { createReportTemplate, listReportTemplates } from "@/lib/reports";
import { jsonError, requirePermission } from "@/lib/http";

export async function GET() {
  const { error } = await requirePermission("reports.view");
  if (error) return error;
  return NextResponse.json({ reportTemplates: await listReportTemplates() });
}

export async function POST(req: Request) {
  const { user, error } = await requirePermission("reports.publish");
  if (error) return error;
  const parsed = reportTemplateBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  try {
    return NextResponse.json(await createReportTemplate(parsed.data, user.id), { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not create report template", 409);
  }
}
