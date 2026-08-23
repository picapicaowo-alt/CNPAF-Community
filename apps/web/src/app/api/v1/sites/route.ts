import { NextResponse } from "next/server";
import { siteCreateBodySchema } from "@cnpaf/shared";
import { requireOps, requireUser, jsonError } from "@/lib/http";
import { createSite, mergeSite, searchSites } from "@/lib/sites";
import { audit } from "@/lib/audit";

export async function GET(req: Request) {
  const { error } = await requireUser();
  if (error) return error;
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const rows = await searchSites(q);
  return NextResponse.json({ sites: rows });
}

export async function POST(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  const parsed = siteCreateBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid site");
  const result = await createSite(parsed.data, user!.id);
  return NextResponse.json(result);
}

export async function PATCH(req: Request) {
  const { user, error } = await requireOps();
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
