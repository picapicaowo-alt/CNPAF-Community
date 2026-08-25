import { NextResponse } from "next/server";
import { templateOrderBodySchema } from "@cnpaf/shared";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/authorization";
import { jsonError, requirePermission } from "@/lib/http";
import { getTemplateAuthorizationResource, reorderTemplateFields } from "@/lib/templates";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("templates.edit");
  if (error) return error;
  const parsed = templateOrderBodySchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { id } = await params;
  const resource = await getTemplateAuthorizationResource("section", id);
  if (!resource) return jsonError("Template section not found", 404);
  if (!(await authorize({ userId: user.id, permission: "templates.edit", resource })).allowed)
    return jsonError("Forbidden", 403);
  try {
    const fields = await reorderTemplateFields(id, parsed.data.orderedIds);
    await audit({ actorId: user.id, action: "template.fields_reordered", entityType: "template_section", entityId: id, metadata: parsed.data });
    return NextResponse.json({ fields });
  } catch (caught) {
    return jsonError(caught instanceof Error ? caught.message : "Could not reorder fields", 409);
  }
}
