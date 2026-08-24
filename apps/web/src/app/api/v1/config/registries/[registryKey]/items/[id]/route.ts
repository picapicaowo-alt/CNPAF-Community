import { NextResponse } from "next/server";
import { registryItemUpdateBodySchema } from "@cnpaf/shared";
import { requirePermission, jsonError } from "@/lib/http";
import { updateRegistryItem } from "@/lib/registries";
import { apiErrorResponse } from "@/lib/api-error";

export async function PATCH(req: Request, { params }: { params: Promise<{ registryKey: string; id: string }> }) {
  const { user, error } = await requirePermission("services.manage");
  if (error || !user) return error;
  const parsed = registryItemUpdateBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { registryKey, id } = await params;
  try {
    const item = await updateRegistryItem(registryKey, id, parsed.data, user.id);
    return NextResponse.json({ item });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
