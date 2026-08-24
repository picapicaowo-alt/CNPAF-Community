import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { privacyFlags, records } from "@cnpaf/db/schema";
import { privacyResolveBodySchema } from "@cnpaf/shared";
import { db } from "@/lib/db";
import { requireUser, jsonError } from "@/lib/http";
import { authorize } from "@/lib/authorization";
import { resolvePrivacyFlag } from "@/lib/privacy-review";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error || !user) return error;
  const parsed = privacyResolveBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { id } = await params;
  const resource = (await db.select({ record: records }).from(privacyFlags).innerJoin(records, eq(privacyFlags.recordId, records.id)).where(eq(privacyFlags.id, id)).limit(1))[0]?.record;
  if (!resource) return jsonError("Privacy flag not found", 404);
  const decision = await authorize({ userId: user.id, permission: "privacy.resolve", resource: { organizationId: resource.organizationId, programId: resource.programId, siteId: resource.siteId, serviceKey: resource.sourceKind, researchUse: resource.researchUseStatus } });
  if (!decision.allowed) return jsonError("Forbidden", 403);
  try {
    return NextResponse.json(await resolvePrivacyFlag({ flagId: id, actorId: user.id, body: parsed.data }));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not resolve privacy flag", 409);
  }
}
