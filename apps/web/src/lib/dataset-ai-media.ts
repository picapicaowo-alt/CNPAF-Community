import { inArray } from "drizzle-orm";
import { attachments } from "@cnpaf/db/schema";
import { aiImageMimeTypes } from "@cnpaf/shared";
import { db } from "./db";
import { audit } from "./audit";
import { getObject } from "./storage";
import { toAttachmentSummary } from "./attachments";
import { getDatasetMediaForAi } from "./modules/datasets";

const MAX_AI_IMAGES = 6;
const MAX_AI_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_AI_IMAGE_TOTAL_BYTES = 30 * 1024 * 1024;

export async function prepareDatasetAiMedia(actorId: string, datasetVersionId: string) {
  const media = await getDatasetMediaForAi(actorId, datasetVersionId);
  let selectedBytes = 0;
  const selectedImages: Array<typeof attachments.$inferSelect> = [];
  for (const attachment of [...media.mediaAttachments].sort((left, right) => left.id.localeCompare(right.id))) {
    if (selectedImages.length >= MAX_AI_IMAGES) break;
    if (!aiImageMimeTypes.has(attachment.mimeType.toLowerCase())) continue;
    if (attachment.byteSize > MAX_AI_IMAGE_BYTES) continue;
    if (selectedBytes + attachment.byteSize > MAX_AI_IMAGE_TOTAL_BYTES) continue;
    selectedImages.push(attachment);
    selectedBytes += attachment.byteSize;
  }
  const imageInputs = await Promise.all(selectedImages.map(async (attachment) => ({
    id: attachment.id,
    mimeType: attachment.mimeType,
    body: (await getObject(attachment.storageKey)).body,
  })));
  const mediaSources = selectedImages.map((attachment) => {
    const summary = toAttachmentSummary(attachment);
    return {
      id: attachment.id,
      label: `IMG-${attachment.id.slice(0, 8)}`,
      statement: `User-attested privacy-reviewed image attachment: ${summary.originalName}`,
      sourceType: "attachment" as const,
    };
  });
  return {
    imageInputs,
    mediaIncluded: media.mediaIncluded,
    mediaSources,
    selectedImages,
    totalAttachmentCount: media.mediaAttachments.length,
  };
}

export async function markDatasetImagesSentToAi(input: {
  actorId: string;
  aiRunId: string;
  attachmentIds: string[];
  datasetVersionId: string;
  context: Record<string, unknown>;
}) {
  if (!input.attachmentIds.length) return;
  await db.update(attachments).set({ sentToAi: true, updatedAt: new Date() })
    .where(inArray(attachments.id, input.attachmentIds));
  await audit({
    actorId: input.actorId,
    action: "attachment.sent_to_ai",
    entityType: "dataset_version",
    entityId: input.datasetVersionId,
    metadata: {
      aiRunId: input.aiRunId,
      attachmentIds: input.attachmentIds,
      ...input.context,
    },
  });
}
