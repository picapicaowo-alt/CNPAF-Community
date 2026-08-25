import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/authorization";
import { jsonError, requirePermission } from "@/lib/http";
import {
  duplicateTemplateField,
  getTemplateAuthorizationResource,
} from "@/lib/templates";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await requirePermission("templates.edit");
  if (error) return error;
  const { id } = await params;
  const resource = await getTemplateAuthorizationResource("field", id);
  if (!resource) return jsonError("Template field not found", 404);
  if (!(await authorize({ userId: user.id, permission: "templates.edit", resource })).allowed)
    return jsonError("Forbidden", 403);
  try {
    const field = await duplicateTemplateField(id);
    await audit({ actorId: user.id, action: "template.field_duplicated", entityType: "template_field", entityId: field.id, metadata: { sourceFieldId: id } });
    return NextResponse.json({ field }, { status: 201 });
  } catch (caught) {
    return jsonError(caught instanceof Error ? caught.message : "Could not duplicate field", 409);
  }
}
