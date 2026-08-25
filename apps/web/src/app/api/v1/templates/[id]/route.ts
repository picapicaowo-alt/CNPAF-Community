import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/http";
import { authorize } from "@/lib/authorization";
import { archiveTemplate, getTemplateBundle } from "@/lib/templates";
import { audit } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error || !user) return error;
  const { id } = await params;
  const bundle = await getTemplateBundle(id);
  if (!bundle) return jsonError("Template not found", 404);
  const decision = await authorize({ userId: user.id, permission: "templates.view", resource: { templateId: id, organizationId: bundle.template.organizationId } });
  return decision.allowed ? NextResponse.json(bundle) : jsonError("Forbidden", 403);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error || !user) return error;
  const { id } = await params;
  const bundle = await getTemplateBundle(id);
  if (!bundle) return jsonError("Template not found", 404);
  const decision = await authorize({
    userId: user.id,
    permission: "templates.archive",
    resource: { templateId: id, organizationId: bundle.template.organizationId },
  });
  if (!decision.allowed) return jsonError("Forbidden", 403);
  const template = await archiveTemplate(id);
  await audit({
    actorId: user.id,
    action: "template.archived",
    entityType: "template",
    entityId: id,
    beforeState: bundle.template,
    afterState: template,
  });
  return NextResponse.json({ template });
}
