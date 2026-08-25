import { NextResponse } from "next/server";
import { requirePermission, jsonError } from "@/lib/http";
import { archiveTemplateFieldOption, getTemplateAuthorizationResource } from "@/lib/templates";
import { authorize } from "@/lib/authorization";
import { audit } from "@/lib/audit";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("templates.edit");
  if (error) return error;
  const { id } = await params;
  const resource = await getTemplateAuthorizationResource("option", id);
  if (!resource) return jsonError("Option not found", 404);
  if (!(await authorize({ userId: user.id, permission: "templates.edit", resource })).allowed) return jsonError("Forbidden", 403);
  try {
    const result = await archiveTemplateFieldOption(id);
    await audit({ actorId: user.id, action: "template.option_archived", entityType: "template_field_option", entityId: id, beforeState: result.existing, afterState: result.option });
    return NextResponse.json({ option: result.option });
  } catch (caught) {
    return jsonError(caught instanceof Error ? caught.message : "Could not archive option", 409);
  }
}
