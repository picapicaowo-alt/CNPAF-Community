import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMarkdownForDisplay } from "../src/lib/markdown";

test("repairs model Markdown with whitespace inside strong delimiters", () => {
  assert.equal(
    normalizeMarkdownForDisplay("**关键发现： **最值得关注"),
    "**关键发现：** 最值得关注",
  );
});

test("preserves valid Markdown", () => {
  const markdown = "**Concern**\n\n- loneliness\n- attention";
  assert.equal(normalizeMarkdownForDisplay(markdown), markdown);
});
