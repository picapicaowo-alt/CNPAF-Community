ALTER TABLE ai_runs
  ADD COLUMN IF NOT EXISTS output_schema_version_id uuid REFERENCES output_schema_versions(id);

CREATE INDEX IF NOT EXISTS ai_runs_output_schema
  ON ai_runs (output_schema_version_id)
  WHERE output_schema_version_id IS NOT NULL;
