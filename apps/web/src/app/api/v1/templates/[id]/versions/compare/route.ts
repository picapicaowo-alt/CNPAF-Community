import { NextResponse } from "next/server";
import { templateVersionCompareQuerySchema } from "@cnpaf/shared";
import { authorize } from "@/lib/authorization";
import { jsonError, requirePermission } from "@/lib/http";
import {
  compareTemplateVersions,
  getTemplateAuthorizationResource,
} from "@/lib/templates";

type Context = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Context) {
  const { user, error } = await requirePermission("templates.view");
  if (error || !user) return error;
  const { id } = await params;
  const resource = await getTemplateAuthorizationResource("template", id);
  if (!resource) return jsonError("Template not found", 404);
  if (
    !(await authorize({
      userId: user.id,
      permission: "templates.view",
      resource,
    })).allowed
  )
    return jsonError("Forbidden", 403);
  const url = new URL(req.url);
  const parsed = templateVersionCompareQuerySchema.safeParse({
    fromVersionId: url.searchParams.get("fromVersionId"),
    toVersionId: url.searchParams.get("toVersionId"),
  });
  if (!parsed.success) return jsonError(parsed.error.message);
  try {
    return NextResponse.json({
      comparison: await compareTemplateVersions(
        id,
        parsed.data.fromVersionId,
        parsed.data.toVersionId,
      ),
    });
  } catch (caught) {
    return jsonError(
      caught instanceof Error ? caught.message : "Could not compare versions",
      400,
    );
  }
}
