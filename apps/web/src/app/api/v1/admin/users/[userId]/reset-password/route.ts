import { NextResponse } from "next/server";
import { resetPasswordBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { resetUserPassword } from "@/lib/modules/accounts";

type Context = { params: Promise<{ userId: string }> };
export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("people.reset_password");
    if (error || !user) return error;
    const result = await resetUserPassword(user.id, (await params).userId, resetPasswordBodySchema.parse(await req.json()), traceId);
    return NextResponse.json(result);
  } catch (error) { return apiErrorResponse(error, traceId); }
}
