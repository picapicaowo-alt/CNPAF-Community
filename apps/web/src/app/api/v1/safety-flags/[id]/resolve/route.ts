import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { records, safetyFlags } from "@cnpaf/db/schema";
import { safetyResolveBodySchema } from "@cnpaf/shared";
import { db } from "@/lib/db";
import { requireUser, jsonError } from "@/lib/http";
import { authorize } from "@/lib/authorization";
import { resolveSafetyFlag } from "@/lib/safety-review";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error || !user) return error;
  const parsed = safetyResolveBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { id } = await params;
  const record = (await db.select({ record: records }).from(safetyFlags).innerJoin(records, eq(safetyFlags.recordId, records.id)).where(eq(safetyFlags.id, id)).limit(1))[0]?.record;
  if (!record) return jsonError("Safety flag not found", 404);
  const decision = await authorize({ userId: user.id, permission: "safety.resolve", resource: { organizationId: record.organizationId, programId: record.programId, siteId: record.siteId, serviceKey: record.sourceKind } });
  if (!decision.allowed) return jsonError("Forbidden", 403);
  try {
    return NextResponse.json({ flag: await resolveSafetyFlag(id, user.id, parsed.data) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not resolve safety flag", 409);
  }
}
