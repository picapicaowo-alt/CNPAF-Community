CREATE TABLE IF NOT EXISTS lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  key text NOT NULL,
  name_zh text NOT NULL,
  name_en text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lookups_category_key ON lookups (category, key);

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  collection_purpose text NOT NULL DEFAULT 'operational',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL,
  organization_id uuid REFERENCES organizations(id),
  locale text NOT NULL DEFAULT 'zh',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users (email);

CREATE TABLE IF NOT EXISTS invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS invites_token_hash ON invites (token_hash);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  name text NOT NULL,
  site_type text NOT NULL,
  region text,
  canonical_status text NOT NULL DEFAULT 'unverified',
  merged_into_id uuid,
  created_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sites_name ON sites (name);
CREATE INDEX IF NOT EXISTS sites_org ON sites (organization_id);

CREATE TABLE IF NOT EXISTS activity_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'active',
  name_zh text NOT NULL,
  name_en text NOT NULL,
  fields jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS activity_def_key_version ON activity_definitions (key, version);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'active',
  output_schema_version text NOT NULL,
  system_prompt text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prompt_versions_version ON prompt_versions (version);

CREATE TABLE IF NOT EXISTS canonical_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'active',
  name_zh text NOT NULL,
  name_en text NOT NULL,
  definition text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS canonical_themes_key_version ON canonical_themes (key, version);

CREATE TABLE IF NOT EXISTS visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES sites(id),
  activity_definition_id uuid REFERENCES activity_definitions(id),
  conducted_by_id uuid NOT NULL REFERENCES users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visits_site ON visits (site_id);
CREATE INDEX IF NOT EXISTS visits_user ON visits (conducted_by_id);

CREATE TABLE IF NOT EXISTS records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_record_id uuid NOT NULL,
  source_kind text NOT NULL,
  visit_id uuid REFERENCES visits(id),
  site_id uuid REFERENCES sites(id),
  organization_id uuid REFERENCES organizations(id),
  created_by_id uuid NOT NULL REFERENCES users(id),
  activity_definition_id uuid REFERENCES activity_definitions(id),
  collection_purpose text NOT NULL DEFAULT 'operational',
  research_use_status text NOT NULL DEFAULT 'not_assessed',
  record_status text NOT NULL DEFAULT 'draft',
  review_status text NOT NULL DEFAULT 'not_submitted',
  ai_status text NOT NULL DEFAULT 'not_required',
  privacy_status text NOT NULL DEFAULT 'not_scanned',
  head_version_id uuid,
  completeness_score numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS records_client_id ON records (client_record_id);
CREATE INDEX IF NOT EXISTS records_created_by ON records (created_by_id);
CREATE INDEX IF NOT EXISTS records_review ON records (review_status);
CREATE INDEX IF NOT EXISTS records_source ON records (source_kind);

CREATE TABLE IF NOT EXISTS record_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES records(id),
  version_number integer NOT NULL,
  submitted_at timestamptz,
  submitted_by_id uuid REFERENCES users(id),
  activity_definition_id uuid REFERENCES activity_definitions(id),
  quantitative jsonb NOT NULL DEFAULT '{}'::jsonb,
  quantitative_missing jsonb NOT NULL DEFAULT '{}'::jsonb,
  qualitative text NOT NULL DEFAULT '',
  attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  pii_attestation boolean NOT NULL DEFAULT false,
  content_language text NOT NULL DEFAULT 'zh',
  content_hash text,
  local_version integer NOT NULL DEFAULT 1,
  server_version integer NOT NULL DEFAULT 1,
  idempotency_key text,
  is_snapshot boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS record_versions_record_n ON record_versions (record_id, version_number);
CREATE UNIQUE INDEX IF NOT EXISTS record_versions_idempotency ON record_versions (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS record_versions_record ON record_versions (record_id);

CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_version_id uuid NOT NULL REFERENCES record_versions(id),
  kind text NOT NULL DEFAULT 'photo',
  storage_key text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL DEFAULT 0,
  exif_stripped boolean NOT NULL DEFAULT true,
  sent_to_ai boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS theme_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_label text NOT NULL,
  canonical_theme_id uuid NOT NULL REFERENCES canonical_themes(id),
  confidence numeric,
  approved_by_id uuid REFERENCES users(id),
  review_decision_id uuid,
  status text NOT NULL DEFAULT 'proposed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS theme_mappings_raw ON theme_mappings (raw_label);

CREATE TABLE IF NOT EXISTS ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_version_id uuid NOT NULL REFERENCES record_versions(id),
  prompt_version_id uuid REFERENCES prompt_versions(id),
  provider text NOT NULL,
  model text NOT NULL,
  prompt_version integer NOT NULL,
  output_schema_version text NOT NULL,
  input_hash text NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'queued',
  error text,
  raw_output text,
  parsed_output jsonb,
  input_tokens integer,
  output_tokens integer,
  cost numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_runs_record_version ON ai_runs (record_version_id);

CREATE TABLE IF NOT EXISTS ai_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_run_id uuid NOT NULL REFERENCES ai_runs(id),
  kind text NOT NULL,
  statement text NOT NULL,
  suggested_raw_label text,
  suggested_canonical_theme_id uuid REFERENCES canonical_themes(id),
  origin text,
  confidence numeric,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  safety_suspect boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_findings_run ON ai_findings (ai_run_id);

CREATE TABLE IF NOT EXISTS review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES records(id),
  record_version_id uuid NOT NULL REFERENCES record_versions(id),
  reviewer_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL,
  annotation text,
  finding_decisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS concerns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES records(id),
  record_version_id uuid NOT NULL REFERENCES record_versions(id),
  ai_finding_id uuid REFERENCES ai_findings(id),
  statement text NOT NULL,
  canonical_theme_id uuid REFERENCES canonical_themes(id),
  origin text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_status text NOT NULL DEFAULT 'approved',
  ai_confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS concerns_origin ON concerns (origin);
CREATE INDEX IF NOT EXISTS concerns_theme ON concerns (canonical_theme_id);

CREATE TABLE IF NOT EXISTS annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES records(id),
  record_version_id uuid REFERENCES record_versions(id),
  author_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL,
  visible_to_volunteer boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS safety_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES records(id),
  record_version_id uuid REFERENCES record_versions(id),
  ai_finding_id uuid REFERENCES ai_findings(id),
  statement text NOT NULL,
  flag_type text NOT NULL DEFAULT 'urgent_human_review',
  status text NOT NULL DEFAULT 'open',
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS safety_flags_status ON safety_flags (status);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  record_version_id uuid REFERENCES record_versions(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error text,
  run_after timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_kind_version ON jobs (kind, record_version_id);
CREATE INDEX IF NOT EXISTS jobs_status_run ON jobs (status, run_after);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_entity ON audit_events (entity_type, entity_id);

CREATE TABLE IF NOT EXISTS feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_key ON feature_flags (key);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
