import { NextResponse } from "next/server";
import { personGroupCreateBodySchema } from "@cnpaf/shared";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { requireAnyPermission, requirePermission } from "@/lib/http";
import {
  createPersonGroup,
  listPersonGroups,
} from "@/lib/modules/person-groups";

export async function GET(req: Request) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requireAnyPermission(["people.view", "users.view"]);
    if (error || !user) return error;
    return NextResponse.json({ groups: await listPersonGroups(user.id) });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}

export async function POST(req: Request) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("people.manage_groups");
    if (error || !user) return error;
    const group = await createPersonGroup(
      user.id,
      personGroupCreateBodySchema.parse(await req.json()),
      traceId,
    );
    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
