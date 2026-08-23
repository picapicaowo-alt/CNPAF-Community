import { createHash } from "node:crypto";

/** Strip JPEG APP1/EXIF. Other types passed through unchanged. Photos are never sent to AI. */
export function stripExif(buffer: Buffer, mimeType: string): Buffer {
  if (mimeType !== "image/jpeg" && mimeType !== "image/jpg") return buffer;
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return buffer;
  const parts: Buffer[] = [buffer.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      parts.push(buffer.subarray(offset));
      break;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xda) {
      parts.push(buffer.subarray(offset));
      break;
    }
    const size = buffer.readUInt16BE(offset + 2);
    const next = offset + 2 + size;
    const isExif = marker === 0xe1;
    if (!isExif) parts.push(buffer.subarray(offset, next));
    offset = next;
  }
  return Buffer.concat(parts);
}

export function attachmentKey(recordVersionId: string, filename: string): string {
  const stamp = createHash("sha1").update(`${recordVersionId}:${filename}:${Date.now()}`).digest("hex").slice(0, 12);
  return `${recordVersionId}/${stamp}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}
