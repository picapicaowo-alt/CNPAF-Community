ALTER TABLE attachments
  ADD COLUMN content_sha256 text;

ALTER TABLE attachments
  ADD CONSTRAINT attachments_content_sha256_format
  CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[a-f0-9]{64}$');
