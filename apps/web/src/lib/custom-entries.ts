import { desc, eq } from "drizzle-orm";
import { customEntryReviews, recordCustomEntries, records, recordVersions } from "@cnpaf/db/schema";
import type { z } from "zod";
import type { customEntryDecisionBodySchema } from "@cnpaf/shared";
import { db } from "./db";
import { evaluateAuthorization, getAccessContext } from "./authorization";
import { createRegistryItem } from "./registries";
import { audit } from "./audit";

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
  if (!before || !resource) throw new Error("Custom entry not found");
  const access = await getAccessContext(input.actorId);
  if (!evaluateAuthorization(access, "taxonomy.approve_mapping", {
    organizationId: resource.record.organizationId,
    siteId: resource.record.siteId,
    serviceKey: resource.record.sourceKind,
  }).allowed) throw new Error("Forbidden");
  if (before.mappingStatus !== "pending") throw new Error("Custom entry has already been reviewed");

  let mappedCanonicalOptionId = input.body.canonicalOptionId ?? null;
  let createdOptionId: string | null = null;
  if (input.action === "mapped_existing" && !mappedCanonicalOptionId) throw new Error("canonicalOptionId is required");
  if (input.action === "created_new") {
    if (!input.body.registryKey || !input.body.newOption) throw new Error("registryKey and newOption are required");
    const option = await createRegistryItem(input.body.registryKey, { ...input.body.newOption, status: "draft" }, input.actorId);
    mappedCanonicalOptionId = option.id;
    createdOptionId = option.id;
  }

  const result = await db.transaction(async (tx) => {
    const [entry] = await tx.update(recordCustomEntries).set({
      mappingStatus: input.action,
      mappedCanonicalOptionId,
      reviewedById: input.actorId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(recordCustomEntries.id, input.id)).returning();
    const [review] = await tx.insert(customEntryReviews).values({
      customEntryId: input.id,
      reviewerId: input.actorId,
      action: input.action,
      mappedCanonicalOptionId,
      createdOptionId,
      notes: input.body.notes,
    }).returning();
    return { entry, review };
  });
  await audit({ actorId: input.actorId, action: `custom_entry.${input.action}`, entityType: "record_custom_entry", entityId: input.id, beforeState: before, afterState: result.entry, reason: input.body.notes ?? null });
  return result;
}
