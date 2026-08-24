import { NextResponse } from "next/server";
import { siteCreateBodySchema } from "@cnpaf/shared";
import { requirePermission, requireUser, jsonError } from "@/lib/http";
import { createSite, searchSites } from "@/lib/sites";
import { evaluateAuthorization, getAccessContext } from "@/lib/authorization";
import { mergeLocation } from "@/lib/modules/locations";
import { apiErrorResponse, requestId } from "@/lib/api-error";

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
  const organizationId = parsed.data.organizationId ?? user.organizationId;
  if (!organizationId) return jsonError("organizationId is required", 400);
  if (parsed.data.organizationName) return jsonError("organizationName cannot provision or select an organization", 400);
  const access = await getAccessContext(user.id);
  const canCreate = ["records.create", "locations.manage", "sites.manage"].some((permission) => evaluateAuthorization(access, permission, { organizationId }).allowed);
  if (!canCreate) return jsonError("Forbidden", 403);
  const result = await createSite(parsed.data, user.id, organizationId);
  return NextResponse.json(result);
}

export async function PATCH(req: Request) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("locations.manage");
    if (error || !user) return error;
    const body = (await req.json()) as { fromId?: string; intoId?: string; reason?: string };
    if (!body.fromId || !body.intoId || !body.reason?.trim()) return jsonError("fromId, intoId, and reason are required");
    return NextResponse.json(await mergeLocation(user.id, body.fromId, { destinationLocationId: body.intoId, reason: body.reason.trim() }, traceId));
  } catch (error) { return apiErrorResponse(error, traceId); }
}
