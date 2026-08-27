type SnapshotMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: Date | string;
  metadata?: unknown;
};

type SnapshotSource = {
  messageId: string;
  sourceType: string;
  citationLabel: string | null;
  excerpt: string | null;
  metadata: unknown;
};

type MarkdownSnapshotInput = {
  title: string;
  recordId: string;
  recordVersionId: string;
  conversationId: string;
  revisionNumber: number;
  savedAt: Date;
  messages: SnapshotMessage[];
  sources: SnapshotSource[];
};

export function cleanAiConversationInline(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function sourceUrl(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const url = (metadata as { url?: unknown }).url;
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : null;
}

function messageAttachments(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const rows = (metadata as { attachments?: unknown }).attachments;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const name = (row as { name?: unknown }).name;
    return typeof name === "string" ? [cleanAiConversationInline(name)] : [];
  });
}

export function buildAiConversationMarkdown(input: MarkdownSnapshotInput) {
  const sourcesByMessage = new Map<string, SnapshotSource[]>();
  for (const source of input.sources) {
    sourcesByMessage.set(source.messageId, [
      ...(sourcesByMessage.get(source.messageId) ?? []),
      source,
    ]);
  }

  const lines = [
    `# ${cleanAiConversationInline(input.title)}`,
    "",
    "> AI-assisted working conversation. This snapshot preserves what was visible to the saving reviewer at the time of capture; it is not itself an approval decision.",
    "",
    "## Snapshot metadata",
    "",
    `- Record: \`${input.recordId}\``,
    `- Record version: \`${input.recordVersionId}\``,
    `- Conversation: \`${input.conversationId}\``,
    `- Revision: v${input.revisionNumber}`,
    `- Saved at: ${input.savedAt.toISOString()}`,
    "",
    "## Conversation",
    "",
  ];

  for (const message of input.messages) {
    const role = message.role === "assistant" ? "ChatGPT" : "Reviewer";
    lines.push(`### ${role}`, "", message.content.trim() || "_(empty message)_", "");
    const attachments = messageAttachments(message.metadata);
    if (attachments.length) {
      lines.push("Attachments:", ...attachments.map((name) => `- ${name}`), "");
    }
    const messageSources = sourcesByMessage.get(message.id) ?? [];
    if (messageSources.length) {
      lines.push("Sources:");
      for (const source of messageSources) {
        const label = cleanAiConversationInline(source.citationLabel || source.sourceType);
        const url = sourceUrl(source.metadata);
        const excerpt = source.excerpt ? cleanAiConversationInline(source.excerpt).slice(0, 500) : "";
        lines.push(`- ${label}${url ? ` — <${url}>` : ""}${excerpt ? ` — ${excerpt}` : ""}`);
      }
      lines.push("");
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

export function aiConversationArtifactFilename(title: string, revisionNumber: number) {
  const safe = cleanAiConversationInline(title).replace(/[\\/:*?"<>|]/g, "-").slice(0, 100) || "AI conversation";
  return `${safe}-v${revisionNumber}.md`;
}
