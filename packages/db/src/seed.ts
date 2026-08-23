import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import {
  ACTIVITY_DEFINITIONS,
  CANONICAL_THEMES,
  DEFAULT_PROMPT_VERSION,
  LOOKUPS,
} from "@cnpaf/shared";
import { applyMigrations } from "./migrate";
import { getDb, readyDb } from "./index";
import {
  activityDefinitions,
  aiModelConfigs,
  aiProviderConfigs,
  aiWorkflowVersions,
  aiWorkflows,
  canonicalThemes,
  featureFlags,
  lookups,
  organizations,
  outputSchemaVersions,
  promptVersions,
  reportTemplateVersions,
  reportTemplates,
  roles,
  users,
  userRoleAssignments,
} from "./schema";

const require = createRequire(import.meta.url);
const bcrypt = require("bcryptjs") as { hash: (s: string, n: number) => Promise<string> };

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/web/.env.local") });

await applyMigrations();
await readyDb();
const db = getDb();

async function upsertLookup() {
  const existing = await db.select().from(lookups);
  const seen = new Set(existing.map((e) => `${e.category}:${e.key}`));
  for (const row of LOOKUPS) {
    if (seen.has(`${row.category}:${row.key}`)) continue;
    await db.insert(lookups).values({
      category: row.category,
      key: row.key,
      nameZh: row.nameZh,
      nameEn: row.nameEn,
      sortOrder: row.sortOrder,
    });
  }
}

async function seed() {
  await upsertLookup();

  for (const def of ACTIVITY_DEFINITIONS) {
    const found = await db.select().from(activityDefinitions);
    if (found.some((f) => f.key === def.key && f.version === def.version)) continue;
    await db.insert(activityDefinitions).values({
      key: def.key,
      version: def.version,
      status: def.status,
      nameZh: def.nameZh,
      nameEn: def.nameEn,
      fields: def.fields,
    });
  }

  for (const theme of CANONICAL_THEMES) {
    const found = await db.select().from(canonicalThemes);
    if (found.some((f) => f.key === theme.key && f.version === theme.version)) continue;
    await db.insert(canonicalThemes).values(theme);
  }

  const prompts = await db.select().from(promptVersions);
  if (!prompts.some((p) => p.version === DEFAULT_PROMPT_VERSION.version)) {
    await db.insert(promptVersions).values(DEFAULT_PROMPT_VERSION);
  }
  const activePrompt = (await db.select().from(promptVersions).where(eq(promptVersions.status, "active")).limit(1))[0]
    ?? (await db.select().from(promptVersions).where(eq(promptVersions.version, DEFAULT_PROMPT_VERSION.version)).limit(1))[0];

  let outputSchema = (await db.select().from(outputSchemaVersions).where(and(eq(outputSchemaVersions.key, "record_classification"), eq(outputSchemaVersions.version, 1))).limit(1))[0];
  if (!outputSchema) {
    [outputSchema] = await db.insert(outputSchemaVersions).values({
      key: "record_classification",
      version: 1,
      status: "published",
      schema: { type: "object", contract: "@cnpaf/shared#aiOutputSchema", version: DEFAULT_PROMPT_VERSION.outputSchemaVersion },
    }).returning();
  }
  let provider = (await db.select().from(aiProviderConfigs).where(eq(aiProviderConfigs.key, "local_heuristic")).limit(1))[0];
  if (!provider) {
    [provider] = await db.insert(aiProviderConfigs).values({ key: "local_heuristic", displayName: "Local deterministic fallback", configuration: { externalDataTransfer: false } }).returning();
  }
  let model = (await db.select().from(aiModelConfigs).where(and(eq(aiModelConfigs.providerConfigId, provider.id), eq(aiModelConfigs.key, "local-v1"))).limit(1))[0];
  if (!model) {
    [model] = await db.insert(aiModelConfigs).values({ providerConfigId: provider.id, key: "local-v1", modelName: "local-v1", configuration: { deterministic: true } }).returning();
  }
  let openAiProvider = (await db.select().from(aiProviderConfigs).where(eq(aiProviderConfigs.key, "openai")).limit(1))[0];
  if (!openAiProvider) {
    [openAiProvider] = await db.insert(aiProviderConfigs).values({ key: "openai", displayName: "OpenAI", configuration: { secretEnvironmentVariable: "OPENAI_API_KEY" } }).returning();
  }
  const openAiModel = (await db.select().from(aiModelConfigs).where(and(eq(aiModelConfigs.providerConfigId, openAiProvider.id), eq(aiModelConfigs.key, "gpt-4o-mini"))).limit(1))[0];
  if (!openAiModel) {
    await db.insert(aiModelConfigs).values({ providerConfigId: openAiProvider.id, key: "gpt-4o-mini", modelName: "gpt-4o-mini", configuration: { responseFormat: "json_object" } });
  }
  let workflow = (await db.select().from(aiWorkflows).where(eq(aiWorkflows.key, "record_classification")).limit(1))[0];
  if (!workflow) {
    [workflow] = await db.insert(aiWorkflows).values({ key: "record_classification", nameEn: "Record Classification", nameZh: "记录分类", workflowTypeKey: "record_classification", status: "active" }).returning();
  }
  let workflowVersion = (await db.select().from(aiWorkflowVersions).where(and(eq(aiWorkflowVersions.workflowId, workflow.id), eq(aiWorkflowVersions.version, 1))).limit(1))[0];
  if (!workflowVersion) {
    [workflowVersion] = await db.insert(aiWorkflowVersions).values({
      workflowId: workflow.id,
      version: 1,
      status: "published",
      promptVersionId: activePrompt?.id,
      outputSchemaVersionId: outputSchema.id,
      providerConfigId: provider.id,
      modelConfigId: model.id,
      permittedInputs: { dataClassifications: ["privacy_cleared_record"] },
      privacyRequirements: { requirePrivacyClearance: true },
      humanApprovalRequired: true,
      publishedAt: new Date(),
    }).returning();
    await db.update(aiWorkflows).set({ currentPublishedVersionId: workflowVersion.id }).where(eq(aiWorkflows.id, workflow.id));
  }

  const ensurePrompt = async (version: number, outputSchemaVersion: string, systemPrompt: string) => {
    let prompt = (await db.select().from(promptVersions).where(eq(promptVersions.version, version)).limit(1))[0];
    if (!prompt) {
      [prompt] = await db.insert(promptVersions).values({ version, status: "active", outputSchemaVersion, systemPrompt }).returning();
    }
    return prompt;
  };
  const ensureOutputSchema = async (key: string, schema: Record<string, unknown>) => {
    let configured = (await db.select().from(outputSchemaVersions).where(and(eq(outputSchemaVersions.key, key), eq(outputSchemaVersions.version, 1))).limit(1))[0];
    if (!configured) {
      [configured] = await db.insert(outputSchemaVersions).values({ key, version: 1, status: "published", schema }).returning();
    }
    return configured;
  };
  const ensureWorkflow = async (input: {
    key: string;
    nameEn: string;
    nameZh: string;
    promptId: string;
    outputSchemaId: string;
    humanApprovalRequired: boolean;
  }) => {
    let configuredWorkflow = (await db.select().from(aiWorkflows).where(eq(aiWorkflows.key, input.key)).limit(1))[0];
    if (!configuredWorkflow) {
      [configuredWorkflow] = await db.insert(aiWorkflows).values({ key: input.key, nameEn: input.nameEn, nameZh: input.nameZh, workflowTypeKey: input.key, status: "active" }).returning();
    }
    let configuredVersion = (await db.select().from(aiWorkflowVersions).where(and(eq(aiWorkflowVersions.workflowId, configuredWorkflow.id), eq(aiWorkflowVersions.version, 1))).limit(1))[0];
    if (!configuredVersion) {
      [configuredVersion] = await db.insert(aiWorkflowVersions).values({
        workflowId: configuredWorkflow.id,
        version: 1,
        status: "published",
        promptVersionId: input.promptId,
        outputSchemaVersionId: input.outputSchemaId,
        providerConfigId: provider.id,
        modelConfigId: model.id,
        permittedInputs: { dataClassifications: ["approved_evidence"] },
        privacyRequirements: { approvedEvidenceOnly: true, excludeRestrictedResearchUse: true },
        humanApprovalRequired: input.humanApprovalRequired,
        publishedAt: new Date(),
      }).returning();
    }
    if (configuredWorkflow.currentPublishedVersionId !== configuredVersion.id) {
      await db.update(aiWorkflows).set({ currentPublishedVersionId: configuredVersion.id, updatedAt: new Date() }).where(eq(aiWorkflows.id, configuredWorkflow.id));
    }
  };

  const reportPrompt = await ensurePrompt(2, "report_generation@1", "Generate an evidence-grounded report from only the approved evidence supplied in the user JSON. Preserve counts by origin, cite only supplied evidence UUIDs, and return JSON matching the configured schema.");
  const reportOutputSchema = await ensureOutputSchema("report_generation", {
    type: "object",
    additionalProperties: false,
    required: ["title", "executiveSummary", "sections", "citations"],
    properties: {
      title: { type: "string", minLength: 1 },
      executiveSummary: { type: "string", minLength: 1 },
      sections: { type: "array", items: { type: "object", additionalProperties: false, required: ["key", "title", "body"], properties: { key: { type: "string" }, title: { type: "string" }, body: { type: "string" } } } },
      citations: { type: "array", items: { type: "string" } },
    },
  });
  await ensureWorkflow({ key: "report_generation", nameEn: "Evidence Report Generation", nameZh: "证据报告生成", promptId: reportPrompt.id, outputSchemaId: reportOutputSchema.id, humanApprovalRequired: true });

  const askPrompt = await ensurePrompt(3, "ask_collect@1", "Answer the question using only the approvedSources supplied in the user JSON. Every substantive claim must cite a supplied source UUID. Never invent or retrieve other evidence. Return JSON matching the configured schema.");
  const askOutputSchema = await ensureOutputSchema("ask_collect", {
    type: "object",
    additionalProperties: false,
    required: ["answer", "citations"],
    properties: {
      answer: { type: "string", minLength: 1 },
      citations: { type: "array", items: { type: "object", additionalProperties: false, required: ["sourceId", "claim"], properties: { sourceId: { type: "string" }, claim: { type: "string", minLength: 1 } } } },
    },
  });
  await ensureWorkflow({ key: "ask_collect", nameEn: "Ask Collect", nameZh: "Ask Collect 问答", promptId: askPrompt.id, outputSchemaId: askOutputSchema.id, humanApprovalRequired: false });

  let reportTemplate = (await db.select().from(reportTemplates).where(eq(reportTemplates.key, "evidence_summary")).limit(1))[0];
  if (!reportTemplate) {
    [reportTemplate] = await db.insert(reportTemplates).values({ key: "evidence_summary", nameEn: "Evidence Summary", nameZh: "证据摘要", reportTypeKey: "evidence_summary", status: "active" }).returning();
  }
  let reportVersion = (await db.select().from(reportTemplateVersions).where(and(eq(reportTemplateVersions.reportTemplateId, reportTemplate.id), eq(reportTemplateVersions.version, 1))).limit(1))[0];
  if (!reportVersion) {
    [reportVersion] = await db.insert(reportTemplateVersions).values({
      reportTemplateId: reportTemplate.id,
      version: 1,
      status: "published",
      sections: ["executive_summary", "metrics_by_origin", "approved_findings", "evidence_index"],
      configuration: { approvedOnly: true, preserveOriginCounts: true },
      publishedAt: new Date(),
    }).returning();
    await db.update(reportTemplates).set({ currentPublishedVersionId: reportVersion.id }).where(eq(reportTemplates.id, reportTemplate.id));
  }

  const flags = [
    { key: "scheduled_visits", enabled: false, description: "ScheduledVisit attendance (v2)" },
    { key: "winston_export", enabled: false, description: "Winston Lab research export" },
    { key: "native_shell", enabled: false, description: "Capacitor/App Store wrapper" },
  ];
  const existingFlags = await db.select().from(featureFlags);
  for (const flag of flags) {
    if (existingFlags.some((f) => f.key === flag.key)) continue;
    await db.insert(featureFlags).values(flag);
  }

  const [org] =
    (await db.select().from(organizations).where(eq(organizations.name, "CNPAF"))) ?? [];
  const organization =
    org ??
    (
      await db
        .insert(organizations)
        .values({ name: "CNPAF", collectionPurpose: "operational" })
        .returning()
    )[0];

  const password = process.env.SEED_PASSWORD ?? "cnpaf-dev-change-me";
  const passwordHash = await bcrypt.hash(password, 10);
  const seedUsers = [
    { email: "admin@cnpaf.local", name: "Admin", role: "admin" },
    { email: "ops@cnpaf.local", name: "Coordinator", role: "coordinator" },
    { email: "volunteer@cnpaf.local", name: "Volunteer", role: "volunteer" },
  ];
  const existingUsers = await db.select().from(users);
  for (const u of seedUsers) {
    let user = existingUsers.find((e) => e.email === u.email);
    if (!user) {
      [user] = await db.insert(users).values({
        ...u,
        passwordHash,
        organizationId: organization.id,
      }).returning();
    }
    const roleKey = u.role === "coordinator" ? "operations_reviewer" : u.role;
    const role = (await db.select().from(roles).where(eq(roles.key, roleKey)).limit(1))[0];
    if (user && role) {
      const assignment = await db.select().from(userRoleAssignments).where(
        and(
          eq(userRoleAssignments.userId, user.id),
          eq(userRoleAssignments.roleId, role.id),
          eq(userRoleAssignments.status, "active"),
        ),
      ).limit(1);
      if (!assignment[0]) {
        await db.insert(userRoleAssignments).values({
          userId: user.id,
          roleId: role.id,
          organizationId: organization.id,
          status: "active",
        });
      }
    }
  }

  console.log("Seed complete. Demo password:", password);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
