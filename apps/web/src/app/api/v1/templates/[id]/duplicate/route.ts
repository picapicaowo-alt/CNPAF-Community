import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/authorization";
import { jsonError, requirePermission } from "@/lib/http";
import {
  duplicateTemplate,
  getTemplateAuthorizationResource,
} from "@/lib/templates";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await requirePermission("templates.create");
  if (error || !user) return error;
  const { id } = await params;
  const resource = await getTemplateAuthorizationResource("template", id);
  if (!resource) return jsonError("Template not found", 404);
  const [mayView, mayCreate] = await Promise.all([
    authorize({ userId: user.id, permission: "templates.view", resource }),
    authorize({
      userId: user.id,
      permission: "templates.create",
      resource: { organizationId: resource.organizationId },
    }),
  ]);
  if (!mayView.allowed || !mayCreate.allowed) return jsonError("Forbidden", 403);
  const body = (await request.json().catch(() => ({}))) as {
    purpose?: "form" | "template";
  };
  const purpose = body.purpose === "template" ? "template" : "form";
  try {
    const result = await duplicateTemplate(id, user.id, purpose);
    await audit({
      actorId: user.id,
      action:
        purpose === "template"
          ? "template.saved_as_reusable"
          : "template.duplicated",
      entityType: "template",
      entityId: result.template.id,
      afterState: result,
      metadata: { sourceTemplateId: id },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (caught) {
    return jsonError(
      caught instanceof Error ? caught.message : "Could not duplicate template",
      409,
    );
  }
}
