import { NextResponse } from "next/server";
import { siteCreateBodySchema } from "@cnpaf/shared";
import { requirePermission, requireUser, jsonError } from "@/lib/http";
import { createSite, mergeSite, searchSites } from "@/lib/sites";
import { audit } from "@/lib/audit";
import { evaluateAuthorization, getAccessContext } from "@/lib/authorization";

export async function GET(req: Request) {
  const { user, error } = await requireUser();
  if (error || !user) return error;
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const rows = await searchSites(q);
  const access = await getAccessContext(user.id);
  const visible = rows.filter((site) => ["records.create", "records.view", "records.review", "sites.manage"].some((permission) => evaluateAuthorization(access, permission, { organizationId: site.organizationId, siteId: site.id }).allowed));
  return NextResponse.json({ sites: visible });
}

export async function POST(req: Request) {
  const parsed = siteCreateBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid site");
  const { user, error } = await requireUser();
  if (error || !user) return error;
  const access = await getAccessContext(user.id);
  const canCreate = ["records.create", "sites.manage"].some((permission) => evaluateAuthorization(access, permission, { organizationId: user.organizationId }).allowed);
  if (!canCreate) return jsonError("Forbidden", 403);
  const result = await createSite(parsed.data, user.id);
  return NextResponse.json(result);
}

export async function PATCH(req: Request) {
  const { user, error } = await requirePermission("sites.manage");
  if (error) return error;
  const body = (await req.json()) as { fromId?: string; intoId?: string };
  if (!body.fromId || !body.intoId) return jsonError("fromId and intoId required");
  await mergeSite(body.fromId, body.intoId);
  await audit({
    actorId: user!.id,
    action: "site_merge",
    entityType: "site",
    entityId: body.fromId,
    metadata: { intoId: body.intoId },
  });
  return NextResponse.json({ ok: true });
}
