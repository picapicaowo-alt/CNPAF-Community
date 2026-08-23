import { NextResponse } from "next/server";
import { templateFieldBodySchema } from "@cnpaf/shared";
import { requirePermission, jsonError } from "@/lib/http";
import { addTemplateField, getTemplateAuthorizationResource } from "@/lib/templates";
import { authorize } from "@/lib/authorization";
import { audit } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("templates.edit");
  if (error) return error;
  const parsed = templateFieldBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { id } = await params;
  const resource = await getTemplateAuthorizationResource("section", id);
  if (!resource) return jsonError("Template section not found", 404);
  if (!(await authorize({ userId: user.id, permission: "templates.edit", resource })).allowed) return jsonError("Forbidden", 403);
  try {
    const field = await addTemplateField(id, parsed.data);
    await audit({ actorId: user.id, action: "template.field_created", entityType: "template_field", entityId: field.id, afterState: field });
    return NextResponse.json({ field }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not add field", 409);
  }
}
