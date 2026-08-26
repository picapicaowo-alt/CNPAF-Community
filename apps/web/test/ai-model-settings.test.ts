import assert from "node:assert/strict";
import test from "node:test";
import {
  isOpenAiModelId,
  OPENAI_MODEL_CATALOG,
} from "../src/lib/openai-model-catalog";

test("AI model selector offers unique Responses API model IDs", () => {
  const ids = OPENAI_MODEL_CATALOG.map((model) => model.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, [
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
  ]);
  assert.equal(isOpenAiModelId("gpt-5.6-terra"), true);
  assert.equal(isOpenAiModelId("5.6 Terra"), false);
});
