import { NextResponse } from "next/server";
import { templateFieldOptionUpdateBodySchema } from "@cnpaf/shared";
import { requirePermission, jsonError } from "@/lib/http";
import { getTemplateAuthorizationResource, updateTemplateFieldOption } from "@/lib/templates";
import { authorize } from "@/lib/authorization";
import { audit } from "@/lib/audit";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("templates.edit");
  if (error) return error;
  const parsed = templateFieldOptionUpdateBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { id } = await params;
  const resource = await getTemplateAuthorizationResource("option", id);
  if (!resource) return jsonError("Option not found", 404);
  if (!(await authorize({ userId: user.id, permission: "templates.edit", resource })).allowed) return jsonError("Forbidden", 403);
  try {
    const result = await updateTemplateFieldOption(id, parsed.data);
    await audit({ actorId: user.id, action: "template.option_updated", entityType: "template_field_option", entityId: id, beforeState: result.existing, afterState: result.option });
    return NextResponse.json({ option: result.option });
  } catch (caught) {
    return jsonError(caught instanceof Error ? caught.message : "Could not update option", 409);
  }
}
