import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/authorization";
import { jsonError, requirePermission } from "@/lib/http";
import {
  duplicateTemplateSection,
  getTemplateAuthorizationResource,
} from "@/lib/templates";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await requirePermission("templates.edit");
  if (error) return error;
  const { id } = await params;
  const resource = await getTemplateAuthorizationResource("section", id);
  if (!resource) return jsonError("Template section not found", 404);
  if (!(await authorize({ userId: user.id, permission: "templates.edit", resource })).allowed)
    return jsonError("Forbidden", 403);
  try {
    const section = await duplicateTemplateSection(id);
    await audit({ actorId: user.id, action: "template.section_duplicated", entityType: "template_section", entityId: section.id, metadata: { sourceSectionId: id } });
    return NextResponse.json({ section }, { status: 201 });
  } catch (caught) {
    return jsonError(caught instanceof Error ? caught.message : "Could not duplicate section", 409);
  }
}
