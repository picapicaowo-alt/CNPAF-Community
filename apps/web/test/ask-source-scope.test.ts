import assert from "node:assert/strict";
import test from "node:test";
import { isAskSourceVersionInScope } from "../src/lib/ask-source-scope";

test("live Ask Collect excludes historical approved record versions", () => {
  assert.equal(isAskSourceVersionInScope({
    frozenRecordVersionIds: new Set(),
    recordHeadVersionId: "current-version",
    recordVersionId: "historical-version",
  }), false);
  assert.equal(isAskSourceVersionInScope({
    frozenRecordVersionIds: new Set(),
    recordHeadVersionId: "current-version",
    recordVersionId: "current-version",
  }), true);
});

test("Dataset Ask Collect preserves only its explicitly frozen versions", () => {
  const frozenRecordVersionIds = new Set(["historical-version"]);
  assert.equal(isAskSourceVersionInScope({
    datasetVersionId: "dataset-version",
    frozenRecordVersionIds,
    recordHeadVersionId: "current-version",
    recordVersionId: "historical-version",
  }), true);
  assert.equal(isAskSourceVersionInScope({
    datasetVersionId: "dataset-version",
    frozenRecordVersionIds,
    recordHeadVersionId: "current-version",
    recordVersionId: "current-version",
  }), false);
});
