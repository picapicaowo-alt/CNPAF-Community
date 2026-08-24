import { NextResponse } from "next/server";
import { programMembershipBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { addProgramMembership } from "@/lib/modules/programs";

type Context = { params: Promise<{ programId: string }> };

export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("programs.manage_membership");
    if (error || !user) return error;
    const membership = await addProgramMembership(user.id, (await params).programId, programMembershipBodySchema.parse(await req.json()), traceId);
    return NextResponse.json({ membership }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
