import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { templateVersions } from "@cnpaf/db/schema";
import { templateVersionUpdateBodySchema } from "@cnpaf/shared";
import { db } from "@/lib/db";
import { requirePermission, jsonError } from "@/lib/http";
import { getTemplateVersionBundle } from "@/lib/templates";
import { getTemplateAuthorizationResource } from "@/lib/templates";
import { authorize } from "@/lib/authorization";
import { audit } from "@/lib/audit";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Context) {
  const { user, error } = await requirePermission("templates.view");
  if (error) return error;
  const { id } = await params;
  const resource = await getTemplateAuthorizationResource("version", id);
  if (!resource) return jsonError("Template version not found", 404);
  if (!(await authorize({ userId: user.id, permission: "templates.view", resource })).allowed) return jsonError("Forbidden", 403);
  const bundle = await getTemplateVersionBundle(id);
  return bundle ? NextResponse.json(bundle) : jsonError("Template version not found", 404);
}

export async function PATCH(req: Request, { params }: Context) {
  const { user, error } = await requirePermission("templates.edit");
  if (error) return error;
  const parsed = templateVersionUpdateBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { id } = await params;
  const resource = await getTemplateAuthorizationResource("version", id);
  if (!resource) return jsonError("Template version not found", 404);
  if (!(await authorize({ userId: user.id, permission: "templates.edit", resource })).allowed) return jsonError("Forbidden", 403);
  const existing = (await db.select().from(templateVersions).where(eq(templateVersions.id, id)).limit(1))[0];
  if (!existing) return jsonError("Template version not found", 404);
  if (existing.status !== "draft") return jsonError("Published template versions are immutable", 409);
  const [version] = await db.update(templateVersions).set({ ...parsed.data, updatedAt: new Date() }).where(eq(templateVersions.id, id)).returning();
  await audit({ actorId: user.id, action: "template.version_updated", entityType: "template_version", entityId: id, beforeState: existing, afterState: version });
  return NextResponse.json({ version });
}
