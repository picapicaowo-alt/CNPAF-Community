import assert from "node:assert/strict";
import test from "node:test";
import {
  latestLocationTypes,
  locationTypeKeyFrom,
} from "../src/features/locations/model";
import type { LocationType } from "../src/features/locations/types";
import { registryManagementPermissions } from "../src/lib/http";

function locationType(
  input: Partial<LocationType> & Pick<LocationType, "id" | "key" | "version">,
): LocationType {
  return {
    labelEn: input.key,
    labelZh: input.key,
    status: "active",
    sortOrder: 0,
    ...input,
  };
}

test("location type keys are normalized into valid stable identifiers", () => {
  assert.equal(locationTypeKeyFrom("Community Center"), "community_center");
  assert.equal(locationTypeKeyFrom("24 Hour Care"), "type_24_hour_care");
  assert.equal(locationTypeKeyFrom("***"), "");
});

test("location type management keeps only the latest version per key", () => {
  const items = latestLocationTypes([
    locationType({ id: "school-v1", key: "school", version: 1 }),
    locationType({
      id: "school-v2",
      key: "school",
      version: 2,
      labelEn: "Community school",
      status: "archived",
    }),
    locationType({
      id: "clinic-v1",
      key: "clinic",
      version: 1,
      sortOrder: 2,
    }),
  ]);

  assert.deepEqual(
    items.map((item) => [item.id, item.status]),
    [
      ["school-v2", "archived"],
      ["clinic-v1", "active"],
    ],
  );
});

test("location managers can change only the location-type registry", () => {
  assert.deepEqual(registryManagementPermissions("site_type"), [
    "services.manage",
    "locations.manage",
  ]);
  assert.deepEqual(registryManagementPermissions("task_type"), [
    "services.manage",
  ]);
});
