import { ConfigurationScreen } from "@/features/configuration/components/ConfigurationScreen";
import {
  CONFIGURATION_REGISTRIES,
  type ConfigurationRegistryKey,
} from "@/features/configuration/types";

export default async function ConfigurationPage({
  searchParams,
}: {
  searchParams: Promise<{ registry?: string | string[] }>;
}) {
  const requestedRegistry = (await searchParams).registry;
  const registryKey = Array.isArray(requestedRegistry)
    ? requestedRegistry[0]
    : requestedRegistry;
  const initialRegistryKey = CONFIGURATION_REGISTRIES.some(
    (registry) => registry.key === registryKey,
  )
    ? (registryKey as ConfigurationRegistryKey)
    : undefined;

  return (
    <ConfigurationScreen
      initialRegistryKey={initialRegistryKey}
      key={initialRegistryKey ?? "site_type"}
    />
  );
}
