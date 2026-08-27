import { apiFetch } from "@/lib/api-client";
import type {
  Location,
  LocationDraft,
  LocationType,
  LocationTypeDraft,
} from "./types";

export function listLocations(query = "") {
  const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  return apiFetch<{ locations: Location[] }>(`/api/v1/locations${suffix}`);
}

export function listLocationTypes() {
  return apiFetch<{ items: LocationType[] }>(
    "/api/v1/config/registries/site_type",
  );
}

export function createLocationType(
  organizationId: string | null,
  draft: LocationTypeDraft,
) {
  return apiFetch<{ item: LocationType }>(
    "/api/v1/config/registries/site_type/items",
    {
      method: "POST",
      body: JSON.stringify({
        key: draft.key,
        labelEn: draft.labelEn.trim(),
        labelZh: draft.labelZh.trim(),
        helpTextEn: draft.helpTextEn.trim() || null,
        helpTextZh: draft.helpTextZh.trim() || null,
        sortOrder: draft.sortOrder,
        status: "active",
        metadata: {},
        canonicalItemId: null,
        organizationId,
      }),
    },
  );
}

export function updateLocationType(
  itemId: string,
  draft: LocationTypeDraft,
) {
  return apiFetch<{ item: LocationType }>(
    `/api/v1/config/registries/site_type/items/${itemId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        labelEn: draft.labelEn.trim(),
        labelZh: draft.labelZh.trim(),
        helpTextEn: draft.helpTextEn.trim() || null,
        helpTextZh: draft.helpTextZh.trim() || null,
        sortOrder: draft.sortOrder,
        status: "active",
        publishNewVersion: true,
      }),
    },
  );
}

export function archiveLocationType(itemId: string) {
  return apiFetch<{ item: LocationType }>(
    `/api/v1/config/registries/site_type/items/${itemId}/archive`,
    { method: "POST" },
  );
}

export function createLocation(
  organizationId: string | null,
  draft: LocationDraft,
) {
  return apiFetch<{ location: Location }>("/api/v1/locations", {
    method: "POST",
    body: JSON.stringify({
      organizationId,
      nameEn: draft.nameEn.trim(),
      nameZh: draft.nameZh.trim(),
      siteType: draft.siteType,
      address: draft.address.trim() || null,
      city: draft.city.trim() || null,
      state: draft.state.trim() || null,
      country: draft.country.trim() || null,
      aliases: [
        draft.aliasZh.trim()
          ? { displayAlias: draft.aliasZh.trim(), language: "zh" }
          : null,
        draft.aliasEn.trim()
          ? { displayAlias: draft.aliasEn.trim(), language: "en" }
          : null,
      ].filter(Boolean),
    }),
  });
}

export function updateLocation(locationId: string, draft: LocationDraft) {
  return apiFetch<{ location: Location }>(`/api/v1/locations/${locationId}`, {
    method: "PATCH",
    body: JSON.stringify({
      nameEn: draft.nameEn.trim(),
      nameZh: draft.nameZh.trim(),
      siteType: draft.siteType,
      address: draft.address.trim() || null,
      city: draft.city.trim() || null,
      state: draft.state.trim() || null,
      country: draft.country.trim() || null,
    }),
  });
}

export function archiveLocation(locationId: string) {
  return apiFetch<{ location: Location }>(`/api/v1/locations/${locationId}`, {
    method: "PATCH",
    body: JSON.stringify({ canonicalStatus: "archived" }),
  });
}

export function approveLocation(locationId: string) {
  return apiFetch<{ location: Location }>(`/api/v1/locations/${locationId}`, {
    method: "PATCH",
    body: JSON.stringify({ canonicalStatus: "canonical" }),
  });
}

export function addLocationAlias(
  locationId: string,
  displayAlias: string,
  locale: "zh" | "en",
) {
  return apiFetch(`/api/v1/locations/${locationId}/aliases`, {
    method: "POST",
    body: JSON.stringify({ displayAlias, language: locale }),
  });
}

export function mergeLocation(
  sourceLocationId: string,
  destinationLocationId: string,
  reason: string,
) {
  return apiFetch(`/api/v1/locations/${sourceLocationId}/merge`, {
    method: "POST",
    body: JSON.stringify({ destinationLocationId, reason }),
  });
}
