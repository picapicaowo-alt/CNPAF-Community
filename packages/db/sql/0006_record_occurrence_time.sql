ALTER TABLE record_versions
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz;

CREATE INDEX IF NOT EXISTS record_versions_occurred
  ON record_versions (occurred_at)
  WHERE occurred_at IS NOT NULL;
