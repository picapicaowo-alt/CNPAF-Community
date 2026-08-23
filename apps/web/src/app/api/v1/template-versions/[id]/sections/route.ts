import { NextResponse } from "next/server";
import { templateSectionBodySchema } from "@cnpaf/shared";
import { requirePermission, jsonError } from "@/lib/http";
import { addTemplateSection, getTemplateAuthorizationResource } from "@/lib/templates";
import { authorize } from "@/lib/authorization";
import { audit } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("templates.edit");
  if (error) return error;
  const parsed = templateSectionBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { id } = await params;
  const resource = await getTemplateAuthorizationResource("version", id);
  if (!resource) return jsonError("Template version not found", 404);
  if (!(await authorize({ userId: user.id, permission: "templates.edit", resource })).allowed) return jsonError("Forbidden", 403);
  try {
    const section = await addTemplateSection(id, parsed.data);
    await audit({ actorId: user.id, action: "template.section_created", entityType: "template_section", entityId: section.id, afterState: section });
    return NextResponse.json({ section }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not add section", 409);
  }
}
