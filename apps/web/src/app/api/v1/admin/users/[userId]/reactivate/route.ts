import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { setAccountActive } from "@/lib/modules/accounts";

type Context = { params: Promise<{ userId: string }> };
export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("users.deactivate");
    if (error || !user) return error;
    return NextResponse.json({ user: await setAccountActive(user.id, (await params).userId, true, traceId) });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
