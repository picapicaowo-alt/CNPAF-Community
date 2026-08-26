import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAskAiOutput } from "../src/lib/ask-citations";

const source = {
  id: "00000000-0000-4000-8000-000000000001",
  label: "AF-00000000",
};

test("Ask Collect resolves an exact authorized evidence label to its UUID", () => {
  const output = normalizeAskAiOutput({
    answer: "Grounded answer",
    citations: [{ sourceId: "[AF-00000000]", claim: "Grounded claim" }],
  }, [source]);
  assert.equal(output.citations[0]?.sourceId, source.id);
});

test("Ask Collect rejects citation aliases outside the authorized retrieval set", () => {
  assert.throws(() => normalizeAskAiOutput({
    answer: "Ungrounded answer",
    citations: [{ sourceId: "AF-NOT-A-SOURCE", claim: "Unsupported claim" }],
  }, [source]));
});
