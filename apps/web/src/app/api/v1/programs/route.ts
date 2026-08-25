import { NextResponse } from "next/server";
import { programCreateBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { createProgram, listPrograms } from "@/lib/modules/programs";

export async function GET() {
  const { user, error } = await requirePermission("programs.view");
  if (error || !user) return error;
  return NextResponse.json({ programs: await listPrograms(user.id) });
}

export async function POST(req: Request) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("programs.manage");
    if (error || !user) return error;
    const program = await createProgram(user.id, programCreateBodySchema.parse(await req.json()), traceId);
    return NextResponse.json({ program }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
