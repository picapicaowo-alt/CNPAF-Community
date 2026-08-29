import assert from "node:assert/strict";
import test from "node:test";
import {
  attachmentKindForMime,
  attachmentOriginalName,
  normalizeAttachmentKind,
} from "@cnpaf/shared";
import {
  attachmentUploadError,
  uploadMimeType,
} from "../src/lib/attachments";

test("attachment kinds normalize legacy photo rows and current media MIME types", () => {
  assert.equal(normalizeAttachmentKind("photo", "image/jpeg"), "image");
  assert.equal(attachmentKindForMime("audio/mpeg"), "audio");
  assert.equal(attachmentKindForMime("video/quicktime"), "video");
  assert.equal(attachmentKindForMime("application/pdf"), "document");
});

test("attachment names are restored from opaque storage keys", () => {
  assert.equal(
    attachmentOriginalName("record-version/1a2b3c4d5e6f-visit-photo.jpg"),
    "visit-photo.jpg",
  );
});

test("attachment upload policy accepts supported media and rejects executable files", () => {
  const video = new File([new Uint8Array([1, 2, 3])], "visit.mov", {
    type: "video/quicktime",
  });
  assert.equal(attachmentUploadError(video, uploadMimeType(video)), null);

  const executable = new File([new Uint8Array([1])], "payload.exe", {
    type: "application/x-msdownload",
  });
  assert.equal(
    attachmentUploadError(executable, uploadMimeType(executable)),
    "Unsupported attachment type",
  );
});

test("attachment upload policy accepts PowerPoint files across browser MIME variants", () => {
  const presentation = new File([new Uint8Array([1, 2, 3])], "briefing.pptx", {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
  assert.equal(attachmentUploadError(presentation, uploadMimeType(presentation)), null);

  const genericPresentation = new File([new Uint8Array([1, 2, 3])], "briefing.pptx", {
    type: "application/octet-stream",
  });
  assert.equal(
    uploadMimeType(genericPresentation),
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  );
  assert.equal(
    attachmentUploadError(genericPresentation, uploadMimeType(genericPresentation)),
    null,
  );
});
