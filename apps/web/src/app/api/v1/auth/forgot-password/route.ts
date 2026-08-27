import { after, NextResponse } from "next/server";
import { forgotPasswordBodySchema } from "@cnpaf/shared";
import { processNotificationEmailJobs } from "@/lib/jobs";
import { requestPasswordReset } from "@/lib/modules/account-recovery";
import { requestId } from "@/lib/api-error";

const acceptedMessage = "If an active account matches that email, a password reset link will be sent.";

export async function POST(req: Request) {
  const traceId = requestId(req);
  const parsed = forgotPasswordBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  try {
    await requestPasswordReset(parsed.data.email, traceId);
    after(() => processNotificationEmailJobs());
  } catch (error) {
    // This public endpoint must not reveal whether the address exists. Keep the
    // response identical while retaining server-side evidence for operators.
    console.error("Password reset request could not be queued", { traceId, error });
  }
  return NextResponse.json({ ok: true, message: acceptedMessage }, { status: 202 });
}
