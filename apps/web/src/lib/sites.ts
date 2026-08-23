import { and, desc, eq, ilike, or } from "drizzle-orm";
import { organizations, sites } from "@cnpaf/db/schema";
import type { SiteCreateBody } from "@cnpaf/shared";
import { db } from "./db";

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
        or(ilike(sites.name, `%${q}%`), ilike(sites.region, `%${q}%`)),
      ),
    )
    .limit(20);
}

export async function createSite(input: SiteCreateBody, userId: string) {
  const needle = normalize(input.name);
  const all = await db.select().from(sites);
  const matches = all.filter((s) => {
    if (s.canonicalStatus === "merged") return false;
    const n = normalize(s.name);
    return n.includes(needle) || needle.includes(n);
  });

  let organizationId = input.organizationId ?? null;
  if (!organizationId && input.organizationName) {
    const existingOrg = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, input.organizationName))
      .limit(1);
    organizationId =
      existingOrg[0]?.id ??
      (
        await db
          .insert(organizations)
          .values({ name: input.organizationName, collectionPurpose: "operational" })
          .returning()
      )[0].id;
  }

  if (matches[0] && normalize(matches[0].name) === needle) {
    return { site: matches[0], suggestions: matches.slice(1) };
  }

  const [site] = await db
    .insert(sites)
    .values({
      name: input.name.trim(),
      siteType: input.siteType,
      region: input.region ?? null,
      organizationId,
      canonicalStatus: "unverified",
      createdById: userId,
    })
    .returning();

  return { site, suggestions: matches };
}

export async function mergeSite(fromId: string, intoId: string) {
  await db
    .update(sites)
    .set({ canonicalStatus: "merged", mergedIntoId: intoId, updatedAt: new Date() })
    .where(eq(sites.id, fromId));
}

export function resolveSite(site: typeof sites.$inferSelect, all: (typeof sites.$inferSelect)[]) {
  if (site.canonicalStatus !== "merged" || !site.mergedIntoId) return site;
  return all.find((s) => s.id === site.mergedIntoId) ?? site;
}
