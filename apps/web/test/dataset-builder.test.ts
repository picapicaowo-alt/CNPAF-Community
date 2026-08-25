import assert from "node:assert/strict";
import test from "node:test";
import {
  activeDatasetFilterCount,
  datasetFilterSearchParams,
  emptyDatasetFilterDraft,
  optionsForOrganization,
  toDatasetFilters,
} from "../src/features/datasets/model";
import { recordFilterStateFromParams } from "../src/features/records/model";

test("dataset builder emits only active canonical filters", () => {
  const draft = {
    ...emptyDatasetFilterDraft(),
    dateFrom: "2026-08-01",
    dateTo: "2026-08-24",
    programIds: ["00000000-0000-0000-0000-000000000001"],
    reviewStatuses: ["approved"],
  };
  const filters = toDatasetFilters(draft);
  assert.equal(
    filters.dateFrom,
    new Date("2026-08-01T00:00:00.000").toISOString(),
  );
  assert.equal(
    filters.dateTo,
    new Date("2026-08-24T23:59:59.999").toISOString(),
  );
  assert.deepEqual(filters.programIds, draft.programIds);
  assert.deepEqual(filters.reviewStatuses, ["approved"]);
  assert.equal("collectorIds" in filters, false);
  assert.equal(activeDatasetFilterCount(draft), 4);
});

test("dataset filter query preserves repeated canonical values", () => {
  const params = datasetFilterSearchParams({
    programIds: ["program-a", "program-b"],
    findingTypes: ["theme", "concern"],
  });
  assert.deepEqual(params.getAll("programIds"), ["program-a", "program-b"]);
  assert.deepEqual(params.getAll("findingTypes"), ["theme", "concern"]);
});

test("organization-scoped filter options retain global choices", () => {
  const options = [
    { value: "global", labelEn: "Global", labelZh: "全局" },
    {
      value: "usc",
      labelEn: "USC",
      labelZh: "USC",
      organizationId: "organization-usc",
    },
    {
      value: "other",
      labelEn: "Other",
      labelZh: "其他",
      organizationId: "organization-other",
    },
  ];
  assert.deepEqual(
    optionsForOrganization(options, "organization-usc").map(
      (option) => option.value,
    ),
    ["global", "usc"],
  );
  assert.deepEqual(
    optionsForOrganization(options, "").map((option) => option.value),
    ["global", "usc", "other"],
  );
});

test("Records drill-down parameters become canonical evidence filters", () => {
  const canonical = recordFilterStateFromParams({
    source: "field_visit",
    stage: "submitted",
    status: "approved",
  });
  assert.deepEqual(canonical.filters.reviewStatuses, ["approved"]);
  assert.deepEqual(canonical.filters.serviceTypeKeys, ["field_visit"]);
  assert.equal(canonical.localStatus, "all");

  const nonCanonical = recordFilterStateFromParams({
    stage: "submitted",
    status: "flagged",
  });
  assert.deepEqual(nonCanonical.filters.reviewStatuses, [
    "pending",
    "approved",
    "needs_completion",
  ]);
  assert.equal(nonCanonical.localStatus, "flagged");
});
