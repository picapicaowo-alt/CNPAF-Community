import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { templateFieldOptions } from "@cnpaf/db/schema";
import { templateFieldOptionBodySchema } from "@cnpaf/shared";
import { db } from "@/lib/db";
import { requirePermission, jsonError } from "@/lib/http";
import { getTemplateAuthorizationResource } from "@/lib/templates";
import { authorize } from "@/lib/authorization";
import { audit } from "@/lib/audit";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("templates.edit");
  if (error) return error;
  const parsed = templateFieldOptionBodySchema.partial().safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { id } = await params;
  const resource = await getTemplateAuthorizationResource("option", id);
  if (!resource) return jsonError("Option not found", 404);
  if (!(await authorize({ userId: user.id, permission: "templates.edit", resource })).allowed) return jsonError("Forbidden", 403);
  const existing = (await db.select().from(templateFieldOptions).where(eq(templateFieldOptions.id, id)).limit(1))[0];
  const [option] = await db.update(templateFieldOptions).set({ ...parsed.data, updatedAt: new Date() }).where(eq(templateFieldOptions.id, id)).returning();
  if (option) await audit({ actorId: user.id, action: "template.option_updated", entityType: "template_field_option", entityId: id, beforeState: existing, afterState: option });
  return option ? NextResponse.json({ option }) : jsonError("Option not found", 404);
}
