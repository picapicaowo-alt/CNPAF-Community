import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AskMarkdownMessage } from "../src/components/AskMarkdownMessage";
import { AiSourceList } from "../src/components/AiSourceList";

test("AI source lists distinguish internal evidence and link external references", () => {
  const html = renderToStaticMarkup(createElement(AiSourceList, {
    locale: "zh",
    sources: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        sourceType: "approved_record",
        citationLabel: "FV-20260807-160D9654",
        excerpt: "Approved internal evidence",
        metadata: {
          recordId: "160d9654-0000-4000-8000-000000000001",
          recordReference: "STALE-LEGACY-LABEL",
          sourceKind: "field_visit",
          occurredAt: "2026-08-07T12:00:00.000Z",
          snapshotMode: "live",
        },
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
  assert.match(html, /实时内部证据/);
  assert.match(html, /现场访视/);
  assert.match(html, /记录编号 FV-20260807-160D9654/);
  assert.match(html, /href="\/records\/160d9654-0000-4000-8000-000000000001"/);
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

test("every Ask surface can render a friendly linked record citation", () => {
  const source = {
    id: "source-row",
    sourceId: "00000000-0000-4000-8000-000000000001",
    sourceType: "approved_record",
    citationLabel: "REC-160D9654",
    metadata: {
      recordId: "160d9654-0000-4000-8000-000000000001",
      recordReference: "FV-20260807-160D9654",
      sourceKind: "field_visit",
      occurredAt: "2026-08-07T12:00:00.000Z",
      snapshotMode: "live",
    },
  };
  const html = renderToStaticMarkup(createElement(AskMarkdownMessage, {
    content: `Evidence [${source.sourceId}]`,
    locale: "zh",
    sources: [source],
  }));

  assert.match(html, /现场访视/);
  assert.match(html, /FV-20260807-160D9654/);
  assert.match(html, /href="\/records\/160d9654-0000-4000-8000-000000000001"/);
  assert.doesNotMatch(html, new RegExp(source.sourceId));
});

test("arbitrary compound record citations become separate friendly record links", () => {
  const sources = [
    {
      id: "source-pi",
      sourceId: "00000000-0000-4000-8000-000000000011",
      sourceType: "approved_record",
      citationLabel: "PI-20260808-9CE8E551",
      metadata: {
        recordId: "9ce8e551-0000-4000-8000-000000000011",
        recordReference: "PI-20260808-9CE8E551",
        sourceKind: "professor_interview",
        occurredAt: "2026-08-08T12:00:00.000Z",
        snapshotMode: "live",
      },
    },
    {
      id: "source-fv-1",
      sourceId: "00000000-0000-4000-8000-000000000012",
      sourceType: "approved_record",
      citationLabel: "FV-20260813-FDE14E58",
      metadata: {
        recordId: "fde14e58-0000-4000-8000-000000000012",
        recordReference: "FV-20260813-FDE14E58",
        sourceKind: "field_visit",
        occurredAt: "2026-08-13T12:00:00.000Z",
        snapshotMode: "live",
      },
    },
    {
      id: "source-fv-2",
      sourceId: "00000000-0000-4000-8000-000000000013",
      sourceType: "approved_record",
      citationLabel: "FV-20260817-C83D4DD7",
      metadata: {
        recordId: "c83d4dd7-0000-4000-8000-000000000013",
        recordReference: "FV-20260817-C83D4DD7",
        sourceKind: "field_visit",
        occurredAt: "2026-08-17T12:00:00.000Z",
        snapshotMode: "live",
      },
    },
  ];
  const html = renderToStaticMarkup(createElement(AskMarkdownMessage, {
    content: "证据 [PI-20260808-9CE8E551；FV-20260813-FDE14E58；FV-20260817-C83D4DD7]",
    locale: "zh",
    sources,
  }));

  assert.match(html, />专家访谈 · 2026年8月8日 · PI-20260808-9CE8E551<\/a>/);
  assert.match(html, />现场访视 · 2026年8月13日 · FV-20260813-FDE14E58<\/a>/);
  assert.match(html, />现场访视 · 2026年8月17日 · FV-20260817-C83D4DD7<\/a>/);
  assert.doesNotMatch(html, /\[PI-20260808/);
});
