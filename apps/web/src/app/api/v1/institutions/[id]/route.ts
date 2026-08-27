import { NextResponse } from "next/server";
import { institutionUpdateBodySchema } from "@cnpaf/shared";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { requirePermission } from "@/lib/http";
import { updateInstitution } from "@/lib/modules/institutions";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Context) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("people.edit_affiliation");
    if (error || !user) return error;
    const institution = await updateInstitution(
      user.id,
      (await params).id,
      institutionUpdateBodySchema.parse(await req.json()),
      traceId,
    );
    return NextResponse.json({ institution });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
