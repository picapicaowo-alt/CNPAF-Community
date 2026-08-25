import { NextResponse } from "next/server";
import { programUpdateBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { getProgram, updateProgram } from "@/lib/modules/programs";

type Context = { params: Promise<{ programId: string }> };

export async function GET(_req: Request, { params }: Context) {
  try {
    const { user, error } = await requirePermission("programs.view");
    if (error || !user) return error;
    return NextResponse.json(await getProgram(user.id, (await params).programId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("programs.manage");
    if (error || !user) return error;
    const program = await updateProgram(user.id, (await params).programId, programUpdateBodySchema.parse(await req.json()), traceId);
    return NextResponse.json({ program });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
