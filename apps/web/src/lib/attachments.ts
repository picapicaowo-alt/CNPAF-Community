import {
  attachmentKindForMime,
  attachmentOriginalName,
  aiFileMimeTypes,
  documentAttachmentTypes,
  normalizeAttachmentKind,
  type AttachmentSummary,
} from "@cnpaf/shared";
import { attachments } from "@cnpaf/db/schema";

const documentMimeTypes = new Set<string>(
  documentAttachmentTypes.map(({ mimeType }) => mimeType),
);

const mimeByExtension = Object.fromEntries(
  documentAttachmentTypes.map(({ extension, mimeType }) => [extension, mimeType]),
) as Record<string, string>;

const genericUploadMimeTypes = new Set([
  "application/octet-stream",
  "application/zip",
]);

export const attachmentLimits = {
  image: 25 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
  video: 250 * 1024 * 1024,
  document: 25 * 1024 * 1024,
} as const;

export function uploadMimeType(file: File) {
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  const declaredMimeType = file.type.toLowerCase();
  const extensionMimeType = mimeByExtension[extension];
  if (extensionMimeType && (!declaredMimeType || genericUploadMimeTypes.has(declaredMimeType))) {
    return extensionMimeType;
  }
  return declaredMimeType || extensionMimeType || "application/octet-stream";
}

export function attachmentUploadError(file: File, mimeType: string) {
  const kind = attachmentKindForMime(mimeType);
  const supported = kind !== "document" || documentMimeTypes.has(mimeType);
  if (!supported) return "Unsupported attachment type";
  if (file.size <= 0) return "Attachment is empty";
  if (file.size > attachmentLimits[kind]) {
    return `${kind} attachment exceeds the upload limit`;
  }
  return null;
}

export function canSendAttachmentToAi(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  return normalized.startsWith("image/") || aiFileMimeTypes.has(normalized);
}

export function toAttachmentSummary(
  attachment: typeof attachments.$inferSelect,
  url?: string,
): AttachmentSummary {
  return {
    id: attachment.id,
    kind: normalizeAttachmentKind(attachment.kind, attachment.mimeType),
    originalName: attachmentOriginalName(attachment.storageKey),
    mimeType: attachment.mimeType,
    byteSize: attachment.byteSize,
    contentSha256: attachment.contentSha256,
    exifStripped: attachment.exifStripped,
    sentToAi: attachment.sentToAi,
    ...(url ? { url } : {}),
  };
}

/**
 * Stable attachment metadata that can be embedded in Dataset Version hashes and
 * exports. Delivery state such as `sentToAi` is intentionally excluded because
 * it can change after a version has been frozen.
 */
export function toFrozenAttachmentManifest(attachment: typeof attachments.$inferSelect) {
  const { sentToAi: _sentToAi, url: _url, ...manifest } = toAttachmentSummary(attachment);
  return manifest;
}

export function inlineContentDisposition(storageKey: string) {
  const name = attachmentOriginalName(storageKey).replace(/["\r\n]/g, "_");
  return `inline; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
