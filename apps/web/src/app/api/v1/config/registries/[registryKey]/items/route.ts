import { NextResponse } from "next/server";
import { registryItemBodySchema } from "@cnpaf/shared";
import { requirePermission, jsonError } from "@/lib/http";
import { createRegistryItem } from "@/lib/registries";
import { audit } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: Promise<{ registryKey: string }> }) {
  const { user, error } = await requirePermission("services.manage");
  if (error || !user) return error;
  const parsed = registryItemBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const { registryKey } = await params;
  try {
    const item = await createRegistryItem(registryKey, parsed.data, user.id);
    await audit({ actorId: user.id, action: "registry.item_created", entityType: "config_registry_item", entityId: item.id, afterState: item });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not create registry item", 409);
  }
}
