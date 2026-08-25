import type {
  DatasetFilterDraft,
  DatasetFilters,
  DatasetOption,
} from "./types";

export const datasetFilterArrayKeys = [
  "programIds",
  "locationIds",
  "serviceTypeKeys",
  "populationKeys",
  "sourceOrigins",
  "formVersionIds",
  "collectorIds",
  "reviewStatuses",
  "researchUseStatuses",
  "findingTypes",
  "themeOrConcernIds",
] as const;

export function emptyDatasetFilterDraft(): DatasetFilterDraft {
  return {
    dateFrom: "",
    dateTo: "",
    programIds: [],
    locationIds: [],
    serviceTypeKeys: [],
    populationKeys: [],
    sourceOrigins: [],
    formVersionIds: [],
    collectorIds: [],
    reviewStatuses: [],
    researchUseStatuses: [],
    findingTypes: [],
    themeOrConcernIds: [],
  };
}

function localDayBoundary(value: string, endOfDay: boolean) {
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return date.toISOString();
}

export function toDatasetFilters(draft: DatasetFilterDraft): DatasetFilters {
  const filters: DatasetFilters = {};
  if (draft.dateFrom) filters.dateFrom = localDayBoundary(draft.dateFrom, false);
  if (draft.dateTo) filters.dateTo = localDayBoundary(draft.dateTo, true);
  for (const key of datasetFilterArrayKeys) {
    if (draft[key].length) filters[key] = [...draft[key]];
  }
  return filters;
}

export function datasetFilterSearchParams(filters: DatasetFilters) {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  for (const key of datasetFilterArrayKeys) {
    for (const value of filters[key] ?? []) params.append(key, value);
  }
  return params;
}

export function activeDatasetFilterCount(draft: DatasetFilterDraft) {
  return (
    Number(Boolean(draft.dateFrom)) +
    Number(Boolean(draft.dateTo)) +
    datasetFilterArrayKeys.reduce((count, key) => count + draft[key].length, 0)
  );
}

export function labelForOption(
  option: DatasetOption,
  locale: "zh" | "en",
) {
  return locale === "zh" ? option.labelZh : option.labelEn;
}

export function optionsForOrganization(
  options: DatasetOption[],
  organizationId: string,
) {
  if (!organizationId) return options;
  return options.filter(
    (option) => !option.organizationId || option.organizationId === organizationId,
  );
}
