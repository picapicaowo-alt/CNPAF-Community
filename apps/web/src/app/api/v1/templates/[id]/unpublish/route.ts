import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/authorization";
import { jsonError, requirePermission } from "@/lib/http";
import {
  getTemplateAuthorizationResource,
  unpublishTemplate,
} from "@/lib/templates";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await requirePermission("templates.publish");
  if (error || !user) return error;
  const { id } = await params;
  const resource = await getTemplateAuthorizationResource("template", id);
  if (!resource) return jsonError("Template not found", 404);
  const [mayPublish, mayEdit] = await Promise.all([
    authorize({ userId: user.id, permission: "templates.publish", resource }),
    authorize({ userId: user.id, permission: "templates.edit", resource }),
  ]);
  if (!mayPublish.allowed || !mayEdit.allowed) return jsonError("Forbidden", 403);
  try {
    const result = await unpublishTemplate(id, user.id);
    await audit({
      actorId: user.id,
      action: "template.unpublished",
      entityType: "template",
      entityId: id,
      beforeState: result.previousPublishedVersion,
      afterState: result,
    });
    return NextResponse.json(result);
  } catch (caught) {
    return jsonError(
      caught instanceof Error ? caught.message : "Could not unpublish template",
      409,
    );
  }
}
