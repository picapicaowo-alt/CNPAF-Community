import assert from "node:assert/strict";
import test from "node:test";
import { SOURCE_KINDS } from "@cnpaf/shared";
import {
  INSIGHT_DEMO_RECORDS,
  INSIGHT_SOURCES,
} from "../src/features/insights/demo-data";

test("insight record entry uses canonical source-kind keys", () => {
  const sourceKeys = INSIGHT_SOURCES.map((source) => source.key);
  assert.deepEqual(sourceKeys, SOURCE_KINDS);
  assert.equal(
    INSIGHT_DEMO_RECORDS.every((record) => sourceKeys.includes(record.sourceKind)),
    true,
  );
});
