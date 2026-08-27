import { after, NextResponse } from "next/server";
import { affiliationBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { addUserAffiliation } from "@/lib/modules/accounts";
import { processNotificationEmailJobs } from "@/lib/jobs";

type Context = { params: Promise<{ userId: string }> };
export async function POST(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("people.edit_affiliation");
    if (error || !user) return error;
    const affiliation = await addUserAffiliation(user.id, (await params).userId, affiliationBodySchema.parse(await req.json()), traceId);
    after(() => processNotificationEmailJobs());
    return NextResponse.json({ affiliation }, { status: 201 });
  } catch (error) { return apiErrorResponse(error, traceId); }
}
