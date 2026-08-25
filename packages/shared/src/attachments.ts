import { z } from "zod";

export const attachmentKindSchema = z.enum([
  "image",
  "audio",
  "video",
  "document",
]);

export type AttachmentKind = z.infer<typeof attachmentKindSchema>;

export type AttachmentSummary = {
  id: string;
  kind: AttachmentKind;
  originalName: string;
  mimeType: string;
  byteSize: number;
  contentSha256: string | null;
  exifStripped: boolean;
  sentToAi: boolean;
  url?: string;
};

export const aiImageMimeTypes = new Set([
  "image/gif",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export function attachmentKindForMime(mimeType: string): AttachmentKind {
  const normalized = mimeType.toLowerCase();
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("audio/")) return "audio";
  if (normalized.startsWith("video/")) return "video";
  return "document";
}

export function normalizeAttachmentKind(
  storedKind: string,
  mimeType: string,
): AttachmentKind {
  if (attachmentKindSchema.safeParse(storedKind).success) {
    return storedKind as AttachmentKind;
  }
  return attachmentKindForMime(mimeType);
}

export function attachmentOriginalName(storageKey: string): string {
  const storedName = storageKey.split("/").at(-1) ?? "attachment";
  return storedName.replace(/^[a-f0-9]{12}-/, "") || "attachment";
}

export function formatAttachmentBytes(byteSize: number): string {
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) return `${(byteSize / 1024).toFixed(1)} KB`;
  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
}
