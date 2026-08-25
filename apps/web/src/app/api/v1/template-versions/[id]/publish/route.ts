import { NextResponse } from "next/server";
import { requirePermission, jsonError } from "@/lib/http";
import { getTemplateAuthorizationResource, publishTemplateVersion } from "@/lib/templates";
import { authorize } from "@/lib/authorization";
import { audit } from "@/lib/audit";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("templates.publish");
  if (error || !user) return error;
  const { id } = await params;
  const resource = await getTemplateAuthorizationResource("version", id);
  if (!resource) return jsonError("Template version not found", 404);
  if (!(await authorize({ userId: user.id, permission: "templates.publish", resource })).allowed) return jsonError("Forbidden", 403);
  try {
    const version = await publishTemplateVersion(id);
    await audit({ actorId: user.id, action: "template.version_published", entityType: "template_version", entityId: id, afterState: version });
    return NextResponse.json({ version });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not publish template version", 409);
  }
}
