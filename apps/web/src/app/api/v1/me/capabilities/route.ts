import { NextResponse } from "next/server";
import { requireUser } from "@/lib/http";
import { getAccessContext, serializeAccessContext } from "@/lib/authorization";

export async function GET() {
  const { user, error } = await requireUser();
  if (error || !user) return error;
  const access = serializeAccessContext(await getAccessContext(user.id));
  return NextResponse.json({
    roles: access.roles,
    permissions: access.permissions,
    capabilities: access.permissions,
    scopes: access.scopes,
  });
}
