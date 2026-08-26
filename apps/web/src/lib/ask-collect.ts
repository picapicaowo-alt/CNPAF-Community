import { asc, eq, inArray } from "drizzle-orm";
import {
  approvedFindings,
  attachments,
  askConversations,
  askMessages,
  askMessageSources,
  datasetRecords,
  records,
  recordVersions,
} from "@cnpaf/db/schema";
import type { z } from "zod";
import { type askConversationBodySchema } from "@cnpaf/shared";
import { db } from "./db";
import { evaluateAuthorization, getAccessContext } from "./authorization";
import { executeConfiguredWorkflow } from "./ai";
import { scanPrivacy } from "./pii";
import { matchesEvidenceFilters } from "./evidence-filters";
import { normalizeAskAiOutput } from "./ask-citations";
import {
  markDatasetImagesSentToAi,
  prepareDatasetAiMedia,
} from "./dataset-ai-media";

type ConversationInput = z.infer<typeof askConversationBodySchema>;
type AskScope = ConversationInput["scope"] & {
  datasetVersionId?: string;
  includeMedia?: boolean;
  contextSources?: ConversationInput["contextSources"];
};

function searchableStatement(value: unknown) {
  return (value as { statement?: string } | null)?.statement?.trim() ?? "";
}

function relevanceScore(question: string, statement: string) {
  const normalizedQuestion = question.toLocaleLowerCase();
  const normalizedStatement = statement.toLocaleLowerCase();
  const terms = [...new Set(normalizedQuestion.match(/[\p{L}\p{N}]{2,}/gu) ?? [])];
  if (!terms.length) return 1;
  return terms.reduce((score, term) => score + (normalizedStatement.includes(term) ? 1 : 0), 0);
}

export async function createAskConversation(actorId: string, input: ConversationInput) {
  const scope: AskScope = {
    ...input.scope,
    ...(input.datasetVersionId ? { datasetVersionId: input.datasetVersionId, includeMedia: input.includeMedia } : {}),
    ...(input.contextSources.length ? { contextSources: input.contextSources } : {}),
  };
  const [conversation] = await db.insert(askConversations).values({ userId: actorId, title: input.title, scope }).returning();
  return conversation;
}

export async function addAskMessage(conversationId: string, actorId: string, content: string) {
  const conversation = (await db.select().from(askConversations).where(eq(askConversations.id, conversationId)).limit(1))[0];
  if (!conversation || conversation.userId !== actorId || conversation.status !== "active") throw new Error("Conversation not found");
  const questionPrivacy = scanPrivacy({
    sourceKind: "ask_collect",
    qualitative: content,
    attribution: {},
    policy: { allowedIdentifierFields: [], privacyDisposition: "flag" },
  });
  if (questionPrivacy.status === "flagged") throw new Error("Question contains possible personal information and cannot be sent to the configured AI provider");
  const [question] = await db.insert(askMessages).values({ conversationId, role: "user", content }).returning();
  const candidates = await db
    .select({ approved: approvedFindings, version: recordVersions, record: records })
    .from(approvedFindings)
    .innerJoin(recordVersions, eq(approvedFindings.recordVersionId, recordVersions.id))
    .innerJoin(records, eq(recordVersions.recordId, records.id))
    .where(eq(approvedFindings.status, "approved"));
  const access = await getAccessContext(actorId);
  const requestedScope = (conversation.scope ?? {}) as AskScope;
  const { datasetVersionId, includeMedia: _includeMedia, contextSources, ...evidenceScope } = requestedScope;
  const frozenRecordVersions = datasetVersionId
    ? await db
        .select({ recordVersionId: datasetRecords.recordVersionId })
        .from(datasetRecords)
        .where(eq(datasetRecords.datasetVersionId, datasetVersionId))
    : [];
  const frozenRecordVersionIds = new Set(
    frozenRecordVersions.map((item) => item.recordVersionId),
  );
  const authorized = candidates
    .filter(({ approved, version, record }) =>
      (!datasetVersionId || frozenRecordVersionIds.has(version.id)) &&
      matchesEvidenceFilters(evidenceScope, record, version, approved) &&
      ["clear", "redacted"].includes(record.privacyStatus) &&
      record.researchUseStatus !== "restricted" &&
      evaluateAuthorization(access, "records.view_approved", {
        organizationId: record.organizationId,
        programId: record.programId,
        siteId: record.siteId,
        serviceKey: record.sourceKind,
        researchUse: record.researchUseStatus,
        dataClassification: "approved_evidence",
      }).allowed,
    )
    .map((row) => ({ ...row, score: relevanceScore(content, searchableStatement(row.approved.approvedValue)) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 25);
  const evidenceSources = authorized.map(({ approved }) => ({
    id: approved.id,
    label: `AF-${approved.id.slice(0, 8)}`,
    statement: searchableStatement(approved.approvedValue) || "Approved evidence",
    sourceType: "approved_finding" as const,
  }));
  const media = requestedScope.includeMedia && datasetVersionId
    ? await prepareDatasetAiMedia(actorId, datasetVersionId)
    : null;
  const imageInputs = media?.imageInputs ?? [];
  const mediaSources = media?.mediaSources ?? [];
  const conversationContextSources = (contextSources ?? []).map((source) => ({
    id: conversation.id,
    label: source.label,
    statement: source.statement,
    sourceType: "conversation_context" as const,
  }));
  const sources = [...evidenceSources, ...mediaSources, ...conversationContextSources];
  const localOutput = {
    answer: sources.length
      ? `Found ${sources.length} authorized source(s) relevant to the current conversation scope. ` + sources.map((source) => `[${source.label}] ${source.statement}`).join(" ")
      : "No authorized approved evidence was found in the current conversation scope.",
    citations: sources.map((source) => ({ sourceId: source.id, claim: source.statement })),
  };
  const generation = await executeConfiguredWorkflow({
    workflowKey: "ask_collect",
    idempotencyKey: `ask:${conversationId}:${question.id}`,
    createdByUserId: actorId,
    inputSnapshot: {
      conversationId,
      question: content,
      requestedScope,
      datasetVersionId: datasetVersionId ?? null,
      mediaContext: {
        requested: Boolean(requestedScope.includeMedia),
        includedByDatasetPolicy: media?.mediaIncluded ?? false,
        imageSourceIds: mediaSources.map((source) => source.id),
        nonImageAttachmentCount: (media?.totalAttachmentCount ?? 0) - mediaSources.length,
      },
      approvedSources: sources.map((source) => ({ id: source.id, label: source.label, statement: source.statement })),
    },
    localOutput,
    imageInputs,
  });
  const generated = normalizeAskAiOutput(generation.output, sources);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  if (generated.citations.some((citation) => !sourceById.has(citation.sourceId))) throw new Error("Ask Collect AI output cited evidence outside the authorized retrieval set");
  if (sources.length && !generated.citations.length) throw new Error("Ask Collect substantive answers must cite authorized evidence");
  const citedSources = [...new Set(generated.citations.map((citation) => citation.sourceId))].map((sourceId) => sourceById.get(sourceId)!);
  if (generation.run.provider === "openai" && media?.selectedImages.length) {
    await markDatasetImagesSentToAi({
      actorId,
      aiRunId: generation.run.id,
      attachmentIds: media.selectedImages.map((attachment) => attachment.id),
      datasetVersionId: datasetVersionId!,
      context: { conversationId },
    });
  }
  const [answer] = await db.insert(askMessages).values({
    conversationId,
    role: "assistant",
    content: generated.answer,
    metadata: { retrievalPolicy: "authorized_dataset_evidence_and_opt_in_images", questionMessageId: question.id, aiRunId: generation.run.id },
  }).returning();
  if (citedSources.length) {
    await db.insert(askMessageSources).values(citedSources.map((source) => ({
      messageId: answer.id,
      sourceType: source.sourceType,
      sourceId: source.id,
      citationLabel: source.label,
      excerpt: source.statement.slice(0, 1000),
    })));
  }
  return { question, answer, sources: citedSources, aiRun: generation.run };
}

export async function getAskConversation(id: string, actorId: string) {
  const conversation = (await db.select().from(askConversations).where(eq(askConversations.id, id)).limit(1))[0];
  if (!conversation || conversation.userId !== actorId) return null;
  const messages = await db.select().from(askMessages).where(eq(askMessages.conversationId, id)).orderBy(asc(askMessages.createdAt));
  const assistantMessageIds = messages.filter((message) => message.role === "assistant").map((message) => message.id);
  const sources = assistantMessageIds.length
    ? await db.select().from(askMessageSources).where(inArray(askMessageSources.messageId, assistantMessageIds))
    : [];
  const sourceIds = sources.filter((source) => source.sourceType === "approved_finding").map((source) => source.sourceId);
  const attachmentSourceIds = sources.filter((source) => source.sourceType === "attachment").map((source) => source.sourceId);
  const contextSourceIds = sources.filter((source) => source.sourceType === "conversation_context").map((source) => source.sourceId);
  const evidence = sourceIds.length ? await db
    .select({ id: approvedFindings.id, record: records })
    .from(approvedFindings)
    .innerJoin(recordVersions, eq(approvedFindings.recordVersionId, recordVersions.id))
    .innerJoin(records, eq(recordVersions.recordId, records.id))
    .where(inArray(approvedFindings.id, sourceIds)) : [];
  const mediaEvidence = attachmentSourceIds.length ? await db
    .select({ attachment: attachments, record: records })
    .from(attachments)
    .innerJoin(recordVersions, eq(attachments.recordVersionId, recordVersions.id))
    .innerJoin(records, eq(recordVersions.recordId, records.id))
    .where(inArray(attachments.id, attachmentSourceIds)) : [];
  const access = await getAccessContext(actorId);
  const allowedIds = new Set(evidence.filter(({ record }) =>
    ["clear", "redacted"].includes(record.privacyStatus) &&
    record.researchUseStatus !== "restricted" &&
    evaluateAuthorization(access, "records.view_approved", {
      organizationId: record.organizationId,
      programId: record.programId,
      siteId: record.siteId,
      serviceKey: record.sourceKind,
      researchUse: record.researchUseStatus,
      dataClassification: "approved_evidence",
    }).allowed,
  ).map(({ id: evidenceId }) => evidenceId));
  if (contextSourceIds.includes(conversation.id)) allowedIds.add(conversation.id);
  const savedScope = (conversation.scope ?? {}) as AskScope;
  const datasetRecordVersions = savedScope.datasetVersionId
    ? await db.select({ recordVersionId: datasetRecords.recordVersionId })
        .from(datasetRecords)
        .where(eq(datasetRecords.datasetVersionId, savedScope.datasetVersionId))
    : [];
  const datasetRecordVersionIds = new Set(datasetRecordVersions.map((row) => row.recordVersionId));
  for (const { attachment, record } of mediaEvidence) {
    if (
      savedScope.datasetVersionId &&
      datasetRecordVersionIds.has(attachment.recordVersionId) &&
      ["clear", "redacted"].includes(record.privacyStatus) &&
      record.researchUseStatus !== "restricted" &&
      evaluateAuthorization(access, "records.view_approved", {
        organizationId: record.organizationId,
        programId: record.programId,
        siteId: record.siteId,
        serviceKey: record.sourceKind,
        researchUse: record.researchUseStatus,
        dataClassification: "approved_evidence",
      }).allowed
    ) allowedIds.add(attachment.id);
  }
  const visibleSources = sources.filter((source) => allowedIds.has(source.sourceId));
  const restrictedMessageIds = new Set(sources.filter((source) => !allowedIds.has(source.sourceId)).map((source) => source.messageId));
  return {
    conversation,
    messages: messages.map((message) => restrictedMessageIds.has(message.id) ? { ...message, content: "This saved answer is no longer available under your current access scope.", metadata: { accessRevoked: true } } : message),
    sources: visibleSources,
  };
}
