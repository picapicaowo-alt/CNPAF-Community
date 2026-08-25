import { NextResponse } from "next/server";
import { templateOrderBodySchema } from "@cnpaf/shared";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/authorization";
import { jsonError, requirePermission } from "@/lib/http";
import { getTemplateAuthorizationResource, reorderTemplateFieldOptions } from "@/lib/templates";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("templates.edit");
  if (error) return error;
  const parsed = templateOrderBodySchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { id } = await params;
  const resource = await getTemplateAuthorizationResource("field", id);
  if (!resource) return jsonError("Template field not found", 404);
  if (!(await authorize({ userId: user.id, permission: "templates.edit", resource })).allowed)
    return jsonError("Forbidden", 403);
  try {
    const options = await reorderTemplateFieldOptions(id, parsed.data.orderedIds);
    await audit({ actorId: user.id, action: "template.options_reordered", entityType: "template_field", entityId: id, metadata: parsed.data });
    return NextResponse.json({ options });
  } catch (caught) {
    return jsonError(caught instanceof Error ? caught.message : "Could not reorder options", 409);
  }
}
