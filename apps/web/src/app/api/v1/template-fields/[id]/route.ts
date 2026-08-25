import { NextResponse } from "next/server";
import { templateFieldUpdateBodySchema } from "@cnpaf/shared";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/authorization";
import { jsonError, requirePermission } from "@/lib/http";
import {
  deleteTemplateField,
  getTemplateAuthorizationResource,
  updateTemplateField,
} from "@/lib/templates";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { user, error } = await requirePermission("templates.edit");
  if (error) return error;
  const parsed = templateFieldUpdateBodySchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { id } = await params;
  const resource = await getTemplateAuthorizationResource("field", id);
  if (!resource) return jsonError("Template field not found", 404);
  if (!(await authorize({ userId: user.id, permission: "templates.edit", resource })).allowed)
    return jsonError("Forbidden", 403);
  try {
    const result = await updateTemplateField(id, parsed.data);
    await audit({
      actorId: user.id,
      action: "template.field_updated",
      entityType: "template_field",
      entityId: id,
      beforeState: result.existing,
      afterState: result.field,
    });
    return NextResponse.json({ field: result.field });
  } catch (caught) {
    return jsonError(caught instanceof Error ? caught.message : "Could not update field", 409);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const { user, error } = await requirePermission("templates.edit");
  if (error) return error;
  const { id } = await params;
  const resource = await getTemplateAuthorizationResource("field", id);
  if (!resource) return jsonError("Template field not found", 404);
  if (!(await authorize({ userId: user.id, permission: "templates.edit", resource })).allowed)
    return jsonError("Forbidden", 403);
  try {
    const field = await deleteTemplateField(id);
    await audit({
      actorId: user.id,
      action: "template.field_deleted",
      entityType: "template_field",
      entityId: id,
      beforeState: field,
    });
    return NextResponse.json({ deleted: true });
  } catch (caught) {
    return jsonError(caught instanceof Error ? caught.message : "Could not delete field", 409);
  }
}
