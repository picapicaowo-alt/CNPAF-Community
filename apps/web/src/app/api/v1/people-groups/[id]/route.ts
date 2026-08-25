import { NextResponse } from "next/server";
import { personGroupUpdateBodySchema } from "@cnpaf/shared";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { requirePermission } from "@/lib/http";
import { updatePersonGroup } from "@/lib/modules/person-groups";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("people.manage_groups");
    if (error || !user) return error;
    const group = await updatePersonGroup(
      user.id,
      (await params).id,
      personGroupUpdateBodySchema.parse(await req.json()),
      traceId,
    );
    return NextResponse.json({ group });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
