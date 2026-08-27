import { NextResponse } from "next/server";
import { completePasswordResetBodySchema } from "@cnpaf/shared";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { completePasswordReset } from "@/lib/modules/account-recovery";

export async function POST(req: Request) {
  const traceId = requestId(req);
  try {
    const input = completePasswordResetBodySchema.parse(await req.json());
    return NextResponse.json(await completePasswordReset(input.token, input.newPassword, traceId));
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
