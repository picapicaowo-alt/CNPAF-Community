import { NextResponse } from "next/server";
import { registryItemBodySchema } from "@cnpaf/shared";
import { requireRegistryManagement, jsonError } from "@/lib/http";
import { createRegistryItem } from "@/lib/registries";
import { apiErrorResponse } from "@/lib/api-error";

export async function POST(req: Request, { params }: { params: Promise<{ registryKey: string }> }) {
  const { registryKey } = await params;
  const { user, error } = await requireRegistryManagement(registryKey);
  if (error || !user) return error;
  const parsed = registryItemBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  try {
    const item = await createRegistryItem(registryKey, parsed.data, user.id);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
