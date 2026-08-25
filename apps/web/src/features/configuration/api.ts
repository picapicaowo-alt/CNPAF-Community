import { apiFetch } from "@/lib/api-client";
import type {
  ConfigurationRegistryKey,
  RegistryBundle,
  RegistryItem,
  RegistryItemDraft,
} from "./types";

export function getConfigurationRegistry(key: ConfigurationRegistryKey) {
  return apiFetch<RegistryBundle>(`/api/v1/config/registries/${key}`);
}

export function createConfigurationItem(
  registryKey: ConfigurationRegistryKey,
  draft: RegistryItemDraft,
  organizationId: string | null,
) {
  return apiFetch<{ item: RegistryItem }>(
    `/api/v1/config/registries/${registryKey}/items`,
    {
      method: "POST",
      body: JSON.stringify({
        ...draft,
        helpTextEn: draft.helpTextEn.trim() || null,
        helpTextZh: draft.helpTextZh.trim() || null,
        status: "active",
        metadata: {},
        canonicalItemId: null,
        organizationId,
      }),
    },
  );
}

export function updateConfigurationItem(
  registryKey: ConfigurationRegistryKey,
  itemId: string,
  draft: RegistryItemDraft,
) {
  return apiFetch<{ item: RegistryItem }>(
    `/api/v1/config/registries/${registryKey}/items/${itemId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        labelEn: draft.labelEn,
        labelZh: draft.labelZh,
        helpTextEn: draft.helpTextEn.trim() || null,
        helpTextZh: draft.helpTextZh.trim() || null,
        sortOrder: draft.sortOrder,
        status: "active",
        publishNewVersion: true,
      }),
    },
  );
}

export function archiveConfigurationItem(
  registryKey: ConfigurationRegistryKey,
  itemId: string,
) {
  return apiFetch<{ item: RegistryItem }>(
    `/api/v1/config/registries/${registryKey}/items/${itemId}/archive`,
    { method: "POST" },
  );
}
