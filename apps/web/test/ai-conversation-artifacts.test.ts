import assert from "node:assert/strict";
import test from "node:test";
import {
  aiConversationArtifactFilename,
  buildAiConversationMarkdown,
} from "../src/lib/ai-conversation-markdown";

test("AI conversation snapshots preserve provenance, messages, attachments, and safe web sources", () => {
  const markdown = buildAiConversationMarkdown({
    title: "Record review conversation",
    recordId: "00000000-0000-4000-8000-000000000001",
    recordVersionId: "00000000-0000-4000-8000-000000000002",
    conversationId: "00000000-0000-4000-8000-000000000003",
    revisionNumber: 2,
    savedAt: new Date("2026-08-27T18:00:00.000Z"),
    messages: [
      {
        id: "question",
        role: "user",
        content: "What needs review?",
        createdAt: "2026-08-27T17:59:00.000Z",
        metadata: { attachments: [{ name: "notes.md" }] },
      },
      {
        id: "answer",
        role: "assistant",
        content: "The evidence needs a human decision.",
        createdAt: "2026-08-27T17:59:05.000Z",
      },
    ],
    sources: [{
      messageId: "answer",
      sourceType: "external_web",
      citationLabel: "Public source",
      excerpt: "Supporting context",
      metadata: { url: "https://example.org/source" },
    }],
  });

  assert.match(markdown, /AI-assisted working conversation/);
  assert.match(markdown, /Revision: v2/);
  assert.match(markdown, /### Reviewer[\s\S]*What needs review\?/);
  assert.match(markdown, /Attachments:[\s\S]*notes\.md/);
  assert.match(markdown, /### ChatGPT[\s\S]*human decision/);
  assert.match(markdown, /<https:\/\/example\.org\/source>/);
});

test("AI conversation download names remove unsafe path characters", () => {
  assert.equal(
    aiConversationArtifactFilename("Review: site/visit?", 3),
    "Review- site-visit--v3.md",
  );
});
