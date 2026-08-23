import { NextResponse } from "next/server";
import { templateVersionCreateBodySchema } from "@cnpaf/shared";
import { requirePermission, jsonError } from "@/lib/http";
import { createTemplateVersion, getTemplateAuthorizationResource } from "@/lib/templates";
import { authorize } from "@/lib/authorization";
import { audit } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("templates.edit");
  if (error || !user) return error;
  const parsed = templateVersionCreateBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { id } = await params;
  const resource = await getTemplateAuthorizationResource("template", id);
  if (!resource) return jsonError("Template not found", 404);
  if (!(await authorize({ userId: user.id, permission: "templates.edit", resource })).allowed) return jsonError("Forbidden", 403);
  try {
    const version = await createTemplateVersion(id, parsed.data, user.id);
    await audit({ actorId: user.id, action: "template.version_created", entityType: "template_version", entityId: version.id, afterState: version });
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not create template version", 409);
  }
}
