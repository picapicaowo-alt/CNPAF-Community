import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { auditEvents, configRegistries, configRegistryItems } from "@cnpaf/db/schema";
import type { z } from "zod";
import type { registryItemBodySchema, registryItemUpdateBodySchema } from "@cnpaf/shared";
import { audit } from "./audit";
import { db } from "./db";
import { ApiError } from "./api-error";

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

export async function requireActiveRegistryItem(registryKey: string, itemKey: string, organizationId?: string | null) {
  const rows = await db.select({ registry: configRegistries, item: configRegistryItems })
    .from(configRegistryItems)
    .innerJoin(configRegistries, eq(configRegistryItems.registryId, configRegistries.id))
    .where(and(
      eq(configRegistries.key, registryKey),
      eq(configRegistries.status, "active"),
      eq(configRegistryItems.key, itemKey),
      eq(configRegistryItems.status, "active"),
      organizationId
        ? or(eq(configRegistryItems.organizationId, organizationId), isNull(configRegistryItems.organizationId))
        : isNull(configRegistryItems.organizationId),
    ))
    .orderBy(desc(configRegistryItems.version));
  const selected = rows.find((row) => row.item.organizationId === organizationId)
    ?? rows.find((row) => row.item.organizationId === null);
  if (!selected) throw new ApiError("BAD_REQUEST", `Unknown or inactive ${registryKey} value`, 400, { itemKey });
  return selected.item;
}

export async function createRegistryItem(registryKey: string, input: RegistryItemInput, actorId: string) {
  const registry = await getRegistryByKey(registryKey);
  if (!registry || registry.status !== "active") throw new ApiError("NOT_FOUND", "Active registry not found", 404);
  return db.transaction(async (tx) => {
    const [item] = await tx.insert(configRegistryItems).values({
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
    }).onConflictDoNothing({ target: [configRegistryItems.registryId, configRegistryItems.key, configRegistryItems.version] }).returning();
    if (!item) throw new ApiError("CONFLICT", "Registry item key already exists", 409);
    await audit({ actorId, action: "registry.item_created", entityType: "config_registry_item", entityId: item.id, afterState: item, metadata: { registryKey } }, (values) => tx.insert(auditEvents).values(values));
    return item;
  });
}

export async function updateRegistryItem(registryKey: string, id: string, input: RegistryItemUpdate, actorId: string) {
  const current = (await db.select({ item: configRegistryItems, registry: configRegistries }).from(configRegistryItems)
    .innerJoin(configRegistries, eq(configRegistryItems.registryId, configRegistries.id))
    .where(eq(configRegistryItems.id, id)).limit(1))[0];
  if (!current || current.registry.key !== registryKey) throw new ApiError("NOT_FOUND", "Registry item not found", 404);
  const { publishNewVersion, ...values } = input;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from config_registry_items where id = ${id} for update`);
    const fresh = (await tx.select().from(configRegistryItems).where(eq(configRegistryItems.id, id)).limit(1))[0];
    if (!fresh) throw new ApiError("NOT_FOUND", "Registry item not found", 404);
    if (publishNewVersion || fresh.status === "active") {
      if (values.key && values.key !== fresh.key) throw new ApiError("BAD_REQUEST", "A versioned registry item key cannot be changed", 400);
      const latest = (await tx.select({ id: configRegistryItems.id, version: configRegistryItems.version }).from(configRegistryItems)
        .where(and(eq(configRegistryItems.registryId, fresh.registryId), eq(configRegistryItems.key, fresh.key)))
        .orderBy(desc(configRegistryItems.version)).limit(1))[0];
      if (latest && latest.id !== fresh.id) throw new ApiError("CONFLICT", "Only the latest registry item version can be updated", 409);
      const [created] = await tx.insert(configRegistryItems).values({
        registryId: fresh.registryId,
        key: values.key ?? fresh.key,
        version: (latest?.version ?? fresh.version) + 1,
        labelEn: values.labelEn ?? fresh.labelEn,
        labelZh: values.labelZh ?? fresh.labelZh,
        helpTextEn: values.helpTextEn === undefined ? fresh.helpTextEn : values.helpTextEn,
        helpTextZh: values.helpTextZh === undefined ? fresh.helpTextZh : values.helpTextZh,
        status: values.status ?? "active",
        sortOrder: values.sortOrder ?? fresh.sortOrder,
        metadata: values.metadata ?? fresh.metadata,
        canonicalItemId: values.canonicalItemId === undefined ? fresh.canonicalItemId : values.canonicalItemId,
        organizationId: values.organizationId === undefined ? fresh.organizationId : values.organizationId,
        supersedesItemId: fresh.id,
        publishedAt: (values.status ?? "active") === "active" ? new Date() : null,
        createdById: actorId,
      }).returning();
      await tx.update(configRegistryItems).set({ status: "archived", updatedAt: new Date() }).where(eq(configRegistryItems.id, fresh.id));
      await audit({ actorId, action: "registry.item_version_created", entityType: "config_registry_item", entityId: created.id, beforeState: fresh, afterState: created, metadata: { registryKey, supersedesItemId: fresh.id } }, (auditValues) => tx.insert(auditEvents).values(auditValues));
      return created;
    }
    const [updated] = await tx.update(configRegistryItems).set({ ...values, updatedAt: new Date() }).where(eq(configRegistryItems.id, id)).returning();
    await audit({ actorId, action: "registry.item_updated", entityType: "config_registry_item", entityId: id, beforeState: fresh, afterState: updated, metadata: { registryKey } }, (auditValues) => tx.insert(auditEvents).values(auditValues));
    return updated;
  });
}

export async function archiveRegistryItem(registryKey: string, id: string, actorId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from config_registry_items where id = ${id} for update`);
    const row = (await tx.select({ item: configRegistryItems, registry: configRegistries }).from(configRegistryItems)
      .innerJoin(configRegistries, eq(configRegistryItems.registryId, configRegistries.id))
      .where(eq(configRegistryItems.id, id)).limit(1))[0];
    if (!row || row.registry.key !== registryKey) throw new ApiError("NOT_FOUND", "Registry item not found", 404);
    if (row.item.status === "archived") return row.item;
    const [archived] = await tx.update(configRegistryItems).set({ status: "archived", updatedAt: new Date() }).where(eq(configRegistryItems.id, id)).returning();
    await audit({ actorId, action: "registry.item_archived", entityType: "config_registry_item", entityId: id, beforeState: row.item, afterState: archived, metadata: { registryKey } }, (values) => tx.insert(auditEvents).values(values));
    return archived;
  });
}
