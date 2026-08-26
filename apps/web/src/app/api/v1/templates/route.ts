import { NextResponse } from "next/server";
import { templateCreateBodySchema } from "@cnpaf/shared";
import { requirePermission, jsonError } from "@/lib/http";
import {
  createTemplate,
  listTemplateBundles,
  listTemplates,
} from "@/lib/templates";
import { getAccessContext, evaluateAuthorization } from "@/lib/authorization";
import { audit } from "@/lib/audit";

export async function GET(req: Request) {
  const { user, error } = await requirePermission("templates.view");
  if (error || !user) return error;
  const context = await getAccessContext(user.id);
  const wantsCards = new URL(req.url).searchParams.get("view") === "cards";
  if (wantsCards) {
    const bundles = (await listTemplateBundles()).filter(({ template }) =>
      evaluateAuthorization(context, "templates.view", {
        templateId: template.id,
        organizationId: template.organizationId,
      }).allowed,
    );
    return NextResponse.json({ templates: bundles });
  }
  const rows = (await listTemplates()).filter((template) =>
    evaluateAuthorization(context, "templates.view", { templateId: template.id, organizationId: template.organizationId }).allowed,
  );
  return NextResponse.json({ templates: rows });
}

export async function POST(req: Request) {
  const { user, error } = await requirePermission("templates.create");
  if (error || !user) return error;
  const parsed = templateCreateBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const decision = evaluateAuthorization(await getAccessContext(user.id), "templates.create", { organizationId: parsed.data.organizationId });
  if (!decision.allowed) return jsonError("Forbidden for organization scope", 403);
  try {
    const result = await createTemplate(parsed.data, user.id);
    await audit({ actorId: user.id, action: "template.created", entityType: "template", entityId: result.template.id, afterState: result });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not create template", 409);
  }
}
