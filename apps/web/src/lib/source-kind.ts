import { and, desc, eq } from "drizzle-orm";
import { configRegistries, configRegistryItems } from "@cnpaf/db/schema";
import { sourceKindPolicySchema } from "@cnpaf/shared";
import { db } from "./db";
import { ApiError } from "./api-error";

export async function loadSourceKindPolicy(sourceKind: string) {
  const item = (await db
    .select({ metadata: configRegistryItems.metadata })
    .from(configRegistryItems)
    .innerJoin(configRegistries, eq(configRegistryItems.registryId, configRegistries.id))
    .where(and(
      eq(configRegistries.key, "source_kind"),
      eq(configRegistries.status, "active"),
      eq(configRegistryItems.key, sourceKind),
      eq(configRegistryItems.status, "active"),
    ))
    .orderBy(desc(configRegistryItems.version))
    .limit(1))[0];
  if (!item) throw new ApiError("BAD_REQUEST", "Unknown or inactive sourceKind", 400);
  const metadata = item.metadata as { policy?: unknown } | null;
  const parsed = sourceKindPolicySchema.safeParse(metadata?.policy);
  if (!parsed.success) throw new ApiError("CONFLICT", "Source kind is missing a valid published policy", 409);
  return parsed.data;
}
