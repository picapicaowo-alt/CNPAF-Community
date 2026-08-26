import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAskAiOutput } from "../src/lib/ask-citations";

const source = {
  id: "00000000-0000-4000-8000-000000000001",
  label: "AF-00000000",
};

test("Ask Collect resolves an exact authorized evidence label to its UUID", () => {
  const output = normalizeAskAiOutput({
    answer: `Grounded answer [${source.id}]`,
    citations: [{ sourceId: "[AF-00000000]", claim: "Grounded claim" }],
  }, [source]);
  assert.equal(output.citations[0]?.sourceId, source.id);
  assert.equal(output.answer, "Grounded answer [AF-00000000]");
});

test("Ask Collect rejects citation aliases outside the authorized retrieval set", () => {
  assert.throws(() => normalizeAskAiOutput({
    answer: "Ungrounded answer",
    citations: [{ sourceId: "AF-NOT-A-SOURCE", claim: "Unsupported claim" }],
  }, [source]));
});

test("Ask Collect can render a localized record citation without exposing its UUID", () => {
  const output = normalizeAskAiOutput({
    answer: `Grounded answer [${source.id}]`,
    citations: [{ sourceId: source.id, claim: "Grounded claim" }],
  }, [{
    ...source,
    displayLabel: "现场访视 · 2026年8月7日 · FV-20260807-160D9654",
    href: "/records/160d9654-0000-4000-8000-000000000001",
  }]);
  assert.equal(
    output.answer,
    "Grounded answer [现场访视 · 2026年8月7日 · FV-20260807-160D9654](/records/160d9654-0000-4000-8000-000000000001)",
  );
  assert.doesNotMatch(output.answer, new RegExp(source.id));
});
