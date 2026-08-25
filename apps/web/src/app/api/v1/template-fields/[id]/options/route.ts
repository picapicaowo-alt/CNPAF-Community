import { NextResponse } from "next/server";
import { templateFieldOptionBodySchema } from "@cnpaf/shared";
import { requirePermission, jsonError } from "@/lib/http";
import { addTemplateFieldOption, getTemplateAuthorizationResource } from "@/lib/templates";
import { authorize } from "@/lib/authorization";
import { audit } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("templates.edit");
  if (error) return error;
  const parsed = templateFieldOptionBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { id } = await params;
  const resource = await getTemplateAuthorizationResource("field", id);
  if (!resource) return jsonError("Template field not found", 404);
  if (!(await authorize({ userId: user.id, permission: "templates.edit", resource })).allowed) return jsonError("Forbidden", 403);
  try {
    const option = await addTemplateFieldOption(id, parsed.data);
    await audit({ actorId: user.id, action: "template.option_created", entityType: "template_field_option", entityId: option.id, afterState: option });
    return NextResponse.json({ option }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not add option", 409);
  }
}
