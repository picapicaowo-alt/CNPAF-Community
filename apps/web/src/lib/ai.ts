import { and, eq, inArray } from "drizzle-orm";
import Ajv from "ajv";
import {
  aiFindings,
  aiModelConfigs,
  aiProviderConfigs,
  aiRuns,
  aiWorkflowVersions,
  aiWorkflows,
  canonicalThemes,
  outputSchemaVersions,
  promptVersions,
  records,
  recordCustomEntries,
  recordFieldAnswers,
  recordStructuredSelections,
  recordVersions,
  safetyFlags,
  privacyFlags,
} from "@cnpaf/db/schema";
import {
  AI_OUTPUT_SCHEMA_VERSION,
  aiOutputSchema,
  type AiOutput,
  type ConcernOrigin,
} from "@cnpaf/shared";
import { db } from "./db";
import { contentHash } from "./crypto";
import { scanPrivacy } from "./pii";
import { audit } from "./audit";
import { loadSourceKindPolicy } from "./source-kind";
import { getOpenAiRuntimeConfig } from "@/config/server";

const SAFETY_HINT =
  /不给他吃饭|虐待|打人|受伤|abuse|starv|neglect|hit him|hit her|not feeding/i;

function offsets(haystack: string, needle: string): { text: string; start: number; end: number } {
  const start = haystack.indexOf(needle);
  if (start < 0) {
    return { text: needle.slice(0, 180), start: 0, end: Math.min(needle.length, haystack.length) };
  }
  return { text: needle, start, end: start + needle.length };
}

function localAnalyze(
  text: string,
  defaultConcernOriginKey: string,
  themeCatalog: Array<{ key: string; nameEn: string; definition: string }>,
): AiOutput {
  const sentences = text
    .split(/[。.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8)
    .slice(0, 6);

  const origin: ConcernOrigin = defaultConcernOriginKey;
  const normalizedText = text.toLocaleLowerCase();
  const rankedThemes = themeCatalog.map((theme) => {
    const terms = [...new Set(`${theme.key.replaceAll("_", " ")} ${theme.nameEn} ${theme.definition}`
      .toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])];
    return { key: theme.key, score: terms.reduce((score, term) => score + (normalizedText.includes(term) ? 1 : 0), 0) };
  }).sort((left, right) => right.score - left.score || left.key.localeCompare(right.key));
  const themeKey = rankedThemes[0]?.key ?? "unclassified";

  const concerns = sentences.slice(0, 3).map((sentence) => ({
    statement: sentence.slice(0, 240),
    suggestedCanonicalKey: themeKey,
    origin,
    confidence: 0.55,
    evidence: [offsets(text, sentence.slice(0, 80))],
  }));

  const safetySuspect = SAFETY_HINT.test(text)
    ? [
        {
          statement: "Flagged for urgent human review — possible safeguarding issue. 建议紧急人工查看。",
          needsUrgentHumanReview: true as const,
          evidence: [offsets(text, text.slice(0, 80))],
        },
      ]
    : [];

  return {
    summary: {
      zh: sentences[0] ? `摘要：${sentences[0].slice(0, 120)}` : "无足够正文可摘要。",
      en: sentences[0] ? `Summary: ${sentences[0].slice(0, 120)}` : "Not enough text to summarize.",
    },
    themes: [
      {
        rawLabel: themeKey.replaceAll("_", " "),
        suggestedCanonicalKey: themeKey,
        confidence: 0.5,
        evidence: [offsets(text, sentences[0] ?? text.slice(0, 40))],
      },
    ],
    concerns,
    quantitativeSuggestions: [],
    safetySuspect,
  };
}

export type AiImageInput = {
  id: string;
  mimeType: string;
  body: Buffer;
};

async function callOpenAi(
  system: string,
  user: string,
  model: string,
  images: AiImageInput[] = [],
): Promise<{ raw: string; parsed: unknown; tokens?: { in: number; out: number } }> {
  const { apiKey, endpoint } = getOpenAiRuntimeConfig();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: images.length
            ? [
                { type: "text", text: user },
                ...images.map((image) => ({
                  type: "image_url",
                  image_url: {
                    url: `data:${image.mimeType};base64,${image.body.toString("base64")}`,
                  },
                })),
              ]
            : user,
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  const raw = body.choices[0]?.message?.content ?? "{}";
  const parsed: unknown = JSON.parse(raw);
  return {
    raw,
    parsed,
    tokens: body.usage
      ? { in: body.usage.prompt_tokens, out: body.usage.completion_tokens }
      : undefined,
  };
}

async function resolveWorkflowConfiguration(workflowVersionId?: string | null, workflowKey = "record_classification") {
  let workflow = null as typeof aiWorkflows.$inferSelect | null;
  let workflowVersion = workflowVersionId
    ? (await db.select().from(aiWorkflowVersions).where(eq(aiWorkflowVersions.id, workflowVersionId)).limit(1))[0]
    : null;
  if (workflowVersionId && !workflowVersion) throw new Error("AI workflow version not found");
  if (!workflowVersion) {
    workflow = (await db.select().from(aiWorkflows).where(eq(aiWorkflows.key, workflowKey)).limit(1))[0] ?? null;
    workflowVersion = workflow?.currentPublishedVersionId
      ? (await db.select().from(aiWorkflowVersions).where(eq(aiWorkflowVersions.id, workflow.currentPublishedVersionId)).limit(1))[0]
      : null;
  }
  if (!workflowVersion || workflowVersion.status !== "published") throw new Error(`Published ${workflowKey} AI workflow version not found`);
  workflow ??= (await db.select().from(aiWorkflows).where(eq(aiWorkflows.id, workflowVersion.workflowId)).limit(1))[0] ?? null;
  if (!workflow || workflow.workflowTypeKey !== workflowKey) throw new Error(`AI workflow version is not a ${workflowKey} workflow`);
  const [provider, model, outputSchema] = await Promise.all([
    workflowVersion?.providerConfigId ? db.select().from(aiProviderConfigs).where(eq(aiProviderConfigs.id, workflowVersion.providerConfigId)).limit(1).then((rows) => rows[0]) : Promise.resolve(null),
    workflowVersion?.modelConfigId ? db.select().from(aiModelConfigs).where(eq(aiModelConfigs.id, workflowVersion.modelConfigId)).limit(1).then((rows) => rows[0]) : Promise.resolve(null),
    workflowVersion?.outputSchemaVersionId ? db.select().from(outputSchemaVersions).where(eq(outputSchemaVersions.id, workflowVersion.outputSchemaVersionId)).limit(1).then((rows) => rows[0]) : Promise.resolve(null),
  ]);
  const prompt = workflowVersion.promptVersionId
    ? (await db.select().from(promptVersions).where(eq(promptVersions.id, workflowVersion.promptVersionId)).limit(1))[0]
    : null;
  if (!prompt || prompt.status !== "active") throw new Error("AI workflow has no active pinned prompt version");
  if (!outputSchema || outputSchema.status !== "published") throw new Error("AI workflow has no published pinned output schema version");
  if (!provider || provider.status !== "active") throw new Error("AI workflow has no active pinned provider");
  if (!model || model.status !== "active" || model.providerConfigId !== provider.id) throw new Error("AI workflow has no active pinned model for its provider");
  return {
    workflowVersion,
    providerKey: provider.key,
    modelName: model.modelName,
    outputSchema,
    prompt,
  };
}

function validateConfiguredJson(value: unknown, configuredSchema: unknown) {
  if (!configuredSchema) return value;
  const schema = configuredSchema as { contract?: string } | null;
  if (schema?.contract === "@cnpaf/shared#aiOutputSchema") return aiOutputSchema.parse(value);
  if (schema) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(configuredSchema as object);
    if (!validate(value)) throw new Error(`Configured output schema rejected AI output: ${ajv.errorsText(validate.errors)}`);
  }
  return value;
}

function localFallbackEnabled(workflowVersion: typeof aiWorkflowVersions.$inferSelect) {
  return (workflowVersion.featureFlags as { fallbackProviderKey?: string } | null)?.fallbackProviderKey === "local_heuristic";
}

export async function executeConfiguredWorkflow(input: {
  workflowKey: string;
  workflowVersionId?: string | null;
  idempotencyKey: string;
  inputSnapshot: Record<string, unknown>;
  localOutput: unknown | (() => unknown | Promise<unknown>);
  createdByUserId?: string | null;
  reportRunId?: string | null;
  imageInputs?: AiImageInput[];
}) {
  const existingRun = (await db.select().from(aiRuns).where(eq(aiRuns.idempotencyKey, input.idempotencyKey)).limit(1))[0];
  const configuration = await resolveWorkflowConfiguration(input.workflowVersionId ?? existingRun?.workflowVersionId, input.workflowKey);
  const workflow = configuration.workflowVersion;
  const prompt = configuration.prompt;
  const inputHash = contentHash(input.inputSnapshot);
  let run = existingRun;
  if (!run) {
    [run] = await db.insert(aiRuns).values({
      workflowVersionId: workflow.id,
      reportRunId: input.reportRunId,
      promptVersionId: prompt.id,
      outputSchemaVersionId: configuration.outputSchema?.id,
      provider: configuration.providerKey,
      model: configuration.modelName,
      promptVersion: prompt.version,
      outputSchemaVersion: configuration.outputSchema ? `${configuration.outputSchema.key}@${configuration.outputSchema.version}` : prompt.outputSchemaVersion,
      inputHash,
      status: "queued",
      idempotencyKey: input.idempotencyKey,
      inputSnapshot: input.inputSnapshot,
      createdByUserId: input.createdByUserId,
    }).onConflictDoNothing({ target: aiRuns.idempotencyKey }).returning();
    run ??= (await db.select().from(aiRuns).where(eq(aiRuns.idempotencyKey, input.idempotencyKey)).limit(1))[0];
  }
  if (!run) throw new Error("Could not create AI workflow run");
  if (
    run.workflowVersionId !== workflow.id ||
    run.reportRunId !== (input.reportRunId ?? null) ||
    run.createdByUserId !== (input.createdByUserId ?? null) ||
    run.inputHash !== inputHash
  ) throw new Error("Idempotency key is already associated with a different AI workflow request");
  if (run.status === "succeeded") return { run, output: run.parsedOutput };
  const [claimed] = await db.update(aiRuns).set({
    status: "running",
    startedAt: new Date(),
    retryCount: run.status === "failed" ? run.retryCount + 1 : run.retryCount,
    error: null,
    errorMetadata: {},
    updatedAt: new Date(),
  }).where(and(eq(aiRuns.id, run.id), inArray(aiRuns.status, ["queued", "failed"]))).returning();
  if (!claimed) {
    const current = (await db.select().from(aiRuns).where(eq(aiRuns.id, run.id)).limit(1))[0];
    if (current?.status === "succeeded") return { run: current, output: current.parsedOutput };
    throw new Error("Equivalent AI workflow run is already running");
  }
  run = claimed;

  const resolveLocalOutput = async () => typeof input.localOutput === "function" ? await input.localOutput() : input.localOutput;
  let actualProvider = configuration.providerKey;
  let actualModel = configuration.modelName;
  let fallbackFrom: string | null = null;
  try {
    let parsed: unknown;
    let raw: string;
    let tokens: { in: number; out: number } | undefined;
    if (configuration.providerKey === "openai") {
      try {
        const result = await callOpenAi(
          prompt.systemPrompt,
          JSON.stringify(input.inputSnapshot),
          configuration.modelName,
          input.imageInputs,
        );
        parsed = validateConfiguredJson(result.parsed, configuration.outputSchema?.schema);
        raw = result.raw;
        tokens = result.tokens;
      } catch (error) {
        if (!localFallbackEnabled(workflow)) throw error;
        fallbackFrom = configuration.providerKey;
        actualProvider = "local_heuristic";
        actualModel = "local-v1";
        parsed = validateConfiguredJson(await resolveLocalOutput(), configuration.outputSchema?.schema);
        raw = JSON.stringify(parsed);
      }
    } else if (configuration.providerKey === "local_heuristic") {
      parsed = validateConfiguredJson(await resolveLocalOutput(), configuration.outputSchema?.schema);
      raw = JSON.stringify(parsed);
    } else {
      throw new Error(`Unsupported AI provider handler: ${configuration.providerKey}`);
    }
    const [completed] = await db.update(aiRuns).set({
      status: "succeeded",
      provider: actualProvider,
      model: actualModel,
      rawOutput: raw,
      parsedOutput: parsed,
      completedAt: new Date(),
      finishedAt: new Date(),
      inputTokens: tokens?.in,
      outputTokens: tokens?.out,
      tokenUsage: { input: tokens?.in ?? null, output: tokens?.out ?? null },
      costMetadata: fallbackFrom ? { fallbackFrom } : {},
      updatedAt: new Date(),
    }).where(eq(aiRuns.id, run.id)).returning();
    await audit({ actorId: input.createdByUserId, action: "ai_workflow_run.succeeded", entityType: "ai_run", entityId: run.id, metadata: { workflowKey: input.workflowKey, reportRunId: input.reportRunId ?? null, provider: actualProvider, fallbackFrom } });
    return { run: completed, output: parsed };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI workflow failed";
    await db.update(aiRuns).set({ status: "failed", error: message, errorMetadata: { message }, completedAt: new Date(), finishedAt: new Date(), updatedAt: new Date() }).where(eq(aiRuns.id, run.id));
    await audit({ actorId: input.createdByUserId, action: "ai_workflow_run.failed", entityType: "ai_run", entityId: run.id, metadata: { workflowKey: input.workflowKey, reportRunId: input.reportRunId ?? null, message } });
    throw error;
  }
}

export type QueuedAiRunInput = {
  recordVersionId: string;
  idempotencyKey: string;
  parentAiRunId?: string | null;
  reviewerInstruction?: string | null;
  workflowVersionId?: string | null;
  createdByUserId?: string | null;
};

export async function prepareQueuedAiRun(input: QueuedAiRunInput) {
  const version = (await db.select().from(recordVersions).where(eq(recordVersions.id, input.recordVersionId)).limit(1))[0];
  if (!version) throw new Error("Record version not found");
  const record = (await db.select().from(records).where(eq(records.id, version.recordId)).limit(1))[0];
  if (!record) throw new Error("Record not found");
  const existingRun = (await db.select().from(aiRuns).where(eq(aiRuns.idempotencyKey, input.idempotencyKey)).limit(1))[0];
  const configuration = await resolveWorkflowConfiguration(input.workflowVersionId ?? existingRun?.workflowVersionId);
  const prompt = configuration.prompt;
  const hashInput = {
    sourceKind: record.sourceKind,
    qualitative: version.qualitative,
    attribution: version.attribution,
    quantitative: version.quantitative,
    reviewerInstruction: input.reviewerInstruction ?? null,
  };
  const inputSnapshot = {
    recordVersionId: version.id,
    privacyStatus: record.privacyStatus,
    reviewerInstruction: input.reviewerInstruction ?? null,
  };
  return {
    existingRun,
    input,
    values: {
      workflowVersionId: configuration.workflowVersion?.id,
      recordVersionId: input.recordVersionId,
      parentAiRunId: input.parentAiRunId,
      reviewerInstruction: input.reviewerInstruction,
      promptVersionId: prompt.id,
      outputSchemaVersionId: configuration.outputSchema?.id,
      provider: configuration.providerKey,
      model: configuration.modelName,
      promptVersion: prompt.version,
      outputSchemaVersion: configuration.outputSchema ? `${configuration.outputSchema.key}@${configuration.outputSchema.version}` : (prompt.outputSchemaVersion ?? AI_OUTPUT_SCHEMA_VERSION),
      inputHash: contentHash(hashInput),
      status: "queued",
      idempotencyKey: input.idempotencyKey,
      inputSnapshot,
      createdByUserId: input.createdByUserId,
    } satisfies typeof aiRuns.$inferInsert,
  };
}

export function assertPreparedAiRun(
  run: typeof aiRuns.$inferSelect,
  prepared: Awaited<ReturnType<typeof prepareQueuedAiRun>>,
) {
  const input = prepared.input;
  if (
    run.workflowVersionId !== prepared.values.workflowVersionId ||
    run.recordVersionId !== input.recordVersionId ||
    run.parentAiRunId !== (input.parentAiRunId ?? null) ||
    run.reviewerInstruction !== (input.reviewerInstruction ?? null) ||
    run.createdByUserId !== (input.createdByUserId ?? null)
  ) throw new Error("Idempotency key is already associated with a different AI classification request");
}

export async function createQueuedAiRun(input: QueuedAiRunInput) {
  const prepared = await prepareQueuedAiRun(input);
  let run = prepared.existingRun;
  if (!run) {
    [run] = await db.insert(aiRuns).values(prepared.values).onConflictDoNothing({ target: aiRuns.idempotencyKey }).returning();
    run ??= (await db.select().from(aiRuns).where(eq(aiRuns.idempotencyKey, input.idempotencyKey)).limit(1))[0];
  }
  if (!run) throw new Error("Could not create AI classification run");
  assertPreparedAiRun(run, prepared);
  return run;
}

export async function runAnalysisJob(recordVersionId: string, aiRunId?: string | null) {
  const version = (await db.select().from(recordVersions).where(eq(recordVersions.id, recordVersionId)).limit(1))[0];
  if (!version) throw new Error("version not found");
  const record = (await db.select().from(records).where(eq(records.id, version.recordId)).limit(1))[0];
  if (!record) throw new Error("record not found");
  const sourcePolicy = await loadSourceKindPolicy(record.sourceKind);
  let activeRun = aiRunId
    ? (await db.select().from(aiRuns).where(eq(aiRuns.id, aiRunId)).limit(1))[0]
    : await createQueuedAiRun({ recordVersionId, idempotencyKey: `classify:${recordVersionId}` });
  if (!activeRun) throw new Error("AI run not found");
  if (activeRun.status === "succeeded") return activeRun;
  if (activeRun.status === "skipped_privacy") return null;

  const clearance = (await db.select().from(privacyFlags).where(and(
    eq(privacyFlags.recordVersionId, recordVersionId),
    eq(privacyFlags.status, "resolved"),
  )).limit(1))[0];
  const scan = clearance
    ? {
        status: clearance.resolution === "redacted" ? "redacted" as const : "clear" as const,
        redactedText: clearance.redactedText ?? version.qualitative,
        hits: [],
      }
    : scanPrivacy({ sourceKind: record.sourceKind, qualitative: version.qualitative, attribution: (version.attribution ?? {}) as never, policy: sourcePolicy });

  if (scan.status === "flagged") {
    await Promise.all([
      db.update(aiRuns).set({ status: "skipped_privacy", completedAt: new Date(), finishedAt: new Date(), errorMetadata: { privacyHits: scan.hits }, updatedAt: new Date() }).where(eq(aiRuns.id, activeRun.id)),
      db.update(records).set({ privacyStatus: "flagged", aiStatus: "skipped_privacy", updatedAt: new Date() }).where(eq(records.id, record.id)),
    ]);
    await audit({ action: "privacy_flag", entityType: "record_version", entityId: recordVersionId, metadata: { hits: scan.hits.map((hit) => hit.kind), aiRunId: activeRun.id } });
    return null;
  }

  const prompt = activeRun.promptVersionId
    ? (await db.select().from(promptVersions).where(eq(promptVersions.id, activeRun.promptVersionId)).limit(1))[0]
    : (await db.select().from(promptVersions).where(eq(promptVersions.status, "active")).limit(1))[0];
  if (!prompt) throw new Error("no active prompt version");
  const themes = await db.select().from(canonicalThemes).where(eq(canonicalThemes.status, "active"));
  const [structuredSelections, customEntries, fieldAnswers] = await Promise.all([
    db.select().from(recordStructuredSelections).where(eq(recordStructuredSelections.recordVersionId, recordVersionId)),
    db.select({ templateFieldId: recordCustomEntries.templateFieldId, categoryId: recordCustomEntries.categoryId, mappingStatus: recordCustomEntries.mappingStatus, mappedCanonicalOptionId: recordCustomEntries.mappedCanonicalOptionId }).from(recordCustomEntries).where(eq(recordCustomEntries.recordVersionId, recordVersionId)),
    db.select().from(recordFieldAnswers).where(eq(recordFieldAnswers.recordVersionId, recordVersionId)),
  ]);
  const inputPayload = {
    sourceKind: record.sourceKind,
    qualitative: scan.redactedText,
    attribution: version.attribution,
    quantitative: version.quantitative,
    structuredSelections,
    customEntries,
    fieldAnswers,
    reviewerInstruction: activeRun.reviewerInstruction,
  };

  const [claimed] = await db.update(aiRuns).set({
    status: "running",
    startedAt: new Date(),
    retryCount: activeRun.status === "failed" ? activeRun.retryCount + 1 : activeRun.retryCount,
    error: null,
    errorMetadata: {},
    inputHash: contentHash(inputPayload),
    inputSnapshot: inputPayload,
    updatedAt: new Date(),
  }).where(and(eq(aiRuns.id, activeRun.id), inArray(aiRuns.status, ["queued", "failed"]))).returning();
  if (!claimed) {
    const current = (await db.select().from(aiRuns).where(eq(aiRuns.id, activeRun.id)).limit(1))[0];
    if (current?.status === "succeeded") return current;
    if (current?.status === "skipped_privacy") return null;
    throw new Error("Equivalent AI classification run is already running");
  }
  activeRun = claimed;
  await db.update(records).set({ privacyStatus: scan.status, aiStatus: "running", updatedAt: new Date() }).where(eq(records.id, record.id));

  const userPrompt = JSON.stringify({
    instruction: activeRun.reviewerInstruction
      ? `Analyze this privacy-screened record. Reviewer guidance: ${activeRun.reviewerInstruction}`
      : "Analyze this privacy-screened record.",
    canonicalThemes: themes.map((theme) => ({ key: theme.key, nameEn: theme.nameEn, definition: theme.definition })),
    record: inputPayload,
  });

  let parsed: unknown;
  let raw: string;
  let tokens: { in: number; out: number } | undefined;
  let actualProvider = activeRun.provider;
  let actualModel = activeRun.model;
  let fallbackFrom: string | null = null;
  try {
    if (activeRun.provider === "openai") {
      const workflow = activeRun.workflowVersionId ? await resolveWorkflowConfiguration(activeRun.workflowVersionId) : null;
      try {
        const result = await callOpenAi(prompt.systemPrompt, userPrompt, activeRun.model);
        parsed = validateConfiguredJson(result.parsed, workflow?.outputSchema?.schema ?? { contract: "@cnpaf/shared#aiOutputSchema" });
        raw = result.raw;
        tokens = result.tokens;
      } catch (error) {
        if (!workflow?.workflowVersion || !localFallbackEnabled(workflow.workflowVersion)) throw error;
        fallbackFrom = activeRun.provider;
        actualProvider = "local_heuristic";
        actualModel = "local-v1";
        parsed = validateConfiguredJson(localAnalyze(scan.redactedText, sourcePolicy.defaultConcernOriginKey, themes), workflow.outputSchema?.schema ?? { contract: "@cnpaf/shared#aiOutputSchema" });
        raw = JSON.stringify(parsed);
      }
    } else if (activeRun.provider === "local_heuristic") {
      const local = localAnalyze(scan.redactedText, sourcePolicy.defaultConcernOriginKey, themes);
      const workflow = activeRun.workflowVersionId ? await resolveWorkflowConfiguration(activeRun.workflowVersionId) : null;
      parsed = validateConfiguredJson(local, workflow?.outputSchema?.schema ?? { contract: "@cnpaf/shared#aiOutputSchema" });
      raw = JSON.stringify(parsed);
    } else {
      throw new Error(`Unsupported AI provider handler: ${activeRun.provider}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "ai failed";
    await Promise.all([
      db.update(aiRuns).set({ status: "failed", error: message, errorMetadata: { message }, completedAt: new Date(), finishedAt: new Date(), updatedAt: new Date() }).where(eq(aiRuns.id, activeRun.id)),
      db.update(records).set({ aiStatus: "failed", updatedAt: new Date() }).where(eq(records.id, record.id)),
    ]);
    throw error;
  }

  const standardOutput = aiOutputSchema.safeParse(parsed);
  const themeByKey = new Map(themes.map((theme) => [theme.key, theme]));
  const findingRows = standardOutput.success ? [
    { aiRunId: activeRun.id, kind: "summary", statement: `${standardOutput.data.summary.zh}\n${standardOutput.data.summary.en}`, evidence: [], confidence: "1" },
    ...standardOutput.data.themes.map((theme) => ({
      aiRunId: activeRun.id,
      kind: "theme",
      statement: theme.rawLabel,
      suggestedRawLabel: theme.rawLabel,
      suggestedCanonicalThemeId: themeByKey.get(theme.suggestedCanonicalKey)?.id ?? themeByKey.get("other")?.id,
      confidence: String(theme.confidence),
      evidence: theme.evidence,
    })),
    ...standardOutput.data.concerns.map((concern) => ({
      aiRunId: activeRun.id,
      kind: "concern",
      statement: concern.statement,
      suggestedRawLabel: concern.suggestedCanonicalKey,
      suggestedCanonicalThemeId: themeByKey.get(concern.suggestedCanonicalKey)?.id ?? themeByKey.get("other")?.id,
      origin: concern.origin,
      confidence: String(concern.confidence),
      evidence: concern.evidence,
    })),
    ...standardOutput.data.safetySuspect.map((safety) => ({
      aiRunId: activeRun.id,
      kind: "safety_suspect",
      statement: safety.statement,
      safetySuspect: true,
      evidence: safety.evidence,
    })),
  ] : [];
  if (findingRows.length) {
    const inserted = await db.insert(aiFindings).values(findingRows).returning();
    const safetyRows = inserted.filter((finding) => finding.kind === "safety_suspect");
    if (safetyRows.length) {
      await db.insert(safetyFlags).values(safetyRows.map((finding) => ({
        recordId: record.id,
        recordVersionId,
        aiFindingId: finding.id,
        statement: finding.statement,
        evidence: finding.evidence,
      })));
    }
  }

  await Promise.all([
    db.update(aiRuns).set({
      status: "succeeded",
      provider: actualProvider,
      model: actualModel,
      rawOutput: raw,
      parsedOutput: parsed,
      completedAt: new Date(),
      finishedAt: new Date(),
      inputTokens: tokens?.in,
      outputTokens: tokens?.out,
      tokenUsage: { input: tokens?.in ?? null, output: tokens?.out ?? null },
      costMetadata: fallbackFrom ? { fallbackFrom } : {},
      error: null,
      updatedAt: new Date(),
    }).where(eq(aiRuns.id, activeRun.id)),
    db.update(records).set({ privacyStatus: scan.status, aiStatus: "succeeded", updatedAt: new Date() }).where(eq(records.id, record.id)),
  ]);
  await audit({ action: "ai_run", entityType: "ai_run", entityId: activeRun.id, metadata: { recordVersionId, provider: actualProvider, fallbackFrom, status: "succeeded", parentAiRunId: activeRun.parentAiRunId } });
  return (await db.select().from(aiRuns).where(eq(aiRuns.id, activeRun.id)).limit(1))[0];
}
