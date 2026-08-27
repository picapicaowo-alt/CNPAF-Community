import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import {
  approvedFindings,
  attachments,
  askConversations,
  askMessages,
  askMessageSources,
  datasetRecords,
  recordFieldAnswers,
  records,
  recordVersions,
} from "@cnpaf/db/schema";
import type { z } from "zod";
import { type askConversationBodySchema } from "@cnpaf/shared";
import { db } from "./db";
import { evaluateAuthorization, getAccessContext } from "./authorization";
import { executeConfiguredWorkflow, externalWebSourceId } from "./ai";
import type { AiFileInput, AiImageInput } from "./ai";
import { scanPrivacy } from "./pii";
import { matchesEvidenceFilters } from "./evidence-filters";
import { normalizeAskAiOutput } from "./ask-citations";
import { isAskSourceVersionInScope } from "./ask-source-scope";
import { recordReference } from "@/features/records/display";
import {
  markDatasetImagesSentToAi,
  prepareDatasetAiMedia,
} from "./dataset-ai-media";
import { getDatasetEvidenceForAi } from "./modules/datasets";
import { putObject } from "./storage";
import { isOpenAiModelId, type OpenAiModelId } from "./openai-model-catalog";

type ConversationInput = z.infer<typeof askConversationBodySchema>;
type AskScope = ConversationInput["scope"] & {
  datasetVersionId?: string;
  includeMedia?: boolean;
  contextSources?: ConversationInput["contextSources"];
};

type IncomingAskFile = { name: string; mimeType: string; body: Buffer };
type AskMessageOptions = {
  modelName?: string;
  privacyAttested?: boolean;
  files?: IncomingAskFile[];
};

type StoredAskAttachment = {
  id: string;
  name: string;
  mimeType: string;
  byteSize: number;
  storageKey: string;
};

type AskSourceMetadata = Record<string, unknown>;
type AskSource = {
  id: string;
  label: string;
  statement: string;
  sourceType: string;
  metadata?: AskSourceMetadata;
};

const ASK_FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

const MAX_ASK_FILES = 5;
const MAX_ASK_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ASK_TOTAL_BYTES = 25 * 1024 * 1024;

function safeUploadName(value: string) {
  const basename = value.split(/[\\/]/).pop()?.trim() || "attachment";
  return basename.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180);
}

function normalizedAskMime(name: string, declared: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const expected = ASK_FILE_TYPES[extension];
  if (!expected) throw new Error(`Unsupported attachment type: ${name}`);
  if (declared && declared !== "application/octet-stream" && declared !== expected) {
    const jpegAlias = expected === "image/jpeg" && declared === "image/jpg";
    if (!jpegAlias) throw new Error(`Attachment type does not match its filename: ${name}`);
  }
  return expected;
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

export async function extractAskFileTextForPrivacy(name: string, mimeType: string, body: Buffer) {
  if (mimeType.startsWith("image/")) return "";
  if (mimeType.startsWith("text/")) return body.toString("utf8");
  if (mimeType === "application/pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    return (await pdfParse(body, { max: 500 })).text;
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ buffer: body })).value;
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    const { strFromU8, unzipSync } = await import("fflate");
    const archive = unzipSync(new Uint8Array(body));
    return Object.entries(archive)
      .filter(([path]) => path === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(path))
      .flatMap(([, bytes]) => {
        const xml = strFromU8(bytes);
        return [...xml.matchAll(/<(?:t|v)(?:\s[^>]*)?>([\s\S]*?)<\/(?:t|v)>/g)]
          .map((match) => decodeXmlEntities(match[1] ?? ""));
      })
      .join("\n");
  }
  if (mimeType === "application/msword" || mimeType === "application/vnd.ms-excel") {
    throw new Error(`Legacy Office attachment cannot be privacy-screened reliably; convert it to .docx or .xlsx: ${name}`);
  }
  throw new Error(`Attachment cannot be privacy-screened: ${name}`);
}

async function storeAskFiles(
  conversationId: string,
  actorId: string,
  files: IncomingAskFile[],
  privacyAttested: boolean,
) {
  if (!files.length) return [] as Array<{ attachment: StoredAskAttachment; body: Buffer }>;
  if (!privacyAttested) throw new Error("Confirm that every attachment is de-identified before sending it to AI");
  if (files.length > MAX_ASK_FILES) throw new Error(`A message can include at most ${MAX_ASK_FILES} attachments`);
  if (files.reduce((sum, file) => sum + file.body.byteLength, 0) > MAX_ASK_TOTAL_BYTES) throw new Error("Attachments exceed the 25 MB combined limit");

  const prepared = await Promise.all(files.map(async (file) => {
    const name = safeUploadName(file.name);
    if (!file.body.byteLength) throw new Error(`Attachment is empty: ${name}`);
    if (file.body.byteLength > MAX_ASK_FILE_BYTES) throw new Error(`Attachment exceeds 10 MB: ${name}`);
    const mimeType = normalizedAskMime(name, file.mimeType);
    if (!mimeType.startsWith("image/")) {
      let extractedText = "";
      try {
        extractedText = await extractAskFileTextForPrivacy(name, mimeType, file.body);
      } catch (error) {
        if (error instanceof Error && /privacy-screened|cannot be privacy-screened/.test(error.message)) throw error;
        throw new Error(`Could not privacy-screen attachment: ${name}`);
      }
      if (!extractedText.trim()) throw new Error(`Attachment has no readable text to privacy-screen: ${name}`);
      const scan = scanPrivacy({
        sourceKind: "ask_collect_attachment",
        qualitative: extractedText.slice(0, 500_000),
        attribution: {},
        policy: { allowedIdentifierFields: [], privacyDisposition: "flag" },
      });
      if (scan.status === "flagged") throw new Error(`Attachment contains possible personal information: ${name}`);
    }
    const id = randomUUID();
    const extension = name.split(".").pop()?.toLowerCase() ?? "bin";
    const storageKey = `ask-conversations/${actorId}/${conversationId}/${id}.${extension}`;
    return {
      attachment: { id, name, mimeType, byteSize: file.body.byteLength, storageKey },
      body: file.body,
    };
  }));
  for (const item of prepared) await putObject(item.attachment.storageKey, item.body, item.attachment.mimeType);
  return prepared;
}

function searchableStatement(value: unknown) {
  return (value as { statement?: string } | null)?.statement?.trim() ?? "";
}

function recordSourceMetadata(input: {
  recordId: string;
  recordReference: string;
  sourceKind: string;
  occurredAt?: Date | null;
  updatedAt?: Date | null;
  snapshotMode: "live" | "dataset";
}) {
  return {
    recordId: input.recordId,
    recordReference: input.recordReference,
    sourceKind: input.sourceKind,
    occurredAt: input.occurredAt?.toISOString() ?? null,
    updatedAt: input.updatedAt?.toISOString() ?? null,
    snapshotMode: input.snapshotMode,
  } satisfies AskSourceMetadata;
}

function readableEvidenceValue(value: unknown): string {
  if (value == null || value === "") return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(readableEvidenceValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function approvedRecordStatement(
  version: Pick<typeof recordVersions.$inferSelect, "qualitative" | "occurredAt">,
  answers: Array<Pick<typeof recordFieldAnswers.$inferSelect, "labelEn" | "labelZh" | "value" | "customText" | "missingReasonKey">>,
) {
  const fields = answers.map((answer) => {
    const label = answer.labelEn === answer.labelZh
      ? answer.labelEn
      : `${answer.labelEn} / ${answer.labelZh}`;
    const value = answer.customText?.trim()
      || (answer.missingReasonKey ? `Missing: ${answer.missingReasonKey}` : readableEvidenceValue(answer.value));
    return `${label}: ${value}`;
  });
  const parts = [
    version.occurredAt ? `Occurred: ${version.occurredAt.toISOString()}` : "",
    ...fields,
    version.qualitative.trim() ? `Reviewed source notes: ${version.qualitative.trim()}` : "",
  ].filter(Boolean);
  return parts.join("\n").slice(0, 20_000);
}

function relevanceScore(question: string, statement: string) {
  const normalizedQuestion = question.toLocaleLowerCase();
  const normalizedStatement = statement.toLocaleLowerCase();
  const terms = [...new Set(normalizedQuestion.match(/[\p{L}\p{N}]{2,}/gu) ?? [])];
  if (!terms.length) return 1;
  return terms.reduce((score, term) => score + (normalizedStatement.includes(term) ? 1 : 0), 0);
}

function contextSourceId(conversationId: string, index: number) {
  const hex = createHash("sha256")
    .update(`${conversationId}:context:${index}`)
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function isSafeExternalWebSource(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const urlValue = (metadata as { url?: unknown }).url;
  if (typeof urlValue !== "string") return false;
  try {
    const url = new URL(urlValue);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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

export async function addAskMessage(
  conversationId: string,
  actorId: string,
  content: string,
  options: AskMessageOptions = {},
) {
  const conversation = (await db.select().from(askConversations).where(eq(askConversations.id, conversationId)).limit(1))[0];
  if (!conversation || conversation.userId !== actorId || conversation.status !== "active") throw new Error("Conversation not found");
  const questionPrivacy = scanPrivacy({
    sourceKind: "ask_collect",
    qualitative: content,
    attribution: {},
    policy: { allowedIdentifierFields: [], privacyDisposition: "flag" },
  });
  if (questionPrivacy.status === "flagged") throw new Error("Question contains possible personal information and cannot be sent to the configured AI provider");
  if (options.modelName && !isOpenAiModelId(options.modelName)) throw new Error("Unsupported OpenAI model");
  const modelName = options.modelName as OpenAiModelId | undefined;
  const priorMessages = await db.select({ role: askMessages.role, content: askMessages.content })
    .from(askMessages)
    .where(eq(askMessages.conversationId, conversationId))
    .orderBy(asc(askMessages.createdAt));
  const uploads = await storeAskFiles(conversationId, actorId, options.files ?? [], Boolean(options.privacyAttested));
  const uploadMetadata = uploads.map(({ attachment }) => attachment);
  const [question] = await db.insert(askMessages).values({
    conversationId,
    role: "user",
    content,
    metadata: { modelName: modelName ?? null, attachments: uploadMetadata },
  }).returning();
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
      isAskSourceVersionInScope({
        datasetVersionId,
        frozenRecordVersionIds,
        recordHeadVersionId: record.headVersionId,
        recordVersionId: version.id,
      }) &&
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
  const evidenceSources: AskSource[] = authorized.map(({ approved, record, version }) => {
    const reference = recordReference({
      id: record.id,
      sourceKind: record.sourceKind,
      occurredAt: version.occurredAt,
      updatedAt: record.updatedAt,
    });
    return {
      id: approved.id,
      label: `AF-${reference}-${approved.id.slice(0, 8).toUpperCase()}`,
      statement: searchableStatement(approved.approvedValue) || "Approved evidence",
      sourceType: "approved_finding",
      metadata: recordSourceMetadata({
        recordId: record.id,
        recordReference: reference,
        sourceKind: record.sourceKind,
        occurredAt: version.occurredAt,
        updatedAt: record.updatedAt,
        snapshotMode: datasetVersionId ? "dataset" : "live",
      }),
    };
  });
  const datasetRecordSources = datasetVersionId
    ? await getDatasetEvidenceForAi(actorId, datasetVersionId)
    : [];
  // A record-level conversation is explicitly scoped to approved records. The
  // reviewed snapshot itself is therefore a valid source even when reviewers
  // approved the submission without separately accepting AI findings.
  const requestedRecordIds = requestedScope.recordIds ?? [];
  const approvedRecordRows = requestedRecordIds.length
    ? await db
        .select({ record: records, version: recordVersions })
        .from(records)
        .innerJoin(recordVersions, eq(records.headVersionId, recordVersions.id))
        .where(and(inArray(records.id, requestedRecordIds), eq(records.reviewStatus, "approved")))
    : !datasetVersionId && !evidenceSources.length
      ? await db
          .select({ record: records, version: recordVersions })
          .from(records)
          .innerJoin(recordVersions, eq(records.headVersionId, recordVersions.id))
          .where(eq(records.reviewStatus, "approved"))
          .orderBy(desc(records.updatedAt))
          .limit(25)
      : [];
  const approvedRecordVersionIds = approvedRecordRows.map(({ version }) => version.id);
  const approvedRecordAnswers = approvedRecordVersionIds.length
    ? await db
        .select()
        .from(recordFieldAnswers)
        .where(inArray(recordFieldAnswers.recordVersionId, approvedRecordVersionIds))
        .orderBy(recordFieldAnswers.sectionSortOrder, recordFieldAnswers.fieldSortOrder)
    : [];
  const answersByVersion = new Map<string, typeof approvedRecordAnswers>();
  for (const answer of approvedRecordAnswers) {
    answersByVersion.set(answer.recordVersionId, [
      ...(answersByVersion.get(answer.recordVersionId) ?? []),
      answer,
    ]);
  }
  const approvedRecordSources: AskSource[] = approvedRecordRows
    .filter(({ record, version }) =>
      matchesEvidenceFilters(evidenceScope, record, version, null) &&
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
    .map(({ record, version }) => {
      const reference = recordReference({
        id: record.id,
        sourceKind: record.sourceKind,
        occurredAt: version.occurredAt,
        updatedAt: record.updatedAt,
      });
      return {
        id: version.id,
        label: reference,
        statement: approvedRecordStatement(version, answersByVersion.get(version.id) ?? []),
        sourceType: "approved_record",
        metadata: recordSourceMetadata({
          recordId: record.id,
          recordReference: reference,
          sourceKind: record.sourceKind,
          occurredAt: version.occurredAt,
          updatedAt: record.updatedAt,
          snapshotMode: "live",
        }),
      };
    })
    .filter((source) => source.statement.trim());
  const media = requestedScope.includeMedia && datasetVersionId
    ? await prepareDatasetAiMedia(actorId, datasetVersionId)
    : null;
  const imageInputs = media?.imageInputs ?? [];
  const datasetFileInputs = media?.fileInputs ?? [];
  const mediaSources = media?.mediaSources ?? [];
  const conversationContextSources = (contextSources ?? []).map((source, index) => ({
    id: contextSourceId(conversation.id, index),
    label: source.label,
    statement: source.statement,
    sourceType: "conversation_context" as const,
  }));
  const uploadedSources = uploadMetadata.map((attachment) => ({
    id: attachment.id,
    label: `FILE-${attachment.id.slice(0, 8)}`,
    statement: `User-provided conversation attachment: ${attachment.name}`,
    sourceType: "conversation_upload" as const,
  }));
  const sources: AskSource[] = [
    ...evidenceSources,
    ...datasetRecordSources,
    ...approvedRecordSources,
    ...mediaSources,
    ...conversationContextSources,
    ...uploadedSources,
  ];
  const uploadImageInputs: AiImageInput[] = uploads
    .filter(({ attachment }) => attachment.mimeType.startsWith("image/"))
    .map(({ attachment, body }) => ({ id: attachment.id, mimeType: attachment.mimeType, body }));
  const uploadFileInputs: AiFileInput[] = uploads
    .filter(({ attachment }) => !attachment.mimeType.startsWith("image/"))
    .map(({ attachment, body }) => ({ id: attachment.id, filename: attachment.name, mimeType: attachment.mimeType, body }));
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
      latestQuestion: content,
      conversationHistory: priorMessages.slice(-12),
      responseInstructions: [
        "Answer the latest question directly and treat earlier messages as conversational context.",
        "Do not repeat the previous answer unless the user explicitly asks for repetition.",
        "Use the approved sources and user-provided files as the only authority for claims about the current records, Dataset, report, or organization.",
        "You may supplement the answer with clearly labeled public background or comparative context from web search, but never use it to fill a gap in the internal evidence.",
        "The structured citations array is reserved for the UUIDs of approvedSources in this input; web citations are captured separately from tool annotations.",
        "In the human-facing answer, cite internal evidence with the supplied source label and never expose a raw source UUID.",
        "If the evidence cannot support a requested conclusion, say so clearly and suggest the next useful step.",
      ],
      selectedModel: modelName ?? null,
      requestedScope,
      datasetVersionId: datasetVersionId ?? null,
      mediaContext: {
        requested: Boolean(requestedScope.includeMedia),
        includedByDatasetPolicy: media?.mediaIncluded ?? false,
        attachmentSourceIds: mediaSources.map((source) => source.id),
        omittedAttachmentCount: (media?.totalAttachmentCount ?? 0) - mediaSources.length,
      },
      approvedSources: sources.map((source) => ({
        id: source.id,
        label: source.label,
        statement: source.statement,
        metadata: source.metadata ?? {},
      })),
    },
    localOutput,
    imageInputs: [...imageInputs, ...uploadImageInputs],
    fileInputs: [...datasetFileInputs, ...uploadFileInputs],
    modelOverride: modelName,
    requiredProviderKey: "openai",
    allowLocalFallback: false,
  });
  const generated = normalizeAskAiOutput(generation.output, sources);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  if (generated.citations.some((citation) => !sourceById.has(citation.sourceId))) throw new Error("Ask Collect AI output cited evidence outside the authorized retrieval set");
  if (sources.length && !generated.citations.length) throw new Error("Ask Collect substantive answers must cite authorized evidence");
  const citedSources = [...new Set(generated.citations.map((citation) => citation.sourceId))].map((sourceId) => sourceById.get(sourceId)!);
  const externalSources = generation.externalSources.map((source, index) => ({
    id: externalWebSourceId(source.url),
    label: `WEB-${index + 1}`,
    statement: source.title,
    sourceType: "external_web" as const,
    metadata: { title: source.title, url: source.url },
  }));
  if (generation.run.provider === "openai" && media?.selectedAttachments.length) {
    await markDatasetImagesSentToAi({
      actorId,
      aiRunId: generation.run.id,
      attachmentIds: media.selectedAttachments.map((attachment) => attachment.id),
      datasetVersionId: datasetVersionId!,
      context: { conversationId },
    });
  }
  const [answer] = await db.insert(askMessages).values({
    conversationId,
    role: "assistant",
    content: generated.answer,
    metadata: {
      retrievalPolicy: "authorized_internal_evidence_with_optional_cited_external_context",
      questionMessageId: question.id,
      aiRunId: generation.run.id,
      modelName: generation.run.model,
      externalSourceCount: externalSources.length,
    },
  }).returning();
  if (citedSources.length || externalSources.length) {
    await db.insert(askMessageSources).values([
      ...citedSources.map((source) => ({
        messageId: answer.id,
        sourceType: source.sourceType,
        sourceId: source.id,
        citationLabel: source.label,
        excerpt: source.statement.slice(0, 1000),
        metadata: source.metadata ?? {},
      })),
      ...externalSources.map((source) => ({
        messageId: answer.id,
        sourceType: source.sourceType,
        sourceId: source.id,
        citationLabel: source.label,
        excerpt: source.statement.slice(0, 1000),
        metadata: source.metadata,
      })),
    ]);
  }
  return { question, answer, sources: [...citedSources, ...externalSources], aiRun: generation.run };
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
  const approvedRecordSourceIds = sources.filter((source) => source.sourceType === "approved_record").map((source) => source.sourceId);
  const attachmentSourceIds = sources.filter((source) => source.sourceType === "attachment").map((source) => source.sourceId);
  const contextSourceIds = sources.filter((source) => source.sourceType === "conversation_context").map((source) => source.sourceId);
  const uploadSourceIds = new Set(messages.flatMap((message) => {
    if (message.role !== "user") return [];
    const metadata = message.metadata as { attachments?: StoredAskAttachment[] } | null;
    return (metadata?.attachments ?? []).map((attachment) => attachment.id);
  }));
  const evidence = sourceIds.length ? await db
    .select({ id: approvedFindings.id, version: recordVersions, record: records })
    .from(approvedFindings)
    .innerJoin(recordVersions, eq(approvedFindings.recordVersionId, recordVersions.id))
    .innerJoin(records, eq(recordVersions.recordId, records.id))
    .where(inArray(approvedFindings.id, sourceIds)) : [];
  const approvedRecordEvidence = approvedRecordSourceIds.length ? await db
    .select({ version: recordVersions, record: records })
    .from(recordVersions)
    .innerJoin(records, eq(recordVersions.recordId, records.id))
    .where(inArray(recordVersions.id, approvedRecordSourceIds)) : [];
  const mediaEvidence = attachmentSourceIds.length ? await db
    .select({ attachment: attachments, record: records })
    .from(attachments)
    .innerJoin(recordVersions, eq(attachments.recordVersionId, recordVersions.id))
    .innerJoin(records, eq(recordVersions.recordId, records.id))
    .where(inArray(attachments.id, attachmentSourceIds)) : [];
  const access = await getAccessContext(actorId);
  const savedScope = (conversation.scope ?? {}) as AskScope;
  const datasetRecordVersions = savedScope.datasetVersionId
    ? await db.select({ recordVersionId: datasetRecords.recordVersionId })
        .from(datasetRecords)
        .where(eq(datasetRecords.datasetVersionId, savedScope.datasetVersionId))
    : [];
  const datasetRecordVersionIds = new Set(datasetRecordVersions.map((row) => row.recordVersionId));
  const allowedIds = new Set(evidence.filter(({ version, record }) =>
    (record.headVersionId === version.id || datasetRecordVersionIds.has(version.id)) &&
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
  for (const { version, record } of approvedRecordEvidence) {
    if (
      (record.headVersionId === version.id || datasetRecordVersionIds.has(version.id)) &&
      record.reviewStatus === "approved" &&
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
    ) allowedIds.add(version.id);
  }
  const allowedContextSourceIds = new Set(
    (savedScope.contextSources ?? []).map((_, index) => contextSourceId(conversation.id, index)),
  );
  for (const sourceId of contextSourceIds) {
    if (allowedContextSourceIds.has(sourceId)) allowedIds.add(sourceId);
  }
  for (const source of sources) {
    if (source.sourceType === "conversation_upload" && uploadSourceIds.has(source.sourceId)) allowedIds.add(source.sourceId);
    if (source.sourceType === "external_web" && isSafeExternalWebSource(source.metadata)) allowedIds.add(source.sourceId);
  }
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
  const recordMetadataBySourceId = new Map<string, AskSourceMetadata>();
  for (const { id: evidenceId, version, record } of evidence) {
    const reference = recordReference({
      id: record.id,
      sourceKind: record.sourceKind,
      occurredAt: version.occurredAt,
      updatedAt: record.updatedAt,
    });
    recordMetadataBySourceId.set(evidenceId, recordSourceMetadata({
      recordId: record.id,
      recordReference: reference,
      sourceKind: record.sourceKind,
      occurredAt: version.occurredAt,
      updatedAt: record.updatedAt,
      snapshotMode: datasetRecordVersionIds.has(version.id) ? "dataset" : "live",
    }));
  }
  for (const { version, record } of approvedRecordEvidence) {
    const reference = recordReference({
      id: record.id,
      sourceKind: record.sourceKind,
      occurredAt: version.occurredAt,
      updatedAt: record.updatedAt,
    });
    recordMetadataBySourceId.set(version.id, recordSourceMetadata({
      recordId: record.id,
      recordReference: reference,
      sourceKind: record.sourceKind,
      occurredAt: version.occurredAt,
      updatedAt: record.updatedAt,
      snapshotMode: datasetRecordVersionIds.has(version.id) ? "dataset" : "live",
    }));
  }
  const visibleSources = sources
    .filter((source) => allowedIds.has(source.sourceId))
    .map((source) => {
      const hydrated = recordMetadataBySourceId.get(source.sourceId);
      if (!hydrated) return source;
      const saved = source.metadata && typeof source.metadata === "object" && !Array.isArray(source.metadata)
        ? source.metadata as AskSourceMetadata
        : {};
      return { ...source, metadata: { ...saved, ...hydrated } };
    });
  const restrictedMessageIds = new Set(sources.filter((source) => !allowedIds.has(source.sourceId)).map((source) => source.messageId));
  return {
    conversation,
    messages: messages.map((message) => {
      if (restrictedMessageIds.has(message.id)) return { ...message, content: "This saved answer is no longer available under your current access scope.", metadata: { accessRevoked: true } };
      const metadata = message.metadata as { attachments?: StoredAskAttachment[] } | null;
      return {
        ...message,
        metadata: {
          ...(metadata ?? {}),
          ...(metadata?.attachments
            ? { attachments: metadata.attachments.map(({ storageKey: _storageKey, ...attachment }) => attachment) }
            : {}),
        },
      };
    }),
    sources: visibleSources,
  };
}
