import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/http";
import { authorize } from "@/lib/authorization";
import { getTemplateBundle } from "@/lib/templates";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error || !user) return error;
  const { id } = await params;
  const bundle = await getTemplateBundle(id);
  if (!bundle) return jsonError("Template not found", 404);
  const decision = await authorize({ userId: user.id, permission: "templates.view", resource: { templateId: id, organizationId: bundle.template.organizationId } });
  return decision.allowed ? NextResponse.json(bundle) : jsonError("Forbidden", 403);
}
