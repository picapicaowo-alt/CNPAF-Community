import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AiSourceList } from "../src/components/AiSourceList";

test("AI source lists distinguish internal evidence and link external references", () => {
  const html = renderToStaticMarkup(createElement(AiSourceList, {
    locale: "zh",
    sources: [
      {
        id: "internal-1",
        sourceType: "approved_record",
        citationLabel: "REC-1234",
        excerpt: "Approved internal evidence",
      },
      {
        id: "external-1",
        sourceType: "external_web",
        excerpt: "Public research",
        metadata: { title: "Public research", url: "https://example.org/research" },
      },
    ],
  }));

  assert.match(html, /1 个内部证据 · 1 个外部参考/);
  assert.match(html, /href="https:\/\/example\.org\/research"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /外部来源/);
  assert.match(html, /内部证据/);
});

test("AI source lists never create links for unsafe external URLs", () => {
  const html = renderToStaticMarkup(createElement(AiSourceList, {
    locale: "en",
    sources: [{
      id: "unsafe-1",
      sourceType: "external_web",
      excerpt: "Unsafe source",
      metadata: { title: "Unsafe", url: "javascript:alert(1)" },
    }],
  }));

  assert.doesNotMatch(html, /href=/);
  assert.doesNotMatch(html, /Unsafe/);
});
