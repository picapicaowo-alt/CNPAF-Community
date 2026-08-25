import { NextResponse } from "next/server";
import { requireRegistryManagement } from "@/lib/http";
import { apiErrorResponse } from "@/lib/api-error";
import { archiveRegistryItem } from "@/lib/registries";

export async function POST(_req: Request, { params }: { params: Promise<{ registryKey: string; id: string }> }) {
  const { registryKey, id } = await params;
  const { user, error } = await requireRegistryManagement(registryKey);
  if (error || !user) return error;
  try { return NextResponse.json({ item: await archiveRegistryItem(registryKey, id, user.id) }); }
  catch (error) { return apiErrorResponse(error); }
}
