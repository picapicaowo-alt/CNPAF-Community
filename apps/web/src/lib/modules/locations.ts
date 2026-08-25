import { asc, eq, inArray, sql } from "drizzle-orm";
import { auditEvents, locationAliases, locationMergeHistory, records, sites, tasks, visits } from "@cnpaf/db/schema";
import type { z } from "zod";
import type { locationAliasBodySchema, locationCreateBodySchema, locationMergeBodySchema, locationUpdateBodySchema } from "@cnpaf/shared";
import { db } from "../db";
import { audit } from "../audit";
import { ApiError } from "../api-error";
import { authorize, evaluateAuthorization, getAccessContext } from "../authorization";
import { requireActiveRegistryItem } from "../registries";

type LocationCreate = z.infer<typeof locationCreateBodySchema>;
type LocationUpdate = z.infer<typeof locationUpdateBodySchema>;
type AliasCreate = z.infer<typeof locationAliasBodySchema>;
type LocationMerge = z.infer<typeof locationMergeBodySchema>;

export function normalizeLocationName(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ");
}

function distance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length]!;
}

function geographicDistanceKm(latitude: number, longitude: number, location: typeof sites.$inferSelect) {
  if (location.latitude == null || location.longitude == null) return null;
  const targetLatitude = Number(location.latitude);
  const targetLongitude = Number(location.longitude);
  const toRadians = (value: number) => value * Math.PI / 180;
  const deltaLatitude = toRadians(targetLatitude - latitude);
  const deltaLongitude = toRadians(targetLongitude - longitude);
  const a = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(toRadians(latitude)) * Math.cos(toRadians(targetLatitude)) * Math.sin(deltaLongitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function resource(location: typeof sites.$inferSelect) {
  return { organizationId: location.organizationId, siteId: location.id, locationId: location.id };
}

async function requireLocation(actorId: string, locationId: string, permission: string) {
  const location = (await db.select().from(sites).where(eq(sites.id, locationId)).limit(1))[0];
  if (!location || location.canonicalStatus === "merged") throw new ApiError("NOT_FOUND", "Canonical location not found", 404);
  if (!(await authorize({ userId: actorId, permission, resource: resource(location) })).allowed) throw new ApiError("FORBIDDEN", "Location is outside the assigned scope", 403);
  return location;
}

export async function getLocation(actorId: string, locationId: string) {
  const location = await requireLocation(actorId, locationId, "locations.view");
  const aliases = await db
    .select()
    .from(locationAliases)
    .where(eq(locationAliases.siteId, location.id))
    .orderBy(asc(locationAliases.displayAlias));
  return { location, aliases };
}

export async function searchLocations(actorId: string, query?: string | null, coordinates?: { latitude: number; longitude: number } | null) {
  const [access, locations, aliases] = await Promise.all([
    getAccessContext(actorId),
    db.select().from(sites).where(inArray(sites.canonicalStatus, ["unverified", "canonical"])).orderBy(asc(sites.name)).limit(2000),
    db.select().from(locationAliases).where(eq(locationAliases.status, "active")).limit(5000),
  ]);
  const aliasesBySite = new Map<string, typeof aliases>();
  for (const alias of aliases) aliasesBySite.set(alias.siteId, [...(aliasesBySite.get(alias.siteId) ?? []), alias]);
  const normalizedQuery = query ? normalizeLocationName(query) : null;
  return locations
    .filter((location) => evaluateAuthorization(access, "locations.view", resource(location)).allowed)
    .map((location) => {
      const locationAliases = aliasesBySite.get(location.id) ?? [];
      const names = [
        location.name,
        location.address,
        location.city,
        location.state,
        location.country,
        location.region,
        ...locationAliases.map((alias) => alias.displayAlias),
      ]
        .filter((value): value is string => Boolean(value))
        .map(normalizeLocationName);
      const score = !normalizedQuery ? 0 : Math.min(...names.map((name) => name.includes(normalizedQuery) ? 0 : distance(name, normalizedQuery) / Math.max(name.length, normalizedQuery.length, 1)));
      const distanceKm = coordinates ? geographicDistanceKm(coordinates.latitude, coordinates.longitude, location) : null;
      return { ...location, aliases: locationAliases, matchScore: score, distanceKm };
    })
    .filter((location) => !normalizedQuery || location.matchScore <= 0.55)
    .sort((left, right) => left.matchScore - right.matchScore || (left.distanceKm ?? Number.POSITIVE_INFINITY) - (right.distanceKm ?? Number.POSITIVE_INFINITY) || left.name.localeCompare(right.name))
    .slice(0, 100);
}

export async function createLocation(actorId: string, input: LocationCreate, requestId?: string) {
  if (!(await authorize({ userId: actorId, permission: "locations.manage", resource: { organizationId: input.organizationId } })).allowed) throw new ApiError("FORBIDDEN", "Cannot create a location in this organization", 403);
  await requireActiveRegistryItem("site_type", input.siteType, input.organizationId);
  return db.transaction(async (tx) => {
    const [location] = await tx.insert(sites).values({
      organizationId: input.organizationId,
      name: input.name,
      siteType: input.siteType,
      region: input.region,
      address: input.address,
      city: input.city,
      state: input.state,
      country: input.country,
      latitude: input.latitude == null ? null : String(input.latitude),
      longitude: input.longitude == null ? null : String(input.longitude),
      canonicalStatus: "canonical",
      createdById: actorId,
    }).returning();
    const aliases = input.aliases.length ? await tx.insert(locationAliases).values(input.aliases.map((alias) => ({
      siteId: location.id,
      organizationId: location.organizationId,
      normalizedAlias: normalizeLocationName(alias.displayAlias),
      displayAlias: alias.displayAlias,
      language: alias.language,
      createdById: actorId,
    }))).returning() : [];
    await audit({ actorId, action: "location.created", entityType: "location", entityId: location.id, afterState: { location, aliases }, metadata: { requestId } }, (values) => tx.insert(auditEvents).values(values));
    return { location, aliases };
  });
}

export async function updateLocation(
  actorId: string,
  locationId: string,
  input: LocationUpdate,
  requestId?: string,
) {
  const before = await requireLocation(actorId, locationId, "locations.manage");
  if (input.siteType && input.siteType !== before.siteType) {
    await requireActiveRegistryItem(
      "site_type",
      input.siteType,
      before.organizationId,
    );
  }
  const nextStatus = input.canonicalStatus ?? before.canonicalStatus;
  const allowedTransitions: Record<string, readonly string[]> = {
    unverified: ["unverified", "canonical", "archived"],
    canonical: ["canonical", "archived"],
    archived: ["archived", "canonical"],
  };
  if (!allowedTransitions[before.canonicalStatus]?.includes(nextStatus)) {
    throw new ApiError(
      "INVALID_TRANSITION",
      `Cannot transition location from ${before.canonicalStatus} to ${nextStatus}`,
      409,
    );
  }
  const values = {
    ...input,
    latitude:
      input.latitude === undefined
        ? undefined
        : input.latitude === null
          ? null
          : String(input.latitude),
    longitude:
      input.longitude === undefined
        ? undefined
        : input.longitude === null
          ? null
          : String(input.longitude),
    updatedAt: new Date(),
  };
  return db.transaction(async (tx) => {
    const [after] = await tx
      .update(sites)
      .set(values)
      .where(eq(sites.id, locationId))
      .returning();
    if (!after) throw new ApiError("NOT_FOUND", "Location not found", 404);
    await audit(
      {
        actorId,
        action: "location.updated",
        entityType: "location",
        entityId: locationId,
        beforeState: before,
        afterState: after,
        metadata: { requestId },
      },
      (auditValues) => tx.insert(auditEvents).values(auditValues),
    );
    return after;
  });
}

export async function addLocationAlias(actorId: string, locationId: string, input: AliasCreate, requestId?: string) {
  const location = await requireLocation(actorId, locationId, "locations.manage");
  return db.transaction(async (tx) => {
    const [alias] = await tx.insert(locationAliases).values({
      siteId: locationId,
      organizationId: location.organizationId,
      normalizedAlias: normalizeLocationName(input.displayAlias),
      displayAlias: input.displayAlias,
      language: input.language,
      createdById: actorId,
    }).returning();
    await audit({ actorId, action: "location.alias_added", entityType: "location_alias", entityId: alias.id, afterState: alias, metadata: { requestId, locationId } }, (values) => tx.insert(auditEvents).values(values));
    return alias;
  });
}

export async function mergeLocation(actorId: string, sourceLocationId: string, input: LocationMerge, requestId?: string) {
  if (sourceLocationId === input.destinationLocationId) throw new ApiError("BAD_REQUEST", "A location cannot be merged into itself", 400);
  const [source, destination] = await Promise.all([
    requireLocation(actorId, sourceLocationId, "locations.manage"),
    requireLocation(actorId, input.destinationLocationId, "locations.manage"),
  ]);
  if (source.organizationId !== destination.organizationId) throw new ApiError("BAD_REQUEST", "Locations in different organizations cannot be merged", 400);
  return db.transaction(async (tx) => {
    const lockIds = [source.id, destination.id].sort();
    await tx.execute(sql`select id from sites where id in (${sql.join(lockIds.map((id) => sql`${id}`), sql`, `)}) order by id for update`);
    const movedRecords = await tx.update(records).set({ siteId: destination.id, updatedAt: new Date() }).where(eq(records.siteId, source.id)).returning({ id: records.id });
    await tx.update(visits).set({ siteId: destination.id, updatedAt: new Date() }).where(eq(visits.siteId, source.id));
    await tx.update(tasks).set({ siteId: destination.id, updatedAt: new Date() }).where(eq(tasks.siteId, source.id));
    await tx.update(locationAliases).set({ siteId: destination.id, organizationId: destination.organizationId, updatedAt: new Date() }).where(eq(locationAliases.siteId, source.id));
    await tx.update(sites).set({ canonicalStatus: "merged", mergedIntoId: destination.id, updatedAt: new Date() }).where(eq(sites.id, source.id));
    const [history] = await tx.insert(locationMergeHistory).values({ sourceSiteId: source.id, destinationSiteId: destination.id, mergedById: actorId, reason: input.reason, movedRecordCount: movedRecords.length }).returning();
    await audit({ actorId, action: "location.merged", entityType: "location", entityId: source.id, beforeState: source, afterState: { mergedIntoId: destination.id, movedRecordCount: movedRecords.length }, reason: input.reason, metadata: { requestId, mergeHistoryId: history.id } }, (values) => tx.insert(auditEvents).values(values));
    return history;
  });
}
