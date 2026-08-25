import { NextResponse } from "next/server";
import { templateSectionUpdateBodySchema } from "@cnpaf/shared";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/authorization";
import { jsonError, requirePermission } from "@/lib/http";
import {
  deleteTemplateSection,
  getTemplateAuthorizationResource,
  updateTemplateSection,
} from "@/lib/templates";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { user, error } = await requirePermission("templates.edit");
  if (error) return error;
  const parsed = templateSectionUpdateBodySchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { id } = await params;
  const resource = await getTemplateAuthorizationResource("section", id);
  if (!resource) return jsonError("Template section not found", 404);
  if (!(await authorize({ userId: user.id, permission: "templates.edit", resource })).allowed)
    return jsonError("Forbidden", 403);
  try {
    const result = await updateTemplateSection(id, parsed.data);
    await audit({
      actorId: user.id,
      action: "template.section_updated",
      entityType: "template_section",
      entityId: id,
      beforeState: result.existing,
      afterState: result.section,
    });
    return NextResponse.json({ section: result.section });
  } catch (caught) {
    return jsonError(caught instanceof Error ? caught.message : "Could not update section", 409);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const { user, error } = await requirePermission("templates.edit");
  if (error) return error;
  const { id } = await params;
  const resource = await getTemplateAuthorizationResource("section", id);
  if (!resource) return jsonError("Template section not found", 404);
  if (!(await authorize({ userId: user.id, permission: "templates.edit", resource })).allowed)
    return jsonError("Forbidden", 403);
  try {
    const section = await deleteTemplateSection(id);
    await audit({
      actorId: user.id,
      action: "template.section_deleted",
      entityType: "template_section",
      entityId: id,
      beforeState: section,
    });
    return NextResponse.json({ deleted: true });
  } catch (caught) {
    return jsonError(caught instanceof Error ? caught.message : "Could not delete section", 409);
  }
}
