import { and, desc, eq, sql } from "drizzle-orm";
import { auditEvents, configRegistries, configRegistryItems, customEntryReviews, recordCustomEntries, records, recordVersions } from "@cnpaf/db/schema";
import type { z } from "zod";
import type { customEntryDecisionBodySchema } from "@cnpaf/shared";
import { db } from "./db";
import { evaluateAuthorization, getAccessContext } from "./authorization";
import { audit } from "./audit";
import { ApiError } from "./api-error";

type CustomEntryDecision = z.infer<typeof customEntryDecisionBodySchema>;
type CustomAction = "mapped_existing" | "created_new" | "keep_free_text" | "dismissed";

export async function listCustomEntries(userId: string, status = "pending") {
  const rows = await db
    .select({ entry: recordCustomEntries, record: records })
    .from(recordCustomEntries)
    .innerJoin(recordVersions, eq(recordCustomEntries.recordVersionId, recordVersions.id))
    .innerJoin(records, eq(recordVersions.recordId, records.id))
    .where(eq(recordCustomEntries.mappingStatus, status))
    .orderBy(desc(recordCustomEntries.createdAt));
  const context = await getAccessContext(userId);
  return rows.filter(({ record }) => evaluateAuthorization(context, "taxonomy.approve_mapping", {
    organizationId: record.organizationId,
    programId: record.programId,
    siteId: record.siteId,
    serviceKey: record.sourceKind,
  }).allowed);
}

export async function reviewCustomEntry(input: {
  id: string;
  actorId: string;
  action: CustomAction;
  body: CustomEntryDecision;
}) {
  const resource = (await db
    .select({ entry: recordCustomEntries, record: records })
    .from(recordCustomEntries)
    .innerJoin(recordVersions, eq(recordCustomEntries.recordVersionId, recordVersions.id))
    .innerJoin(records, eq(recordVersions.recordId, records.id))
    .where(eq(recordCustomEntries.id, input.id))
    .limit(1))[0];
  const before = resource?.entry;
  if (!before || !resource) throw new ApiError("NOT_FOUND", "Custom entry not found", 404);
  const access = await getAccessContext(input.actorId);
  if (!evaluateAuthorization(access, "taxonomy.approve_mapping", {
    organizationId: resource.record.organizationId,
    programId: resource.record.programId,
    siteId: resource.record.siteId,
    serviceKey: resource.record.sourceKind,
  }).allowed) throw new ApiError("FORBIDDEN", "Custom entry is outside the assigned scope", 403);
  if (before.mappingStatus !== "pending") throw new ApiError("INVALID_TRANSITION", "Custom entry has already been reviewed", 409);

  let mappedCanonicalOptionId = input.action === "mapped_existing" ? input.body.canonicalOptionId ?? null : null;
  if (input.action === "mapped_existing" && !mappedCanonicalOptionId) throw new ApiError("BAD_REQUEST", "canonicalOptionId is required", 400);
  let targetRegistry: typeof configRegistries.$inferSelect | null = null;
  if (input.action === "created_new") {
    if (!input.body.registryKey || !input.body.newOption) throw new ApiError("BAD_REQUEST", "registryKey and newOption are required", 400);
    targetRegistry = (await db.select().from(configRegistries).where(eq(configRegistries.key, input.body.registryKey)).limit(1))[0] ?? null;
    if (!targetRegistry || targetRegistry.status !== "active") throw new ApiError("BAD_REQUEST", "Active target registry not found", 400);
    if (input.body.newOption.organizationId && input.body.newOption.organizationId !== resource.record.organizationId) {
      throw new ApiError("BAD_REQUEST", "New option belongs to another organization", 400);
    }
  }
  if (mappedCanonicalOptionId) {
    const canonical = (await db.select({ item: configRegistryItems, registry: configRegistries }).from(configRegistryItems)
      .innerJoin(configRegistries, eq(configRegistryItems.registryId, configRegistries.id))
      .where(eq(configRegistryItems.id, mappedCanonicalOptionId)).limit(1))[0];
    if (!canonical || canonical.item.status !== "active" || canonical.registry.status !== "active") throw new ApiError("BAD_REQUEST", "Active canonical option not found", 400);
    if (canonical.item.organizationId && canonical.item.organizationId !== resource.record.organizationId) throw new ApiError("BAD_REQUEST", "Canonical option belongs to another organization", 400);
    if (input.body.registryKey && canonical.registry.key !== input.body.registryKey) throw new ApiError("BAD_REQUEST", "Canonical option belongs to another registry", 400);
  }

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from record_custom_entries where id = ${input.id} for update`);
    const current = (await tx.select().from(recordCustomEntries).where(eq(recordCustomEntries.id, input.id)).limit(1))[0];
    if (!current || current.mappingStatus !== "pending") throw new ApiError("CONFLICT", "Custom entry changed concurrently", 409);
    let createdOptionId: string | null = null;
    if (input.action === "created_new" && targetRegistry && input.body.newOption) {
      const newOption = input.body.newOption;
      const [created] = await tx.insert(configRegistryItems).values({
        registryId: targetRegistry.id,
        key: newOption.key,
        version: 1,
        labelEn: newOption.labelEn,
        labelZh: newOption.labelZh,
        helpTextEn: newOption.helpTextEn,
        helpTextZh: newOption.helpTextZh,
        status: "draft",
        sortOrder: newOption.sortOrder,
        metadata: newOption.metadata,
        canonicalItemId: newOption.canonicalItemId,
        organizationId: newOption.organizationId ?? resource.record.organizationId,
        createdById: input.actorId,
      }).onConflictDoNothing({ target: [configRegistryItems.registryId, configRegistryItems.key, configRegistryItems.version] }).returning();
      if (!created) throw new ApiError("CONFLICT", "Registry item key already exists", 409);
      mappedCanonicalOptionId = created.id;
      createdOptionId = created.id;
      await audit({ actorId: input.actorId, action: "registry.item_created", entityType: "config_registry_item", entityId: created.id, afterState: created, metadata: { registryKey: targetRegistry.key, sourceCustomEntryId: input.id } }, (values) => tx.insert(auditEvents).values(values));
    }
    const [entry] = await tx.update(recordCustomEntries).set({
      mappingStatus: input.action,
      mappedCanonicalOptionId,
      reviewedById: input.actorId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(recordCustomEntries.id, input.id), eq(recordCustomEntries.mappingStatus, "pending"))).returning();
    if (!entry) throw new ApiError("CONFLICT", "Custom entry changed concurrently", 409);
    const [review] = await tx.insert(customEntryReviews).values({
      customEntryId: input.id,
      reviewerId: input.actorId,
      action: input.action,
      mappedCanonicalOptionId,
      createdOptionId,
      notes: input.body.notes,
    }).returning();
    await audit({ actorId: input.actorId, action: `custom_entry.${input.action}`, entityType: "record_custom_entry", entityId: input.id, beforeState: before, afterState: entry, reason: input.body.notes ?? null }, (values) => tx.insert(auditEvents).values(values));
    return { entry, review };
  });
  return result;
}
