INSERT INTO permissions (key, module, name_en, name_zh, description)
VALUES (
  'datasets.archive',
  'datasets',
  'Archive datasets',
  '归档数据集',
  'Archive a dataset and revoke every active share without deleting immutable versions.'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, effect)
SELECT r.id, p.id, 'allow'
FROM roles r
JOIN permissions p ON p.key = 'datasets.archive'
WHERE r.organization_id IS NULL AND r.key IN ('admin', 'research_lead')
ON CONFLICT (role_id, permission_id) DO NOTHING;

ALTER TABLE report_versions
  ADD COLUMN source_dataset_version_id uuid REFERENCES dataset_versions(id);

CREATE INDEX report_versions_source_dataset_version
  ON report_versions(source_dataset_version_id);

CREATE TABLE storage_migration_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_backend text NOT NULL,
  target_backend text NOT NULL,
  status text NOT NULL DEFAULT 'manifested',
  manifest_hash text NOT NULL,
  total_objects integer NOT NULL DEFAULT 0,
  total_bytes bigint NOT NULL DEFAULT 0,
  completed_objects integer NOT NULL DEFAULT 0,
  verified_objects integer NOT NULL DEFAULT 0,
  failed_objects integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX storage_migration_runs_status_created
  ON storage_migration_runs(status, created_at);

CREATE TABLE storage_migration_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_run_id uuid NOT NULL REFERENCES storage_migration_runs(id),
  storage_key text NOT NULL,
  byte_size bigint NOT NULL,
  sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  target_etag text,
  last_error text,
  uploaded_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX storage_migration_objects_run_key
  ON storage_migration_objects(migration_run_id, storage_key);

CREATE INDEX storage_migration_objects_run_status
  ON storage_migration_objects(migration_run_id, status);
