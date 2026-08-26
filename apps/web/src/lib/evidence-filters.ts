import type { z } from "zod";
import type { reportFiltersSchema } from "@cnpaf/shared";

export type EvidenceFilters = z.infer<typeof reportFiltersSchema>;

type FilterableRecord = {
  id: string;
  organizationId: string | null;
  programId: string | null;
  siteId: string | null;
  sourceKind: string;
  createdById: string;
  reviewStatus: string;
  researchUseStatus: string;
};

type FilterableVersion = {
  occurredAt: Date | null;
  submittedAt: Date | null;
  createdAt: Date;
  templateVersionId: string | null;
  quantitative: unknown;
  attribution: unknown;
};

type FilterableFinding = {
  findingType: string;
  canonicalRegistryItemId: string | null;
  approvedValue: unknown;
  createdAt: Date;
};

function containsString(value: unknown, expected: ReadonlySet<string>): boolean {
  if (typeof value === "string") return expected.has(value);
  if (Array.isArray(value)) return value.some((item) => containsString(item, expected));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((item) => containsString(item, expected));
  }
  return false;
}

/**
 * Canonical filtering for report evidence, exports, Ask Collect, and datasets.
 * A supplied filter must narrow the result; unsupported/unknown filter fields
 * are rejected by the shared strict request schema instead of being ignored.
 */
export function matchesEvidenceFilters(
  filters: EvidenceFilters,
  record: FilterableRecord,
  version: FilterableVersion,
  finding?: FilterableFinding | null,
) {
  if (filters.recordIds?.length && !filters.recordIds.includes(record.id)) return false;
  if (filters.organizationIds?.length && (!record.organizationId || !filters.organizationIds.includes(record.organizationId))) return false;
  if (filters.programIds?.length && (!record.programId || !filters.programIds.includes(record.programId))) return false;
  const locationIds = new Set([...(filters.siteIds ?? []), ...(filters.locationIds ?? [])]);
  if (locationIds.size && (!record.siteId || !locationIds.has(record.siteId))) return false;
  if (filters.serviceTypeKeys?.length && !filters.serviceTypeKeys.includes(record.sourceKind)) return false;
  if (filters.collectorIds?.length && !filters.collectorIds.includes(record.createdById)) return false;
  if (filters.reviewStatuses?.length && !filters.reviewStatuses.includes(record.reviewStatus)) return false;
  if (filters.researchUseStatuses?.length && !filters.researchUseStatuses.includes(record.researchUseStatus)) return false;

  const formVersionIds = new Set([...(filters.templateVersionIds ?? []), ...(filters.formVersionIds ?? [])]);
  if (formVersionIds.size && (!version.templateVersionId || !formVersionIds.has(version.templateVersionId))) return false;
  const evidenceDate = version.occurredAt ?? version.submittedAt ?? finding?.createdAt ?? version.createdAt;
  if (filters.dateFrom && evidenceDate < new Date(filters.dateFrom)) return false;
  if (filters.dateTo && evidenceDate > new Date(filters.dateTo)) return false;

  if (filters.findingTypes?.length && (!finding || !filters.findingTypes.includes(finding.findingType))) return false;
  if (filters.themeOrConcernIds?.length && (!finding?.canonicalRegistryItemId || !filters.themeOrConcernIds.includes(finding.canonicalRegistryItemId))) return false;
  if (filters.sourceOrigins?.length) {
    const origin = (finding?.approvedValue as { origin?: unknown } | null)?.origin;
    if (typeof origin !== "string" || !filters.sourceOrigins.includes(origin)) return false;
  }
  if (filters.populationKeys?.length) {
    const expected = new Set(filters.populationKeys);
    if (!containsString({ approvedValue: finding?.approvedValue, quantitative: version.quantitative, attribution: version.attribution }, expected)) return false;
  }
  return true;
}
