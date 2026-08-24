import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse } from "@/lib/api-error";
import { archiveRegistryItem } from "@/lib/registries";

export async function POST(_req: Request, { params }: { params: Promise<{ registryKey: string; id: string }> }) {
  const { user, error } = await requirePermission("services.manage");
  if (error || !user) return error;
  const { registryKey, id } = await params;
  try { return NextResponse.json({ item: await archiveRegistryItem(registryKey, id, user.id) }); }
  catch (error) { return apiErrorResponse(error); }
}
