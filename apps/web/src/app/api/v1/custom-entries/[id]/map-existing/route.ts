import { NextResponse } from "next/server";
import { customEntryDecisionBodySchema } from "@cnpaf/shared";
import { requirePermission, jsonError } from "@/lib/http";
import { reviewCustomEntry } from "@/lib/custom-entries";
import { apiErrorResponse } from "@/lib/api-error";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("taxonomy.approve_mapping");
  if (error || !user) return error;
  const parsed = customEntryDecisionBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { id } = await params;
  try { return NextResponse.json(await reviewCustomEntry({ id, actorId: user.id, action: "mapped_existing", body: parsed.data })); }
  catch (error) { return apiErrorResponse(error); }
}
