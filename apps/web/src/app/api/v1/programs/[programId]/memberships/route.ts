import { NextResponse } from "next/server";
import { programMembershipRequestBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { addProgramMembership, addProgramMemberships } from "@/lib/modules/programs";

type Context = { params: Promise<{ programId: string }> };

export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("programs.manage_membership");
    if (error || !user) return error;
    const input = programMembershipRequestBodySchema.parse(await req.json());
    const programId = (await params).programId;
    if ("userIds" in input) {
      const memberships = await addProgramMemberships(
        user.id,
        programId,
        input,
        traceId,
      );
      return NextResponse.json({ memberships }, { status: 201 });
    }
    const membership = await addProgramMembership(
      user.id,
      programId,
      input,
      traceId,
    );
    return NextResponse.json({ membership }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
