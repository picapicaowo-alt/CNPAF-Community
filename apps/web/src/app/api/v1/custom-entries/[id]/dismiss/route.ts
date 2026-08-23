import { NextResponse } from "next/server";
import { customEntryDecisionBodySchema } from "@cnpaf/shared";
import { requirePermission, jsonError } from "@/lib/http";
import { reviewCustomEntry } from "@/lib/custom-entries";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePermission("taxonomy.approve_mapping");
  if (error || !user) return error;
  const parsed = customEntryDecisionBodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.message);
  const { id } = await params;
  try { return NextResponse.json(await reviewCustomEntry({ id, actorId: user.id, action: "dismissed", body: parsed.data })); }
  catch (error) { const message = error instanceof Error ? error.message : "Could not dismiss entry"; return jsonError(message, message === "Forbidden" ? 403 : 409); }
}
