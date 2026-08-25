import type { RegistryItem, RegistryItemDraft } from "./types";

export const EMPTY_REGISTRY_ITEM: RegistryItemDraft = {
  key: "",
  labelEn: "",
  labelZh: "",
  helpTextEn: "",
  helpTextZh: "",
  sortOrder: 0,
};

export function registryKeyFrom(value: string) {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 150);
}

export function latestRegistryItems(items: RegistryItem[]) {
  const latest = new Map<string, RegistryItem>();
  for (const item of items) {
    const current = latest.get(item.key);
    if (!current || item.version > current.version) latest.set(item.key, item);
  }
  return [...latest.values()].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder || left.key.localeCompare(right.key),
  );
}

export function draftFromRegistryItem(item: RegistryItem): RegistryItemDraft {
  return {
    key: item.key,
    labelEn: item.labelEn,
    labelZh: item.labelZh,
    helpTextEn: item.helpTextEn ?? "",
    helpTextZh: item.helpTextZh ?? "",
    sortOrder: item.sortOrder,
  };
}
