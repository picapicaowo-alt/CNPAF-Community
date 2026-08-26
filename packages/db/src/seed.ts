import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import {
  ACTIVITY_DEFINITIONS,
  AI_OUTPUT_JSON_SCHEMA,
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
  personGroupMemberships,
  personGroups,
  promptVersions,
  reportTemplateVersions,
  reportTemplates,
  roles,
  users,
  userAffiliations,
  userRoleAssignments,
} from "./schema";
import { seedRuntimeConfig } from "./runtime-config";

const require = createRequire(import.meta.url);
const bcrypt = require("bcryptjs") as { hash: (s: string, n: number) => Promise<string> };

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/web/.env.local") });

await applyMigrations();
await readyDb();
const db = getDb();
const seedConfig = seedRuntimeConfig();

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

  let outputSchema = (await db.select().from(outputSchemaVersions).where(and(eq(outputSchemaVersions.key, "record_classification"), eq(outputSchemaVersions.version, 2))).limit(1))[0];
  if (!outputSchema) {
    [outputSchema] = await db.insert(outputSchemaVersions).values({
      key: "record_classification",
      version: 2,
      status: "published",
      schema: AI_OUTPUT_JSON_SCHEMA,
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
  const configuredProvider = seedConfig.aiProvider;
  const publishOpenAi = configuredProvider === "openai"
    || (!configuredProvider && seedConfig.openAiApiKeyConfigured);
  if (publishOpenAi && !seedConfig.openAiApiKeyConfigured) {
    throw new Error("OPENAI_API_KEY is required when AI_PROVIDER=openai");
  }
  const openAiModelName = seedConfig.aiModel;
  let openAiModel = (await db.select().from(aiModelConfigs).where(and(eq(aiModelConfigs.providerConfigId, openAiProvider.id), eq(aiModelConfigs.key, openAiModelName))).limit(1))[0];
  if (!openAiModel) {
    [openAiModel] = await db.insert(aiModelConfigs).values({ providerConfigId: openAiProvider.id, key: openAiModelName, modelName: openAiModelName, configuration: { api: "responses", responseFormat: "json_object" } }).returning();
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

  const desiredProvider = publishOpenAi ? openAiProvider : provider;
  const desiredModel = publishOpenAi ? openAiModel : model;
  const publishConfiguredProviderVersion = async (workflowKey: string) => {
    const configuredWorkflow = (await db.select().from(aiWorkflows).where(eq(aiWorkflows.key, workflowKey)).limit(1))[0];
    if (!configuredWorkflow) throw new Error(`AI workflow not found while publishing provider configuration: ${workflowKey}`);
    const versions = await db.select().from(aiWorkflowVersions).where(eq(aiWorkflowVersions.workflowId, configuredWorkflow.id));
    const current = versions.find((version) => version.id === configuredWorkflow.currentPublishedVersionId)
      ?? versions.filter((version) => version.status === "published").sort((left, right) => right.version - left.version)[0];
    if (!current) throw new Error(`Published AI workflow version not found: ${workflowKey}`);
    const desiredOutputSchemaId = workflowKey === "record_classification"
      ? outputSchema.id
      : current.outputSchemaVersionId;
    if (
      current.providerConfigId === desiredProvider.id
      && current.modelConfigId === desiredModel.id
      && current.outputSchemaVersionId === desiredOutputSchemaId
    ) {
      if (configuredWorkflow.currentPublishedVersionId !== current.id) {
        await db.update(aiWorkflows).set({ currentPublishedVersionId: current.id, updatedAt: new Date() }).where(eq(aiWorkflows.id, configuredWorkflow.id));
      }
      return;
    }
    const [published] = await db.insert(aiWorkflowVersions).values({
      workflowId: configuredWorkflow.id,
      version: Math.max(...versions.map((version) => version.version), 0) + 1,
      status: "published",
      promptVersionId: current.promptVersionId,
      outputSchemaVersionId: desiredOutputSchemaId,
      providerConfigId: desiredProvider.id,
      modelConfigId: desiredModel.id,
      triggerRules: current.triggerRules,
      permittedInputs: current.permittedInputs,
      privacyRequirements: current.privacyRequirements,
      retryPolicy: current.retryPolicy,
      costCeiling: current.costCeiling,
      humanApprovalRequired: current.humanApprovalRequired,
      featureFlags: {},
      publishedAt: new Date(),
    }).returning();
    await db.update(aiWorkflows).set({ currentPublishedVersionId: published.id, updatedAt: new Date() }).where(eq(aiWorkflows.id, configuredWorkflow.id));
  };
  for (const workflowKey of ["record_classification", "report_generation", "ask_collect", "report_section_draft"]) {
    await publishConfiguredProviderVersion(workflowKey);
  }

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

  const demoJson = seedConfig.demoUsersJson;
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

  const testAccountPassword = seedConfig.password;
  if (testAccountPassword) {
    if (testAccountPassword.length < 12) {
      throw new Error("SEED_PASSWORD must be at least 12 characters");
    }
    let organization = (
      await db
        .select()
        .from(organizations)
        .where(eq(organizations.name, "CNPAF"))
        .limit(1)
    )[0];
    if (!organization) {
      [organization] = await db
        .insert(organizations)
        .values({ name: "CNPAF", collectionPurpose: "operational" })
        .returning();
    }
    const passwordHash = await bcrypt.hash(testAccountPassword, 12);
    const roleAccountSeeds = [
      {
        email: "admin@cnpaf.local",
        name: "CNPAF Administrator",
        roleKey: "admin",
        locale: "zh",
      },
      {
        email: "ops@cnpaf.local",
        name: "CNPAF Operations Reviewer",
        roleKey: "operations_reviewer",
        locale: "zh",
      },
      {
        email: "research@cnpaf.local",
        name: "CNPAF Research Lead",
        roleKey: "research_lead",
        locale: "zh",
      },
      {
        email: "stakeholder@cnpaf.local",
        name: "Approved Data Stakeholder",
        roleKey: "winston_research",
        locale: "en",
      },
      {
        email: "volunteer@cnpaf.local",
        name: "General Volunteer",
        roleKey: "volunteer",
        locale: "zh",
      },
    ] as const;
    const roleAccountByEmail = new Map<string, typeof users.$inferSelect>();
    for (const configured of roleAccountSeeds) {
      const role = (
        await db
          .select()
          .from(roles)
          .where(eq(roles.key, configured.roleKey))
          .limit(1)
      )[0];
      if (!role || role.status !== "active") {
        throw new Error(`Required demo role is not active: ${configured.roleKey}`);
      }
      let user = (
        await db
          .select()
          .from(users)
          .where(eq(users.email, configured.email))
          .limit(1)
      )[0];
      const accountValues = {
        name: configured.name,
        passwordHash,
        role: role.key,
        organizationId: organization.id,
        locale: configured.locale,
        status: "active",
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        updatedAt: new Date(),
      } as const;
      if (user) {
        [user] = await db
          .update(users)
          .set(accountValues)
          .where(eq(users.id, user.id))
          .returning();
      } else {
        [user] = await db
          .insert(users)
          .values({ email: configured.email, ...accountValues })
          .returning();
      }
      roleAccountByEmail.set(configured.email, user);
      const assignment = (
        await db
          .select()
          .from(userRoleAssignments)
          .where(
            and(
              eq(userRoleAssignments.userId, user.id),
              eq(userRoleAssignments.roleId, role.id),
              eq(userRoleAssignments.status, "active"),
            ),
          )
          .limit(1)
      )[0];
      if (!assignment) {
        await db.insert(userRoleAssignments).values({
          userId: user.id,
          roleId: role.id,
          organizationId: organization.id,
          status: "active",
          assignedById: roleAccountByEmail.get("admin@cnpaf.local")?.id,
        });
      }
    }
    const volunteerRole = (
      await db.select().from(roles).where(eq(roles.key, "volunteer")).limit(1)
    )[0];
    if (!volunteerRole) throw new Error("Volunteer role is required for USC test accounts");
    const creator = roleAccountByEmail.get("admin@cnpaf.local");
    const uscPeople = [
      {
        email: "usc.gerontology.alex@cnpaf.local",
        name: "Alex Chen",
        department: "USC Leonard Davis School of Gerontology",
      },
      {
        email: "usc.gerontology.maya@cnpaf.local",
        name: "Maya Rodriguez",
        department: "USC Leonard Davis School of Gerontology",
      },
      {
        email: "usc.socialwork.jordan@cnpaf.local",
        name: "Jordan Lee",
        department: "USC Suzanne Dworak-Peck School of Social Work",
      },
      {
        email: "usc.publicpolicy.priya@cnpaf.local",
        name: "Priya Patel",
        department: "USC Sol Price School of Public Policy",
      },
      {
        email: "usc.engineering.ethan@cnpaf.local",
        name: "Ethan Kim",
        department: "USC Viterbi School of Engineering",
      },
      {
        email: "usc.medicine.sofia@cnpaf.local",
        name: "Sofia Nguyen",
        department: "USC Keck School of Medicine",
      },
      {
        email: "usc.dornsife.noah@cnpaf.local",
        name: "Noah Williams",
        department: "USC Dornsife College of Letters, Arts and Sciences",
      },
    ] as const;
    const userByEmail = new Map<string, typeof users.$inferSelect>();
    for (const configured of uscPeople) {
      let user = (
        await db
          .select()
          .from(users)
          .where(eq(users.email, configured.email))
          .limit(1)
      )[0];
      if (user) {
        [user] = await db
          .update(users)
          .set({
            name: configured.name,
            passwordHash,
            role: volunteerRole.key,
            organizationId: organization.id,
            status: "active",
            mustChangePassword: false,
            passwordChangedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id))
          .returning();
      } else {
        [user] = await db
          .insert(users)
          .values({
            email: configured.email,
            name: configured.name,
            passwordHash,
            role: volunteerRole.key,
            organizationId: organization.id,
            locale: "en",
            mustChangePassword: false,
            passwordChangedAt: new Date(),
          })
          .returning();
      }
      userByEmail.set(configured.email, user);
      const assignment = (
        await db
          .select()
          .from(userRoleAssignments)
          .where(
            and(
              eq(userRoleAssignments.userId, user.id),
              eq(userRoleAssignments.roleId, volunteerRole.id),
              eq(userRoleAssignments.status, "active"),
            ),
          )
          .limit(1)
      )[0];
      if (!assignment) {
        await db.insert(userRoleAssignments).values({
          userId: user.id,
          roleId: volunteerRole.id,
          organizationId: organization.id,
          status: "active",
          assignedById: creator?.id,
        });
      }
      const affiliation = (
        await db
          .select()
          .from(userAffiliations)
          .where(
            and(
              eq(userAffiliations.userId, user.id),
              eq(userAffiliations.institutionName, "University of Southern California"),
              eq(userAffiliations.departmentName, configured.department),
            ),
          )
          .limit(1)
      )[0];
      if (affiliation) {
        await db
          .update(userAffiliations)
          .set({
            affiliationTypeKey: "student",
            title: "Student",
            status: "active",
            isPrimary: true,
            endsAt: null,
            updatedAt: new Date(),
          })
          .where(eq(userAffiliations.id, affiliation.id));
      } else {
        await db.insert(userAffiliations).values({
          userId: user.id,
          organizationId: organization.id,
          affiliationTypeKey: "student",
          institutionName: "University of Southern California",
          institutionTypeKey: "university",
          departmentName: configured.department,
          title: "Student",
          metadata: { testAccount: true },
          isPrimary: true,
          createdById: creator?.id,
        });
      }
    }

    const groupSeeds = [
      {
        key: "usc-gerontology-students",
        nameEn: "USC Gerontology Students",
        nameZh: "USC 老年学学生组",
        descriptionEn: "Students from the USC Leonard Davis School of Gerontology.",
        descriptionZh: "USC Leonard Davis 老年学学院学生。",
        emails: [
          "usc.gerontology.alex@cnpaf.local",
          "usc.gerontology.maya@cnpaf.local",
        ],
      },
      {
        key: "usc-interdisciplinary-community-team",
        nameEn: "USC Interdisciplinary Community Team",
        nameZh: "USC 跨学院社区小组",
        descriptionEn: "A mixed team across gerontology, social work, public policy, and engineering.",
        descriptionZh: "来自老年学、社会工作、公共政策与工程学院的跨学科小组。",
        emails: [
          "usc.gerontology.maya@cnpaf.local",
          "usc.socialwork.jordan@cnpaf.local",
          "usc.publicpolicy.priya@cnpaf.local",
          "usc.engineering.ethan@cnpaf.local",
        ],
      },
      {
        key: "usc-health-and-aging-team",
        nameEn: "USC Health and Aging Team",
        nameZh: "USC 健康与老龄化小组",
        descriptionEn: "A cross-school team focused on health and aging.",
        descriptionZh: "聚焦健康与老龄化的跨学院小组。",
        emails: [
          "usc.gerontology.alex@cnpaf.local",
          "usc.medicine.sofia@cnpaf.local",
          "usc.dornsife.noah@cnpaf.local",
        ],
      },
    ] as const;
    for (const configured of groupSeeds) {
      let group = (
        await db
          .select()
          .from(personGroups)
          .where(
            and(
              eq(personGroups.organizationId, organization.id),
              eq(personGroups.key, configured.key),
            ),
          )
          .limit(1)
      )[0];
      if (group) {
        [group] = await db
          .update(personGroups)
          .set({
            nameEn: configured.nameEn,
            nameZh: configured.nameZh,
            descriptionEn: configured.descriptionEn,
            descriptionZh: configured.descriptionZh,
            status: "active",
            updatedAt: new Date(),
          })
          .where(eq(personGroups.id, group.id))
          .returning();
      } else {
        [group] = await db
          .insert(personGroups)
          .values({
            organizationId: organization.id,
            key: configured.key,
            nameEn: configured.nameEn,
            nameZh: configured.nameZh,
            descriptionEn: configured.descriptionEn,
            descriptionZh: configured.descriptionZh,
            createdById: creator?.id,
          })
          .returning();
      }
      await db
        .update(personGroupMemberships)
        .set({ status: "inactive", updatedAt: new Date() })
        .where(eq(personGroupMemberships.groupId, group.id));
      const memberIds = configured.emails.map((email) => userByEmail.get(email)!.id);
      await db
        .insert(personGroupMemberships)
        .values(
          memberIds.map((userId) => ({
            groupId: group.id,
            userId,
            status: "active",
            addedById: creator?.id,
          })),
        )
        .onConflictDoUpdate({
          target: [personGroupMemberships.groupId, personGroupMemberships.userId],
          set: { status: "active", addedById: creator?.id, updatedAt: new Date() },
        });
    }
  }

  console.log("Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
