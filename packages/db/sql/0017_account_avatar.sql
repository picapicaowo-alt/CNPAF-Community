ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_storage_key text,
  ADD COLUMN IF NOT EXISTS avatar_mime_type text;
