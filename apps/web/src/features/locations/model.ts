import type {
  Location,
  LocationDraft,
  LocationType,
  LocationTypeDraft,
} from "./types";

export const EMPTY_LOCATION_DRAFT: LocationDraft = {
  name: "",
  siteType: "",
  address: "",
  city: "",
  state: "",
  country: "",
  alias: "",
};

export const EMPTY_LOCATION_TYPE_DRAFT: LocationTypeDraft = {
  key: "",
  labelEn: "",
  labelZh: "",
  helpTextEn: "",
  helpTextZh: "",
  sortOrder: 0,
};

export function draftFromLocation(location: Location): LocationDraft {
  return {
    name: location.name,
    siteType: location.siteType,
    address: location.address ?? "",
    city: location.city ?? location.region ?? "",
    state: location.state ?? "",
    country: location.country ?? "",
    alias: "",
  };
}

export function formattedLocationAddress(location: Location) {
  const parts = [
    location.address,
    location.city ?? location.region,
    location.state,
    location.country,
  ].filter((value): value is string => Boolean(value?.trim()));
  return parts
    .filter((part, index) => {
      const normalized = part.trim().toLocaleLowerCase();
      return !parts.slice(0, index).some((earlier) => {
        const normalizedEarlier = earlier.trim().toLocaleLowerCase();
        return (
          normalizedEarlier === normalized ||
          normalizedEarlier.includes(normalized)
        );
      });
    })
    .join(" · ");
}

export function latestLocationTypes(items: LocationType[]) {
  const latest = new Map<string, LocationType>();
  for (const item of items) {
    const current = latest.get(item.key);
    if (!current || item.version > current.version) latest.set(item.key, item);
  }
  return [...latest.values()].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder || left.key.localeCompare(right.key),
  );
}

export function locationTypeKeyFrom(value: string) {
  const normalized = value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 150);
  return normalized && !/^[a-z]/.test(normalized)
    ? `type_${normalized}`.slice(0, 150)
    : normalized;
}

export function draftFromLocationType(type: LocationType): LocationTypeDraft {
  return {
    key: type.key,
    labelEn: type.labelEn,
    labelZh: type.labelZh,
    helpTextEn: type.helpTextEn ?? "",
    helpTextZh: type.helpTextZh ?? "",
    sortOrder: type.sortOrder,
  };
}
