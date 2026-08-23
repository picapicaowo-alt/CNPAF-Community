import { and, asc, desc, eq } from "drizzle-orm";
import { configRegistries, configRegistryItems } from "@cnpaf/db/schema";
import type { z } from "zod";
import type { registryItemBodySchema, registryItemUpdateBodySchema } from "@cnpaf/shared";
import { audit } from "./audit";
import { db } from "./db";

type RegistryItemInput = z.infer<typeof registryItemBodySchema>;
type RegistryItemUpdate = z.infer<typeof registryItemUpdateBodySchema>;

export async function getRegistryByKey(key: string) {
  return (await db.select().from(configRegistries).where(eq(configRegistries.key, key)).limit(1))[0];
}

export async function listRegistry(key: string, status?: string | null) {
  const registry = await getRegistryByKey(key);
  if (!registry) return null;
  const items = await db
    .select()
    .from(configRegistryItems)
    .where(
      status
        ? and(eq(configRegistryItems.registryId, registry.id), eq(configRegistryItems.status, status))
        : eq(configRegistryItems.registryId, registry.id),
    )
    .orderBy(asc(configRegistryItems.sortOrder), asc(configRegistryItems.key), desc(configRegistryItems.version));
  return { registry, items };
}

export async function createRegistryItem(registryKey: string, input: RegistryItemInput, actorId: string) {
  const registry = await getRegistryByKey(registryKey);
  if (!registry) throw new Error("Registry not found");
  const [item] = await db.insert(configRegistryItems).values({
    registryId: registry.id,
    key: input.key,
    version: 1,
    labelEn: input.labelEn,
    labelZh: input.labelZh,
    helpTextEn: input.helpTextEn,
    helpTextZh: input.helpTextZh,
    status: input.status,
    sortOrder: input.sortOrder,
    metadata: input.metadata,
    canonicalItemId: input.canonicalItemId,
    organizationId: input.organizationId,
    publishedAt: input.status === "active" ? new Date() : null,
    createdById: actorId,
  }).returning();
  await audit({ actorId, action: "registry.item_created", entityType: "config_registry_item", entityId: item.id, afterState: item, metadata: { registryKey } });
  return item;
}

export async function updateRegistryItem(id: string, input: RegistryItemUpdate, actorId: string) {
  const current = (await db.select().from(configRegistryItems).where(eq(configRegistryItems.id, id)).limit(1))[0];
  if (!current) throw new Error("Registry item not found");
  const { publishNewVersion, ...values } = input;
  if (publishNewVersion || current.status === "active") {
    const [created] = await db.insert(configRegistryItems).values({
      registryId: current.registryId,
      key: values.key ?? current.key,
      version: current.version + 1,
      labelEn: values.labelEn ?? current.labelEn,
      labelZh: values.labelZh ?? current.labelZh,
      helpTextEn: values.helpTextEn === undefined ? current.helpTextEn : values.helpTextEn,
      helpTextZh: values.helpTextZh === undefined ? current.helpTextZh : values.helpTextZh,
      status: values.status ?? "active",
      sortOrder: values.sortOrder ?? current.sortOrder,
      metadata: values.metadata ?? current.metadata,
      canonicalItemId: values.canonicalItemId === undefined ? current.canonicalItemId : values.canonicalItemId,
      organizationId: values.organizationId === undefined ? current.organizationId : values.organizationId,
      supersedesItemId: current.id,
      publishedAt: (values.status ?? "active") === "active" ? new Date() : null,
      createdById: actorId,
    }).returning();
    await db.update(configRegistryItems).set({ status: "archived", updatedAt: new Date() }).where(eq(configRegistryItems.id, current.id));
    await audit({ actorId, action: "registry.item_version_created", entityType: "config_registry_item", entityId: created.id, beforeState: current, afterState: created, metadata: { supersedesItemId: current.id } });
    return created;
  }
  const [updated] = await db.update(configRegistryItems).set({ ...values, updatedAt: new Date() }).where(eq(configRegistryItems.id, id)).returning();
  await audit({ actorId, action: "registry.item_updated", entityType: "config_registry_item", entityId: id, beforeState: current, afterState: updated });
  return updated;
}
