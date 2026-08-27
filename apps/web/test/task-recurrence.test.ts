import assert from "node:assert/strict";
import test from "node:test";
import { nextTaskOccurrence } from "../src/lib/task-recurrence";

test("weekly recurrence preserves local wall-clock time across daylight saving", () => {
  const next = nextTaskOccurrence(
    new Date("2026-03-05T18:00:00.000Z"),
    "weekly",
    1,
    "America/Los_Angeles",
  );
  assert.equal(next.toISOString(), "2026-03-12T17:00:00.000Z");
});

test("monthly recurrence constrains a month-end date without skipping a month", () => {
  const next = nextTaskOccurrence(
    new Date("2026-01-31T18:00:00.000Z"),
    "monthly",
    1,
    "America/Los_Angeles",
  );
  assert.equal(next.toISOString(), "2026-02-28T18:00:00.000Z");
});
