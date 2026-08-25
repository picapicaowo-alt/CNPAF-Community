import { NextResponse } from "next/server";
import { templateOrderBodySchema } from "@cnpaf/shared";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/authorization";
import { jsonError, requirePermission } from "@/lib/http";
import { getTemplateAuthorizationResource, reorderTemplateSections } from "@/lib/templates";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("templates.edit");
  if (error) return error;
  const parsed = templateOrderBodySchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { id } = await params;
  const resource = await getTemplateAuthorizationResource("version", id);
  if (!resource) return jsonError("Template version not found", 404);
  if (!(await authorize({ userId: user.id, permission: "templates.edit", resource })).allowed)
    return jsonError("Forbidden", 403);
  try {
    const sections = await reorderTemplateSections(id, parsed.data.orderedIds);
    await audit({ actorId: user.id, action: "template.sections_reordered", entityType: "template_version", entityId: id, metadata: parsed.data });
    return NextResponse.json({ sections });
  } catch (caught) {
    return jsonError(caught instanceof Error ? caught.message : "Could not reorder sections", 409);
  }
}
