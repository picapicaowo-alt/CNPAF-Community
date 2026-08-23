import { NextResponse } from "next/server";
import { requireUser } from "@/lib/http";
import { getAccessContext, serializeAccessContext } from "@/lib/authorization";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const access = serializeAccessContext(await getAccessContext(user!.id));
  return NextResponse.json({
    user: {
      id: user!.id,
      email: user!.email,
      name: user!.name,
      organizationId: user!.organizationId,
      locale: user!.locale,
      legacyRole: user!.role,
    },
    ...access,
    capabilities: access.permissions,
  });
}
