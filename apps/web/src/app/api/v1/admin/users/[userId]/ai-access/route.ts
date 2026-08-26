import { NextResponse } from "next/server";
import { aiAccessUpdateBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { setUserAiAccess } from "@/lib/access-admin";
import { apiErrorResponse, requestId } from "@/lib/api-error";

type Context = { params: Promise<{ userId: string }> };

export async function PATCH(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("permissions.assign");
    if (error || !user) return error;
    const body = aiAccessUpdateBodySchema.parse(await req.json());
    return NextResponse.json(await setUserAiAccess({
      actorId: user.id,
      targetUserId: (await params).userId,
      enabled: body.enabled,
      reason: body.reason,
    }));
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
