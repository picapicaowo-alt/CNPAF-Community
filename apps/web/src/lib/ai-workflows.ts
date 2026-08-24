import { asc, desc, eq, max } from "drizzle-orm";
import {
  aiWorkflowVersions,
  aiWorkflows,
  aiModelConfigs,
  aiProviderConfigs,
  outputSchemaVersions,
  promptVersions,
} from "@cnpaf/db/schema";
import type { z } from "zod";
import type {
  aiWorkflowBodySchema,
  aiWorkflowVersionBodySchema,
  aiWorkflowVersionUpdateBodySchema,
  promptVersionBodySchema,
} from "@cnpaf/shared";
import { audit } from "./audit";
import { db } from "./db";

export async function listAiWorkflows() {
  const [workflows, versions] = await Promise.all([
    db.select().from(aiWorkflows).orderBy(asc(aiWorkflows.nameEn)),
    db.select().from(aiWorkflowVersions).orderBy(desc(aiWorkflowVersions.version)),
  ]);
  return workflows.map((workflow) => ({ workflow, versions: versions.filter((version) => version.workflowId === workflow.id) }));
}

export async function createAiWorkflow(input: z.infer<typeof aiWorkflowBodySchema>, actorId: string) {
  const [workflow] = await db.insert(aiWorkflows).values({ ...input, createdById: actorId }).returning();
  await audit({ actorId, action: "ai_workflow.created", entityType: "ai_workflow", entityId: workflow.id, afterState: workflow });
  return workflow;
}

export async function createAiWorkflowVersion(workflowId: string, input: z.infer<typeof aiWorkflowVersionBodySchema>, actorId: string) {
  const latest = (await db.select({ version: max(aiWorkflowVersions.version) }).from(aiWorkflowVersions).where(eq(aiWorkflowVersions.workflowId, workflowId)))[0];
  const [version] = await db.insert(aiWorkflowVersions).values({
    workflowId,
    version: (latest?.version ?? 0) + 1,
    ...input,
    costCeiling: input.costCeiling == null ? null : String(input.costCeiling),
    createdById: actorId,
  }).returning();
  await audit({ actorId, action: "ai_workflow_version.created", entityType: "ai_workflow_version", entityId: version.id, afterState: version });
  return version;
}

export async function updateAiWorkflowVersion(id: string, input: z.infer<typeof aiWorkflowVersionUpdateBodySchema>, actorId: string) {
  const existing = (await db.select().from(aiWorkflowVersions).where(eq(aiWorkflowVersions.id, id)).limit(1))[0];
  if (!existing) throw new Error("AI workflow version not found");
  if (existing.status !== "draft") throw new Error("Published AI workflow versions are immutable");
  const [version] = await db.update(aiWorkflowVersions).set({
    ...input,
    costCeiling: input.costCeiling === undefined ? undefined : input.costCeiling == null ? null : String(input.costCeiling),
    updatedAt: new Date(),
  }).where(eq(aiWorkflowVersions.id, id)).returning();
  await audit({ actorId, action: "ai_workflow_version.updated", entityType: "ai_workflow_version", entityId: id, beforeState: existing, afterState: version });
  return version;
}

export async function publishAiWorkflowVersion(id: string, actorId: string) {
  const result = await db.transaction(async (tx) => {
    const existing = (await tx.select().from(aiWorkflowVersions).where(eq(aiWorkflowVersions.id, id)).limit(1))[0];
    if (!existing) throw new Error("AI workflow version not found");
    if (existing.status !== "draft") throw new Error("Only draft workflow versions can be published");
    const [prompt, outputSchema, provider, model] = await Promise.all([
      existing.promptVersionId ? tx.select().from(promptVersions).where(eq(promptVersions.id, existing.promptVersionId)).limit(1).then((rows) => rows[0]) : Promise.resolve(null),
      existing.outputSchemaVersionId ? tx.select().from(outputSchemaVersions).where(eq(outputSchemaVersions.id, existing.outputSchemaVersionId)).limit(1).then((rows) => rows[0]) : Promise.resolve(null),
      existing.providerConfigId ? tx.select().from(aiProviderConfigs).where(eq(aiProviderConfigs.id, existing.providerConfigId)).limit(1).then((rows) => rows[0]) : Promise.resolve(null),
      existing.modelConfigId ? tx.select().from(aiModelConfigs).where(eq(aiModelConfigs.id, existing.modelConfigId)).limit(1).then((rows) => rows[0]) : Promise.resolve(null),
    ]);
    if (!existing.promptVersionId || !prompt || prompt.status !== "active") throw new Error("Workflow requires an active prompt version");
    if (!existing.outputSchemaVersionId || !outputSchema || outputSchema.status !== "published") throw new Error("Workflow requires a published output schema version");
    if (!existing.providerConfigId || !provider || provider.status !== "active") throw new Error("Workflow requires an active provider");
    if (!existing.modelConfigId || !model || model.status !== "active" || model.providerConfigId !== existing.providerConfigId) throw new Error("Workflow requires an active model belonging to the selected provider");
    const [version] = await tx.update(aiWorkflowVersions).set({ status: "published", publishedAt: new Date(), updatedAt: new Date() }).where(eq(aiWorkflowVersions.id, id)).returning();
    await tx.update(aiWorkflows).set({ status: "active", currentPublishedVersionId: id, updatedAt: new Date() }).where(eq(aiWorkflows.id, existing.workflowId));
    return { existing, version };
  });
  await audit({ actorId, action: "ai_workflow_version.published", entityType: "ai_workflow_version", entityId: id, beforeState: result.existing, afterState: result.version });
  return result.version;
}

export async function listPromptVersions() {
  return db.select().from(promptVersions).orderBy(desc(promptVersions.version));
}

export async function createPromptVersion(input: z.infer<typeof promptVersionBodySchema>, actorId: string) {
  const latest = (await db.select({ version: max(promptVersions.version) }).from(promptVersions))[0];
  const prompt = await db.transaction(async (tx) => {
    if (input.status === "active") await tx.update(promptVersions).set({ status: "archived", updatedAt: new Date() }).where(eq(promptVersions.status, "active"));
    const [prompt] = await tx.insert(promptVersions).values({
      version: input.version ?? (latest?.version ?? 0) + 1,
      status: input.status,
      outputSchemaVersion: input.outputSchemaVersion,
      systemPrompt: input.systemPrompt,
    }).returning();
    return prompt;
  });
  await audit({ actorId, action: "prompt_version.created", entityType: "prompt_version", entityId: prompt.id, afterState: prompt });
  return prompt;
}

export async function listOutputSchemaVersions() {
  return db.select().from(outputSchemaVersions).orderBy(asc(outputSchemaVersions.key), desc(outputSchemaVersions.version));
}

export async function createOutputSchemaVersion(input: z.infer<typeof import("@cnpaf/shared").outputSchemaVersionBodySchema>, actorId: string) {
  const latest = (await db.select({ version: max(outputSchemaVersions.version) }).from(outputSchemaVersions).where(eq(outputSchemaVersions.key, input.key)))[0];
  const [version] = await db.insert(outputSchemaVersions).values({ ...input, version: input.version ?? (latest?.version ?? 0) + 1, createdById: actorId }).returning();
  await audit({ actorId, action: "output_schema_version.created", entityType: "output_schema_version", entityId: version.id, afterState: version });
  return version;
}

export async function updateOutputSchemaVersion(id: string, input: z.infer<typeof import("@cnpaf/shared").outputSchemaVersionUpdateBodySchema>, actorId: string) {
  const current = (await db.select().from(outputSchemaVersions).where(eq(outputSchemaVersions.id, id)).limit(1))[0];
  if (!current) throw new Error("Output schema version not found");
  if (current.status !== "draft") throw new Error("Published output schema versions are immutable");
  const [version] = await db.update(outputSchemaVersions).set({ ...input, updatedAt: new Date() }).where(eq(outputSchemaVersions.id, id)).returning();
  await audit({ actorId, action: "output_schema_version.updated", entityType: "output_schema_version", entityId: id, beforeState: current, afterState: version });
  return version;
}

export async function publishOutputSchemaVersion(id: string, actorId: string) {
  const current = (await db.select().from(outputSchemaVersions).where(eq(outputSchemaVersions.id, id)).limit(1))[0];
  if (!current) throw new Error("Output schema version not found");
  if (current.status !== "draft") throw new Error("Only draft output schema versions can be published");
  const [version] = await db.update(outputSchemaVersions).set({ status: "published", updatedAt: new Date() }).where(eq(outputSchemaVersions.id, id)).returning();
  await audit({ actorId, action: "output_schema_version.published", entityType: "output_schema_version", entityId: id, beforeState: current, afterState: version });
  return version;
}

function assertNoSecretConfiguration(configuration: Record<string, unknown>) {
  const forbidden = /(^|_)(api_?key|secret|token|password|credential)(_|$)/i;
  const visit = (value: unknown, path: string) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (forbidden.test(key)) throw new Error(`Secret configuration must use environment variables, not database field ${path}${key}`);
      visit(nested, `${path}${key}.`);
    }
  };
  visit(configuration, "configuration.");
}

export async function listAiProviderConfigs() {
  const [providers, models] = await Promise.all([
    db.select().from(aiProviderConfigs).orderBy(asc(aiProviderConfigs.displayName)),
    db.select().from(aiModelConfigs).orderBy(asc(aiModelConfigs.modelName)),
  ]);
  return providers.map((provider) => ({ provider, models: models.filter((model) => model.providerConfigId === provider.id) }));
}

export async function createAiProviderConfig(input: z.infer<typeof import("@cnpaf/shared").aiProviderConfigBodySchema>, actorId: string) {
  assertNoSecretConfiguration(input.configuration);
  const [provider] = await db.insert(aiProviderConfigs).values(input).returning();
  await audit({ actorId, action: "ai_provider_config.created", entityType: "ai_provider_config", entityId: provider.id, afterState: provider });
  return provider;
}

export async function updateAiProviderConfig(id: string, input: z.infer<typeof import("@cnpaf/shared").aiProviderConfigUpdateBodySchema>, actorId: string) {
  if (input.configuration) assertNoSecretConfiguration(input.configuration);
  const current = (await db.select().from(aiProviderConfigs).where(eq(aiProviderConfigs.id, id)).limit(1))[0];
  if (!current) throw new Error("AI provider config not found");
  const [provider] = await db.update(aiProviderConfigs).set({ ...input, updatedAt: new Date() }).where(eq(aiProviderConfigs.id, id)).returning();
  await audit({ actorId, action: "ai_provider_config.updated", entityType: "ai_provider_config", entityId: id, beforeState: current, afterState: provider });
  return provider;
}

export async function createAiModelConfig(input: z.infer<typeof import("@cnpaf/shared").aiModelConfigBodySchema>, actorId: string) {
  assertNoSecretConfiguration(input.configuration);
  const [model] = await db.insert(aiModelConfigs).values(input).returning();
  await audit({ actorId, action: "ai_model_config.created", entityType: "ai_model_config", entityId: model.id, afterState: model });
  return model;
}

export async function updateAiModelConfig(id: string, input: z.infer<typeof import("@cnpaf/shared").aiModelConfigUpdateBodySchema>, actorId: string) {
  if (input.configuration) assertNoSecretConfiguration(input.configuration);
  const current = (await db.select().from(aiModelConfigs).where(eq(aiModelConfigs.id, id)).limit(1))[0];
  if (!current) throw new Error("AI model config not found");
  const [model] = await db.update(aiModelConfigs).set({ ...input, updatedAt: new Date() }).where(eq(aiModelConfigs.id, id)).returning();
  await audit({ actorId, action: "ai_model_config.updated", entityType: "ai_model_config", entityId: id, beforeState: current, afterState: model });
  return model;
}
