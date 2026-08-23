import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { configRegistryItems } from "@cnpaf/db/schema";
import { db } from "@/lib/db";
import { requirePermission, jsonError } from "@/lib/http";
import { audit } from "@/lib/audit";

export async function POST(_req: Request, { params }: { params: Promise<{ registryKey: string; id: string }> }) {
  const { user, error } = await requirePermission("services.manage");
  if (error || !user) return error;
  const { id } = await params;
  const [item] = await db.update(configRegistryItems).set({ status: "archived", updatedAt: new Date() }).where(eq(configRegistryItems.id, id)).returning();
  if (!item) return jsonError("Registry item not found", 404);
  await audit({ actorId: user.id, action: "registry.item_archived", entityType: "config_registry_item", entityId: id, afterState: item });
  return NextResponse.json({ item });
}
