import { NextResponse } from "next/server";
import { institutionCreateBodySchema } from "@cnpaf/shared";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { requireAnyPermission, requirePermission } from "@/lib/http";
import { createInstitution, listInstitutions } from "@/lib/modules/institutions";

export async function GET(req: Request) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requireAnyPermission(["people.view", "users.view"]);
    if (error || !user) return error;
    return NextResponse.json({ institutions: await listInstitutions(user.id) });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}

export async function POST(req: Request) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("people.edit_affiliation");
    if (error || !user) return error;
    const institution = await createInstitution(
      user.id,
      institutionCreateBodySchema.parse(await req.json()),
      traceId,
    );
    return NextResponse.json({ institution }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
