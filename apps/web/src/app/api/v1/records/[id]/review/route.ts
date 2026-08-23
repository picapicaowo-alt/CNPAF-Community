import { NextResponse } from "next/server";
import { reviewBodySchema } from "@cnpaf/shared";
import { requireOps, jsonError } from "@/lib/http";
import { applyReview } from "@/lib/review";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireOps();
  if (error) return error;
  const { id } = await ctx.params;
  const parsed = reviewBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid review");
  try {
    const result = await applyReview(user!, id, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Review failed");
  }
}
