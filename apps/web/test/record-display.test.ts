import assert from "node:assert/strict";
import test from "node:test";
import { recordDisplayName, recordReference } from "../src/features/records/display";

test("records use a stable structured reference instead of a bare UUID fragment", () => {
  const record = {
    id: "01080f63-f4a7-498a-81bf-d771773cf151",
    sourceKind: "field_visit",
    occurredAt: "2026-08-25T17:00:00.000Z",
  };
  assert.equal(recordReference(record), "FV-20260825-01080F63");
  assert.equal(
    recordDisplayName(record, "en", { locationName: "Harmony Adult Day Health Care", formName: "Community Access Visit" }),
    "Harmony Adult Day Health Care · Community Access Visit · Aug 25, 2026",
  );
});
