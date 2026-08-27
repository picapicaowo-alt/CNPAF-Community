import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  aiConversationArtifacts,
  aiConversationArtifactVersions,
  askConversations,
  auditEvents,
  records,
} from "@cnpaf/db/schema";
import { db } from "./db";
import { audit } from "./audit";
import { ApiError } from "./api-error";
import { evaluateAuthorization, getAccessContext } from "./authorization";
import { getAskConversation } from "./ask-collect";
import { deleteObject, getObjectStream, putObject } from "./storage";
import {
  buildAiConversationMarkdown,
  cleanAiConversationInline,
} from "./ai-conversation-markdown";

function recordResource(record: typeof records.$inferSelect) {
  return {
    organizationId: record.organizationId,
    programId: record.programId,
    siteId: record.siteId,
    serviceKey: record.sourceKind,
    researchUse: record.researchUseStatus,
    ownerUserId: record.createdById,
  };
}

async function assertCanManageArtifact(actorId: string, record: typeof records.$inferSelect) {
  const access = await getAccessContext(actorId);
  if (evaluateAuthorization(access, "records.review", recordResource(record)).allowed) return;
  throw new ApiError("FORBIDDEN", "AI conversation records are outside the assigned review scope", 403);
}

function normalizedTitle(value: string | null | undefined) {
  const title = cleanAiConversationInline(value ?? "").slice(0, 140);
  if (!title) throw new ApiError("BAD_REQUEST", "A title is required", 400);
  return title;
}

function publicArtifact(
  artifact: typeof aiConversationArtifacts.$inferSelect,
  version: typeof aiConversationArtifactVersions.$inferSelect,
) {
  return {
    id: artifact.id,
    conversationId: artifact.conversationId,
    title: artifact.title,
    status: artifact.status,
    currentRevision: artifact.currentRevision,
    createdById: artifact.createdById,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
    version: {
      id: version.id,
      revisionNumber: version.revisionNumber,
      mimeType: version.mimeType,
      byteSize: version.byteSize,
      contentSha256: version.contentSha256,
      messageCount: version.messageCount,
      sourceCount: version.sourceCount,
      createdAt: version.createdAt,
    },
  };
}

export async function listAiConversationArtifacts(recordId: string) {
  const rows = await db
    .select({ artifact: aiConversationArtifacts, version: aiConversationArtifactVersions })
    .from(aiConversationArtifacts)
    .innerJoin(
      aiConversationArtifactVersions,
      and(
        eq(aiConversationArtifactVersions.artifactId, aiConversationArtifacts.id),
        eq(aiConversationArtifactVersions.revisionNumber, aiConversationArtifacts.currentRevision),
      ),
    )
    .where(and(eq(aiConversationArtifacts.recordId, recordId), eq(aiConversationArtifacts.status, "active")))
    .orderBy(desc(aiConversationArtifacts.updatedAt));
  return rows.map(({ artifact, version }) => publicArtifact(artifact, version));
}

async function captureArtifact(input: {
  actorId: string;
  recordId: string;
  conversationId: string;
  title?: string;
  artifactId?: string;
  requestId?: string;
}) {
  const record = (await db.select().from(records).where(eq(records.id, input.recordId)).limit(1))[0];
  if (!record?.headVersionId) throw new ApiError("NOT_FOUND", "Record not found", 404);
  const recordVersionId = record.headVersionId;
  if (record.recordStatus === "archived") throw new ApiError("INVALID_TRANSITION", "Archived records cannot receive conversation snapshots", 409);
  await assertCanManageArtifact(input.actorId, record);

  const conversation = (await db.select().from(askConversations).where(eq(askConversations.id, input.conversationId)).limit(1))[0];
  if (!conversation || conversation.userId !== input.actorId || conversation.status !== "active") {
    throw new ApiError("NOT_FOUND", "Conversation not found", 404);
  }
  const savedScope = conversation.scope && typeof conversation.scope === "object" && !Array.isArray(conversation.scope)
    ? conversation.scope as { recordIds?: unknown }
    : {};
  if (!Array.isArray(savedScope.recordIds) || !savedScope.recordIds.includes(record.id)) {
    throw new ApiError("FORBIDDEN", "Conversation is not scoped to this record", 403);
  }
  const bundle = await getAskConversation(conversation.id, input.actorId);
  if (!bundle) throw new ApiError("NOT_FOUND", "Conversation not found", 404);
  if (!bundle.messages.some((message) => message.role === "assistant")) {
    throw new ApiError("CONFLICT", "Generate an AI response before saving the conversation", 409);
  }

  let uploadedStorageKey = "";
  try {
    return await db.transaction(async (tx) => {
    await tx.execute(sql`select id from records where id = ${record.id} for update`);
    let artifact = input.artifactId
      ? (await tx.select().from(aiConversationArtifacts).where(and(
          eq(aiConversationArtifacts.id, input.artifactId),
          eq(aiConversationArtifacts.recordId, record.id),
        )).limit(1).for("update"))[0]
      : (await tx.select().from(aiConversationArtifacts).where(and(
          eq(aiConversationArtifacts.recordId, record.id),
          eq(aiConversationArtifacts.conversationId, conversation.id),
        )).limit(1).for("update"))[0];

    if (input.artifactId && (!artifact || artifact.conversationId !== conversation.id)) {
      throw new ApiError("NOT_FOUND", "AI conversation record not found", 404);
    }
    if (artifact && artifact.createdById !== input.actorId) {
      throw new ApiError("FORBIDDEN", "Only the creator can update this conversation record", 403);
    }
    if (artifact?.status === "archived") {
      throw new ApiError("INVALID_TRANSITION", "Archived conversation records cannot be updated", 409);
    }

    const title = normalizedTitle(input.title ?? artifact?.title ?? conversation.title);
    if (!artifact) {
      [artifact] = await tx.insert(aiConversationArtifacts).values({
        id: randomUUID(),
        recordId: record.id,
        recordVersionId,
        conversationId: conversation.id,
        title,
        status: "active",
        currentRevision: 0,
        createdById: input.actorId,
      }).returning();
    }
    if (!artifact) throw new ApiError("CONFLICT", "Could not create AI conversation record", 409);

    const revisionNumber = artifact.currentRevision + 1;
    const savedAt = new Date();
    const contentFingerprint = createHash("sha256").update(JSON.stringify({
      messages: bundle.messages.map(({ id, role, content, metadata }) => ({ id, role, content, metadata })),
      sources: bundle.sources.map(({ messageId, sourceType, sourceId, citationLabel, excerpt, metadata }) => ({ messageId, sourceType, sourceId, citationLabel, excerpt, metadata })),
    })).digest("hex");
    if (artifact.currentRevision > 0 && title === artifact.title) {
      const currentVersion = (await tx.select().from(aiConversationArtifactVersions).where(and(
        eq(aiConversationArtifactVersions.artifactId, artifact.id),
        eq(aiConversationArtifactVersions.revisionNumber, artifact.currentRevision),
      )).limit(1))[0];
      const provenance = currentVersion?.provenance && typeof currentVersion.provenance === "object" && !Array.isArray(currentVersion.provenance)
        ? currentVersion.provenance as { contentFingerprint?: unknown }
        : {};
      if (currentVersion && provenance.contentFingerprint === contentFingerprint) {
        return publicArtifact(artifact, currentVersion);
      }
    }
    const markdown = buildAiConversationMarkdown({
      title,
      recordId: record.id,
      recordVersionId,
      conversationId: conversation.id,
      revisionNumber,
      savedAt,
      messages: bundle.messages,
      sources: bundle.sources,
    });
    const body = Buffer.from(markdown, "utf8");
    const contentSha256 = createHash("sha256").update(body).digest("hex");
    const storageKey = `record-ai-conversations/${record.id}/${artifact.id}/v${revisionNumber}-${contentSha256.slice(0, 12)}.md`;
    await putObject(storageKey, body, "text/markdown; charset=utf-8");
    uploadedStorageKey = storageKey;

    const [version] = await tx.insert(aiConversationArtifactVersions).values({
      artifactId: artifact.id,
      revisionNumber,
      storageKey,
      mimeType: "text/markdown",
      byteSize: body.byteLength,
      contentSha256,
      messageCount: bundle.messages.length,
      sourceCount: bundle.sources.length,
      provenance: {
        conversationId: conversation.id,
        recordId: record.id,
        recordVersionId,
        capturedAt: savedAt.toISOString(),
        contentFingerprint,
        snapshotPolicy: "authorized-visible-conversation-v1",
      },
      createdById: input.actorId,
      createdAt: savedAt,
    }).returning();
    if (!version) throw new ApiError("CONFLICT", "Could not create conversation snapshot", 409);

    const [updated] = await tx.update(aiConversationArtifacts).set({
      title,
      currentRevision: revisionNumber,
      recordVersionId,
      updatedAt: savedAt,
    }).where(eq(aiConversationArtifacts.id, artifact.id)).returning();
    if (!updated) throw new ApiError("CONFLICT", "Could not update AI conversation record", 409);
    await audit({
      actorId: input.actorId,
      action: revisionNumber === 1 ? "ai_conversation_artifact.created" : "ai_conversation_artifact.snapshot_updated",
      entityType: "ai_conversation_artifact",
      entityId: updated.id,
      afterState: { recordId: record.id, recordVersionId, revisionNumber, contentSha256 },
      metadata: { requestId: input.requestId, conversationId: conversation.id },
    }, (values) => tx.insert(auditEvents).values(values));
    return publicArtifact(updated, version);
    });
  } catch (caught) {
    if (uploadedStorageKey) await deleteObject(uploadedStorageKey).catch(() => undefined);
    throw caught;
  }
}

export function createAiConversationArtifact(input: {
  actorId: string;
  recordId: string;
  conversationId: string;
  title?: string;
  requestId?: string;
}) {
  return captureArtifact(input);
}

export async function updateAiConversationArtifact(input: {
  actorId: string;
  recordId: string;
  artifactId: string;
  action: "rename" | "refresh" | "archive";
  title?: string;
  reason?: string;
  requestId?: string;
}) {
  const artifact = (await db.select().from(aiConversationArtifacts).where(and(
    eq(aiConversationArtifacts.id, input.artifactId),
    eq(aiConversationArtifacts.recordId, input.recordId),
  )).limit(1))[0];
  if (!artifact) throw new ApiError("NOT_FOUND", "AI conversation record not found", 404);
  const record = (await db.select().from(records).where(eq(records.id, input.recordId)).limit(1))[0];
  if (!record) throw new ApiError("NOT_FOUND", "Record not found", 404);
  await assertCanManageArtifact(input.actorId, record);
  if (artifact.createdById !== input.actorId) throw new ApiError("FORBIDDEN", "Only the creator can manage this conversation record", 403);
  if (artifact.status !== "active") throw new ApiError("INVALID_TRANSITION", "AI conversation record is already archived", 409);

  if (input.action === "refresh") {
    return captureArtifact({
      actorId: input.actorId,
      recordId: input.recordId,
      conversationId: artifact.conversationId,
      artifactId: artifact.id,
      title: input.title ?? artifact.title,
      requestId: input.requestId,
    });
  }
  if (input.action === "rename") {
    const title = normalizedTitle(input.title);
    const [updated] = await db.update(aiConversationArtifacts).set({ title, updatedAt: new Date() })
      .where(eq(aiConversationArtifacts.id, artifact.id)).returning();
    await audit({
      actorId: input.actorId,
      action: "ai_conversation_artifact.renamed",
      entityType: "ai_conversation_artifact",
      entityId: artifact.id,
      beforeState: { title: artifact.title },
      afterState: { title },
      metadata: { requestId: input.requestId, recordId: record.id },
    });
    return updated;
  }

  const reason = cleanAiConversationInline(input.reason ?? "").slice(0, 500);
  if (!reason) throw new ApiError("BAD_REQUEST", "An archive reason is required", 400);
  const archivedAt = new Date();
  const [archived] = await db.update(aiConversationArtifacts).set({
    status: "archived",
    archivedAt,
    archivedById: input.actorId,
    archiveReason: reason,
    updatedAt: archivedAt,
  }).where(eq(aiConversationArtifacts.id, artifact.id)).returning();
  await audit({
    actorId: input.actorId,
    action: "ai_conversation_artifact.archived",
    entityType: "ai_conversation_artifact",
    entityId: artifact.id,
    beforeState: { status: artifact.status },
    afterState: { status: archived?.status },
    reason,
    metadata: { requestId: input.requestId, recordId: record.id },
  });
  return archived;
}

export async function downloadAiConversationArtifact(input: {
  actorId: string;
  recordId: string;
  artifactId: string;
}) {
  const row = (await db.select({ artifact: aiConversationArtifacts, version: aiConversationArtifactVersions, record: records })
    .from(aiConversationArtifacts)
    .innerJoin(records, eq(records.id, aiConversationArtifacts.recordId))
    .innerJoin(aiConversationArtifactVersions, and(
      eq(aiConversationArtifactVersions.artifactId, aiConversationArtifacts.id),
      eq(aiConversationArtifactVersions.revisionNumber, aiConversationArtifacts.currentRevision),
    ))
    .where(and(eq(aiConversationArtifacts.id, input.artifactId), eq(aiConversationArtifacts.recordId, input.recordId)))
    .limit(1))[0];
  if (!row || row.artifact.status !== "active") throw new ApiError("NOT_FOUND", "AI conversation record not found", 404);
  await assertCanManageArtifact(input.actorId, row.record);
  return {
    artifact: row.artifact,
    version: row.version,
    object: await getObjectStream(row.version.storageKey),
  };
}
