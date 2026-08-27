import { and, desc, eq, ilike, or } from "drizzle-orm";
import { auditEvents, sites } from "@cnpaf/db/schema";
import type { SiteCreateBody } from "@cnpaf/shared";
import { db } from "./db";
import { audit } from "./audit";
import { requireActiveRegistryItem } from "./registries";

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

export async function searchSites(query: string) {
  const q = query.trim();
  if (!q) {
    return db.select().from(sites).limit(50);
  }
  return db
    .select()
    .from(sites)
    .where(
      and(
        or(
          ilike(sites.name, `%${q}%`),
          ilike(sites.nameEn, `%${q}%`),
          ilike(sites.nameZh, `%${q}%`),
          ilike(sites.region, `%${q}%`),
        ),
      ),
    )
    .limit(20);
}

export async function createSite(input: SiteCreateBody, userId: string, organizationId: string) {
  await requireActiveRegistryItem("site_type", input.siteType, organizationId);
  const needle = normalize(input.name);
  const all = await db.select().from(sites).where(eq(sites.organizationId, organizationId));
  const matches = all.filter((s) => {
    if (s.canonicalStatus === "merged") return false;
    const n = normalize(s.name);
    return n.includes(needle) || needle.includes(n);
  });

  if (matches[0] && normalize(matches[0].name) === needle) {
    return { site: matches[0], suggestions: matches.slice(1) };
  }

  const site = await db.transaction(async (tx) => {
    const [created] = await tx.insert(sites).values({
      name: input.name.trim(),
      nameEn: input.locale === "en" ? input.name.trim() : null,
      nameZh: input.locale === "zh" ? input.name.trim() : null,
      siteType: input.siteType,
      region: input.region ?? null,
      organizationId,
      canonicalStatus: "unverified",
      createdById: userId,
    }).returning();
    await audit({ actorId: userId, action: "location.created_unverified", entityType: "location", entityId: created.id, afterState: created }, (values) => tx.insert(auditEvents).values(values));
    return created;
  });

  return { site, suggestions: matches };
}

export function resolveSite(site: typeof sites.$inferSelect, all: (typeof sites.$inferSelect)[]) {
  if (site.canonicalStatus !== "merged" || !site.mergedIntoId) return site;
  return all.find((s) => s.id === site.mergedIntoId) ?? site;
}
