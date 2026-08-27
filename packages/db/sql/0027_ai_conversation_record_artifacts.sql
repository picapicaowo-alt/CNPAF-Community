BEGIN;

CREATE TABLE IF NOT EXISTS ai_conversation_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES records(id),
  record_version_id uuid NOT NULL REFERENCES record_versions(id),
  conversation_id uuid NOT NULL REFERENCES ask_conversations(id),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  current_revision integer NOT NULL DEFAULT 0,
  created_by_id uuid NOT NULL REFERENCES users(id),
  archived_by_id uuid REFERENCES users(id),
  archived_at timestamptz,
  archive_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_conversation_artifacts_record_conversation UNIQUE (record_id, conversation_id),
  CONSTRAINT ai_conversation_artifacts_status CHECK (status IN ('active', 'archived')),
  CONSTRAINT ai_conversation_artifacts_revision_nonnegative CHECK (current_revision >= 0)
);

CREATE INDEX IF NOT EXISTS ai_conversation_artifacts_record_status
  ON ai_conversation_artifacts (record_id, status, updated_at);
CREATE INDEX IF NOT EXISTS ai_conversation_artifacts_conversation
  ON ai_conversation_artifacts (conversation_id);

CREATE TABLE IF NOT EXISTS ai_conversation_artifact_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL REFERENCES ai_conversation_artifacts(id),
  revision_number integer NOT NULL,
  storage_key text NOT NULL,
  mime_type text NOT NULL DEFAULT 'text/markdown',
  byte_size integer NOT NULL,
  content_sha256 text NOT NULL,
  message_count integer NOT NULL,
  source_count integer NOT NULL,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_conversation_artifact_versions_revision UNIQUE (artifact_id, revision_number),
  CONSTRAINT ai_conversation_artifact_versions_storage_key UNIQUE (storage_key),
  CONSTRAINT ai_conversation_artifact_versions_revision_positive CHECK (revision_number > 0),
  CONSTRAINT ai_conversation_artifact_versions_sizes_nonnegative CHECK (
    byte_size >= 0 AND message_count >= 0 AND source_count >= 0
  )
);

CREATE INDEX IF NOT EXISTS ai_conversation_artifact_versions_artifact_created
  ON ai_conversation_artifact_versions (artifact_id, created_at);

COMMIT;
