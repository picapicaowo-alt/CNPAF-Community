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
  configRegistries,
  configRegistryItems,
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

  // Compatibility lookups are initialization data only. Runtime business
  // behavior reads versioned config_registry_items, so mirror any baseline row
  // that was not already installed by a migration without overwriting an
  // administrator-published version.
  const [registries, configuredItems] = await Promise.all([
    db.select().from(configRegistries),
    db.select().from(configRegistryItems),
  ]);
  const registryByKey = new Map(registries.map((registry) => [registry.key, registry]));
  const configured = new Set(configuredItems.map((item) => `${item.registryId}:${item.key}`));
  for (const row of LOOKUPS) {
    const registry = registryByKey.get(row.category);
    if (!registry || configured.has(`${registry.id}:${row.key}`)) continue;
    await db.insert(configRegistryItems).values({
      registryId: registry.id,
      key: row.key,
      version: 1,
      labelEn: row.nameEn,
      labelZh: row.nameZh,
      status: "active",
      sortOrder: row.sortOrder,
      publishedAt: new Date(),
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

  const reportSectionPrompt = await ensurePrompt(4, "report_section_draft@1", "Draft only the requested report section from the approved evidence supplied in the user JSON. Never claim facts not present in the supplied sources. Return JSON with one suggestion string. The human-authored section remains authoritative.");
  const reportSectionOutputSchema = await ensureOutputSchema("report_section_draft", {
    type: "object",
    additionalProperties: false,
    required: ["suggestion"],
    properties: { suggestion: { type: "string", minLength: 1 } },
  });
  await ensureWorkflow({ key: "report_section_draft", nameEn: "Report Section Draft", nameZh: "报告段落草稿", promptId: reportSectionPrompt.id, outputSchemaId: reportSectionOutputSchema.id, humanApprovalRequired: true });

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

  const demoJson = process.env.SEED_DEMO_USERS_JSON;
  if (demoJson) {
    const demo = JSON.parse(demoJson) as {
      organizationName: string;
      password: string;
      users: Array<{ email: string; name: string; roleKey: string }>;
    };
    if (!demo.organizationName || !demo.password || demo.password.length < 12 || !Array.isArray(demo.users)) {
      throw new Error("SEED_DEMO_USERS_JSON must contain organizationName, a 12+ character password, and users");
    }
    let organization = (await db.select().from(organizations).where(eq(organizations.name, demo.organizationName)).limit(1))[0];
    if (!organization) [organization] = await db.insert(organizations).values({ name: demo.organizationName, collectionPurpose: "operational" }).returning();
    const passwordHash = await bcrypt.hash(demo.password, 12);
    const existingUsers = await db.select().from(users);
    for (const configured of demo.users) {
      const role = (await db.select().from(roles).where(eq(roles.key, configured.roleKey)).limit(1))[0];
      if (!role || role.status !== "active") throw new Error(`Unknown demo role: ${configured.roleKey}`);
      let user = existingUsers.find((candidate) => candidate.email === configured.email.toLowerCase());
      if (!user) [user] = await db.insert(users).values({ email: configured.email.toLowerCase(), name: configured.name, role: role.key, passwordHash, organizationId: organization.id, mustChangePassword: true }).returning();
      const assignment = await db.select().from(userRoleAssignments).where(and(eq(userRoleAssignments.userId, user.id), eq(userRoleAssignments.roleId, role.id), eq(userRoleAssignments.status, "active"))).limit(1);
      if (!assignment[0]) await db.insert(userRoleAssignments).values({ userId: user.id, roleId: role.id, organizationId: organization.id, status: "active" });
    }
  }

  console.log("Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
