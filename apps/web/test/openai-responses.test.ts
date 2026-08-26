import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOpenAiResponsesRequest,
  parseOpenAiResponsesBody,
} from "../src/lib/ai";

test("OpenAI requests use the Responses API JSON and image input contract", () => {
  const request = buildOpenAiResponsesRequest(
    "Return JSON.",
    "Analyze the approved evidence.",
    "gpt-5.4-mini",
    [{ id: "image-1", mimeType: "image/png", body: Buffer.from("image") }],
  );

  assert.equal(request.model, "gpt-5.4-mini");
  assert.equal(request.instructions, "Return JSON.");
  assert.deepEqual(request.text, { format: { type: "json_object" } });
  assert.equal(request.store, false);
  assert.deepEqual(request.input[0]?.content[0], {
    type: "input_text",
    text: "Return a JSON object matching the required schema.\nAnalyze the approved evidence.",
  });
  const imageContent = request.input[0]?.content[1];
  assert.ok(imageContent && "image_url" in imageContent);
  assert.match(imageContent.image_url, /^data:image\/png;base64,/);
});

test("OpenAI Responses output and token usage are normalized for workflow runs", () => {
  const result = parseOpenAiResponsesBody({
    output: [{ content: [{ type: "output_text", text: '{"answer":"ok"}' }] }],
    usage: { input_tokens: 12, output_tokens: 4 },
  });

  assert.deepEqual(result.parsed, { answer: "ok" });
  assert.deepEqual(result.tokens, { in: 12, out: 4 });
});

test("OpenAI requests include conversation documents as Responses API file inputs", () => {
  const request = buildOpenAiResponsesRequest(
    "Return JSON.",
    "Compare the attachment with approved evidence.",
    "gpt-5.6-terra",
    [],
    undefined,
    [{
      id: "file-1",
      filename: "findings.pdf",
      mimeType: "application/pdf",
      body: Buffer.from("pdf"),
    }],
  );

  const fileContent = request.input[0]?.content[1];
  assert.deepEqual(fileContent && "filename" in fileContent
    ? { type: fileContent.type, filename: fileContent.filename }
    : null, {
    type: "input_file",
    filename: "findings.pdf",
  });
  assert.ok(fileContent && "file_data" in fileContent);
  assert.match(fileContent.file_data, /^data:application\/pdf;base64,/);
});

test("OpenAI requests pin configured workflow schemas with strict structured output", () => {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["answer"],
    properties: { answer: { type: "string" } },
  };
  const request = buildOpenAiResponsesRequest("Return JSON.", "Answer.", "gpt-5.4-mini", [], schema);

  assert.deepEqual(request.text.format, {
    type: "json_schema",
    name: "cnpaf_workflow_output",
    strict: true,
    schema,
  });
});

test("legacy contract references retain JSON object mode", () => {
  const request = buildOpenAiResponsesRequest(
    "Return JSON.",
    "Answer.",
    "gpt-5.4-mini",
    [],
    { contract: "@cnpaf/shared#aiOutputSchema" },
  );

  assert.deepEqual(request.text.format, { type: "json_object" });
});
