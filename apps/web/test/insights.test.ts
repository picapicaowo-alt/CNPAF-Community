import assert from "node:assert/strict";
import test from "node:test";
import { SOURCE_KINDS } from "@cnpaf/shared";
import { sourceKindLabel } from "../src/lib/display-labels";

test("insight source filters have customer-facing labels for every canonical key", () => {
  assert.deepEqual(
    SOURCE_KINDS.map((source) => sourceKindLabel(source, "en")),
    ["Field visit", "Expert interview", "Literature", "Other source"],
  );
});
