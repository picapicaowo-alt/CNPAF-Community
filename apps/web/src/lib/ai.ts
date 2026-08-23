import { and, eq } from "drizzle-orm";
import {
  aiFindings,
  aiRuns,
  canonicalThemes,
  promptVersions,
  records,
  recordVersions,
  safetyFlags,
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

const SAFETY_HINT =
  /不给他吃饭|虐待|打人|受伤|abuse|starv|neglect|hit him|hit her|not feeding/i;

function offsets(haystack: string, needle: string): { text: string; start: number; end: number } {
  const start = haystack.indexOf(needle);
  if (start < 0) {
    return { text: needle.slice(0, 180), start: 0, end: Math.min(needle.length, haystack.length) };
  }
  return { text: needle, start, end: start + needle.length };
}

function localAnalyze(text: string, sourceKind: string): AiOutput {
  const sentences = text
    .split(/[。.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8)
    .slice(0, 6);

  const origin: ConcernOrigin =
    sourceKind === "professor_interview"
      ? "expert_interview"
      : sourceKind === "literature"
        ? "literature"
        : /说|反馈|asked|said|told/i.test(text)
          ? "participant_feedback"
          : "field_observation";

  const themeKey = /孤独|lonely|isolat|社交/i.test(text)
    ? "social_connection"
    : /活动|engagement|参与/i.test(text)
      ? "engagement"
      : "other";

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

async function callOpenAi(system: string, user: string): Promise<{ raw: string; parsed: AiOutput; tokens?: { in: number; out: number } }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("NO_KEY");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL ?? "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
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
  const parsed = aiOutputSchema.parse(JSON.parse(raw));
  return {
    raw,
    parsed,
    tokens: body.usage
      ? { in: body.usage.prompt_tokens, out: body.usage.completion_tokens }
      : undefined,
  };
}

export async function runAnalysisJob(recordVersionId: string) {
  const versionRows = await db
    .select()
    .from(recordVersions)
    .where(eq(recordVersions.id, recordVersionId))
    .limit(1);
  const version = versionRows[0];
  if (!version) throw new Error("version not found");

  const recordRows = await db.select().from(records).where(eq(records.id, version.recordId)).limit(1);
  const record = recordRows[0];
  if (!record) throw new Error("record not found");

  const existingSuccess = await db
    .select()
    .from(aiRuns)
    .where(and(eq(aiRuns.recordVersionId, recordVersionId), eq(aiRuns.status, "succeeded")))
    .limit(1);
  if (existingSuccess[0]) return existingSuccess[0];

  const scan = scanPrivacy({
    sourceKind: record.sourceKind,
    qualitative: version.qualitative,
    attribution: (version.attribution ?? {}) as never,
  });

  if (scan.status === "flagged") {
    await db
      .update(records)
      .set({ privacyStatus: "flagged", aiStatus: "skipped_privacy", updatedAt: new Date() })
      .where(eq(records.id, record.id));
    await audit({
      action: "privacy_flag",
      entityType: "record_version",
      entityId: recordVersionId,
      metadata: { hits: scan.hits.map((h) => h.kind) },
    });
    return null;
  }

  const prompt = (
    await db.select().from(promptVersions).where(eq(promptVersions.status, "active")).limit(1)
  )[0];
  if (!prompt) throw new Error("no active prompt version");

  const themes = await db.select().from(canonicalThemes).where(eq(canonicalThemes.status, "active"));
  const inputPayload = {
    sourceKind: record.sourceKind,
    qualitative: scan.redactedText,
    attribution: version.attribution,
    quantitative: version.quantitative,
  };
  const hash = contentHash(inputPayload);

  const [run] = await db
    .insert(aiRuns)
    .values({
      recordVersionId,
      promptVersionId: prompt.id,
      provider: process.env.OPENAI_API_KEY ? "openai" : "local_heuristic",
      model: process.env.OPENAI_API_KEY ? (process.env.AI_MODEL ?? "gpt-4o-mini") : "local-v1",
      promptVersion: prompt.version,
      outputSchemaVersion: prompt.outputSchemaVersion ?? AI_OUTPUT_SCHEMA_VERSION,
      inputHash: hash,
      status: "running",
      startedAt: new Date(),
    })
    .onConflictDoNothing({ target: aiRuns.recordVersionId })
    .returning();

  const activeRun =
    run ??
    (await db.select().from(aiRuns).where(eq(aiRuns.recordVersionId, recordVersionId)).limit(1))[0];

  if (activeRun.status === "succeeded") return activeRun;

  await db
    .update(aiRuns)
    .set({ status: "running", startedAt: new Date(), error: null, updatedAt: new Date() })
    .where(eq(aiRuns.id, activeRun.id));
  await db
    .update(records)
    .set({
      privacyStatus: scan.status,
      aiStatus: "running",
      updatedAt: new Date(),
    })
    .where(eq(records.id, record.id));

  const userPrompt = JSON.stringify({
    instruction: "Analyze this privacy-screened record.",
    canonicalThemes: themes.map((t) => ({ key: t.key, nameEn: t.nameEn, definition: t.definition })),
    record: inputPayload,
  });

  let parsed: AiOutput;
  let raw: string;
  let tokens: { in: number; out: number } | undefined;
  try {
    if (process.env.OPENAI_API_KEY) {
      const result = await callOpenAi(prompt.systemPrompt, userPrompt);
      parsed = result.parsed;
      raw = result.raw;
      tokens = result.tokens;
    } else {
      parsed = localAnalyze(scan.redactedText, record.sourceKind);
      raw = JSON.stringify(parsed);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "ai failed";
    await db
      .update(aiRuns)
      .set({ status: "failed", error: message, completedAt: new Date(), updatedAt: new Date() })
      .where(eq(aiRuns.id, activeRun.id));
    await db
      .update(records)
      .set({ aiStatus: "failed", updatedAt: new Date() })
      .where(eq(records.id, record.id));
    throw err;
  }

  await db.delete(aiFindings).where(eq(aiFindings.aiRunId, activeRun.id));

  const themeByKey = new Map(themes.map((t) => [t.key, t]));
  const findingRows = [];

  findingRows.push({
    aiRunId: activeRun.id,
    kind: "summary",
    statement: `${parsed.summary.zh}\n${parsed.summary.en}`,
    evidence: [],
    confidence: "1",
  });

  for (const theme of parsed.themes) {
    findingRows.push({
      aiRunId: activeRun.id,
      kind: "theme",
      statement: theme.rawLabel,
      suggestedRawLabel: theme.rawLabel,
      suggestedCanonicalThemeId: themeByKey.get(theme.suggestedCanonicalKey)?.id ?? themeByKey.get("other")?.id,
      confidence: String(theme.confidence),
      evidence: theme.evidence,
    });
  }
  for (const concern of parsed.concerns) {
    findingRows.push({
      aiRunId: activeRun.id,
      kind: "concern",
      statement: concern.statement,
      suggestedRawLabel: concern.suggestedCanonicalKey,
      suggestedCanonicalThemeId:
        themeByKey.get(concern.suggestedCanonicalKey)?.id ?? themeByKey.get("other")?.id,
      origin: concern.origin,
      confidence: String(concern.confidence),
      evidence: concern.evidence,
    });
  }
  for (const safety of parsed.safetySuspect) {
    findingRows.push({
      aiRunId: activeRun.id,
      kind: "safety_suspect",
      statement: safety.statement,
      safetySuspect: true,
      evidence: safety.evidence,
    });
  }

  if (findingRows.length) {
    const inserted = await db.insert(aiFindings).values(findingRows).returning();
    for (const finding of inserted.filter((f) => f.kind === "safety_suspect")) {
      await db.insert(safetyFlags).values({
        recordId: record.id,
        recordVersionId,
        aiFindingId: finding.id,
        statement: finding.statement,
        evidence: finding.evidence,
      });
    }
  }

  await db
    .update(aiRuns)
    .set({
      status: "succeeded",
      rawOutput: raw,
      parsedOutput: parsed,
      completedAt: new Date(),
      inputTokens: tokens?.in,
      outputTokens: tokens?.out,
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(aiRuns.id, activeRun.id));

  await db
    .update(records)
    .set({
      privacyStatus: scan.status,
      aiStatus: "succeeded",
      updatedAt: new Date(),
    })
    .where(eq(records.id, record.id));

  await audit({
    action: "ai_run",
    entityType: "record_version",
    entityId: recordVersionId,
    metadata: { provider: activeRun.provider, status: "succeeded" },
  });

  return activeRun;
}
