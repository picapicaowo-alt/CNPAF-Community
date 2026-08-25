-- CNPAF Collect V4.1: program/task operations, human-authored reports,
-- immutable datasets/shares, account lifecycle, and notifications.
-- Additive and backward compatible with the V1-V4 tables.

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
ALTER TABLE record_versions ADD COLUMN IF NOT EXISTS request_fingerprint text;

ALTER TABLE sites ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS latitude numeric(9,6);
ALTER TABLE sites ADD COLUMN IF NOT EXISTS longitude numeric(9,6);
ALTER TABLE sites ADD CONSTRAINT sites_latitude_range CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90);
ALTER TABLE sites ADD CONSTRAINT sites_longitude_range CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);
ALTER TABLE sites ADD CONSTRAINT sites_coordinates_pair CHECK ((latitude IS NULL) = (longitude IS NULL));
CREATE INDEX IF NOT EXISTS sites_coordinates ON sites (latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE TABLE IF NOT EXISTS programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  key text NOT NULL,
  name_en text NOT NULL,
  name_zh text NOT NULL,
  description_en text,
  description_zh text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','completed','archived')),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS programs_org_key ON programs (organization_id, key);
CREATE INDEX IF NOT EXISTS programs_org_status ON programs (organization_id, status);

CREATE TABLE IF NOT EXISTS program_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES programs(id),
  user_id uuid NOT NULL REFERENCES users(id),
  membership_role_key text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  starts_at timestamptz,
  ends_at timestamptz,
  assigned_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS program_memberships_active_unique ON program_memberships (program_id, user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS program_memberships_user_status ON program_memberships (user_id, status);
CREATE INDEX IF NOT EXISTS program_memberships_program_status ON program_memberships (program_id, status);

CREATE TABLE IF NOT EXISTS user_affiliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  organization_id uuid REFERENCES organizations(id),
  program_id uuid REFERENCES programs(id),
  affiliation_type_key text NOT NULL,
  institution_name text NOT NULL,
  institution_type_key text,
  department_name text,
  title text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS user_affiliations_user_status ON user_affiliations (user_id, status);
CREATE INDEX IF NOT EXISTS user_affiliations_organization ON user_affiliations (organization_id);
CREATE INDEX IF NOT EXISTS user_affiliations_program ON user_affiliations (program_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_affiliations_one_primary ON user_affiliations (user_id) WHERE is_primary AND status = 'active';

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES programs(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  template_version_id uuid NOT NULL REFERENCES template_versions(id),
  site_id uuid REFERENCES sites(id),
  task_type_key text NOT NULL,
  title text NOT NULL,
  instructions text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed','cancelled','archived')),
  priority integer NOT NULL DEFAULT 0,
  due_at timestamptz,
  opens_at timestamptz,
  closes_at timestamptz,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (closes_at IS NULL OR opens_at IS NULL OR closes_at > opens_at)
);
CREATE INDEX IF NOT EXISTS tasks_program_status_due ON tasks (program_id, status, due_at);
CREATE INDEX IF NOT EXISTS tasks_organization_status ON tasks (organization_id, status);
CREATE INDEX IF NOT EXISTS tasks_template_version ON tasks (template_version_id);
CREATE INDEX IF NOT EXISTS tasks_site ON tasks (site_id);

CREATE TABLE IF NOT EXISTS task_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id),
  assignee_id uuid NOT NULL REFERENCES users(id),
  assigned_by_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','in_progress','completed','declined','cancelled')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  cancelled_at timestamptz,
  record_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'declined' OR (declined_at IS NOT NULL AND decline_reason IS NOT NULL AND length(btrim(decline_reason)) > 0))
);
CREATE UNIQUE INDEX IF NOT EXISTS task_assignments_task_assignee ON task_assignments (task_id, assignee_id);
CREATE INDEX IF NOT EXISTS task_assignments_assignee_status ON task_assignments (assignee_id, status);
CREATE INDEX IF NOT EXISTS task_assignments_task_status ON task_assignments (task_id, status);

ALTER TABLE records ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES programs(id);
ALTER TABLE records ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES tasks(id);
ALTER TABLE records ADD COLUMN IF NOT EXISTS task_assignment_id uuid REFERENCES task_assignments(id);
CREATE INDEX IF NOT EXISTS records_program ON records (program_id);
CREATE INDEX IF NOT EXISTS records_task ON records (task_id);
CREATE INDEX IF NOT EXISTS records_task_assignment ON records (task_assignment_id);
ALTER TABLE task_assignments ADD CONSTRAINT task_assignments_record_fkey FOREIGN KEY (record_id) REFERENCES records(id);

CREATE TABLE IF NOT EXISTS location_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id),
  organization_id uuid REFERENCES organizations(id),
  normalized_alias text NOT NULL,
  display_alias text NOT NULL,
  language text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS location_aliases_org_normalized ON location_aliases (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), normalized_alias);
CREATE INDEX IF NOT EXISTS location_aliases_site ON location_aliases (site_id);
CREATE INDEX IF NOT EXISTS location_aliases_search ON location_aliases (normalized_alias text_pattern_ops) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS location_merge_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_site_id uuid NOT NULL REFERENCES sites(id),
  destination_site_id uuid NOT NULL REFERENCES sites(id),
  merged_by_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  moved_record_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_site_id <> destination_site_id)
);
CREATE INDEX IF NOT EXISTS location_merge_source ON location_merge_history (source_site_id);
CREATE INDEX IF NOT EXISTS location_merge_destination ON location_merge_history (destination_site_id);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  kind_key text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  entity_type text,
  entity_id uuid,
  status text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','archived')),
  read_at timestamptz,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_status_created ON notifications (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_entity ON notifications (entity_type, entity_id);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  kind_key text NOT NULL,
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  push_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_user_kind ON notification_preferences (user_id, kind_key);

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  program_id uuid REFERENCES programs(id),
  report_template_version_id uuid REFERENCES report_template_versions(id),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  head_version_id uuid,
  created_by_id uuid NOT NULL REFERENCES users(id),
  published_by_id uuid REFERENCES users(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_organization_status_updated ON reports (organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS reports_program ON reports (program_id);
CREATE INDEX IF NOT EXISTS reports_template_version ON reports (report_template_version_id);

CREATE TABLE IF NOT EXISTS report_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports(id),
  version_number integer NOT NULL CHECK (version_number > 0),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  change_summary text,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_report_artifact_id uuid REFERENCES report_artifacts(id),
  created_by_id uuid NOT NULL REFERENCES users(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS report_versions_report_number ON report_versions (report_id, version_number);
CREATE INDEX IF NOT EXISTS report_versions_report_status ON report_versions (report_id, status);
CREATE INDEX IF NOT EXISTS report_versions_source_artifact ON report_versions (source_report_artifact_id);

CREATE TABLE IF NOT EXISTS report_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_version_id uuid NOT NULL REFERENCES report_versions(id),
  section_key text NOT NULL,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  ai_suggestion text,
  ai_suggestion_run_id uuid REFERENCES ai_runs(id),
  ai_suggestion_status text NOT NULL DEFAULT 'none' CHECK (ai_suggestion_status IN ('none','pending','ready','accepted','dismissed','failed')),
  ai_suggested_at timestamptz,
  last_edited_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS report_sections_version_key ON report_sections (report_version_id, section_key);
CREATE INDEX IF NOT EXISTS report_sections_version_order ON report_sections (report_version_id, sort_order);
CREATE INDEX IF NOT EXISTS report_sections_ai_run ON report_sections (ai_suggestion_run_id);

CREATE TABLE IF NOT EXISTS report_version_evidence_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_version_id uuid NOT NULL REFERENCES report_versions(id),
  report_section_id uuid REFERENCES report_sections(id),
  evidence_type text NOT NULL,
  evidence_id uuid NOT NULL,
  citation_label text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS report_version_evidence_unique ON report_version_evidence_links (report_version_id, COALESCE(report_section_id, '00000000-0000-0000-0000-000000000000'::uuid), evidence_type, evidence_id);
CREATE INDEX IF NOT EXISTS report_version_evidence_lookup ON report_version_evidence_links (evidence_type, evidence_id);

ALTER TABLE reports ADD CONSTRAINT reports_head_version_fkey FOREIGN KEY (head_version_id) REFERENCES report_versions(id);

CREATE OR REPLACE FUNCTION prevent_published_report_mutation() RETURNS trigger AS $$
DECLARE published boolean;
BEGIN
  IF TG_TABLE_NAME = 'report_versions' THEN
    IF OLD.status = 'published' THEN RAISE EXCEPTION 'published report versions are immutable'; END IF;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM report_versions v
      WHERE v.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.report_version_id ELSE NEW.report_version_id END
        AND v.status = 'published'
    ) INTO published;
    IF published THEN RAISE EXCEPTION 'published report sections and evidence are immutable'; END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS report_versions_immutable ON report_versions;
CREATE TRIGGER report_versions_immutable BEFORE UPDATE OR DELETE ON report_versions FOR EACH ROW EXECUTE FUNCTION prevent_published_report_mutation();
DROP TRIGGER IF EXISTS report_sections_parent_immutable ON report_sections;
CREATE TRIGGER report_sections_parent_immutable BEFORE INSERT OR UPDATE OR DELETE ON report_sections FOR EACH ROW EXECUTE FUNCTION prevent_published_report_mutation();
DROP TRIGGER IF EXISTS report_evidence_parent_immutable ON report_version_evidence_links;
CREATE TRIGGER report_evidence_parent_immutable BEFORE INSERT OR UPDATE OR DELETE ON report_version_evidence_links FOR EACH ROW EXECUTE FUNCTION prevent_published_report_mutation();

CREATE TABLE IF NOT EXISTS datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  program_id uuid REFERENCES programs(id),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  data_classification text NOT NULL DEFAULT 'approved_evidence',
  selection_query jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  head_version_id uuid,
  created_by_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS datasets_organization_status_updated ON datasets (organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS datasets_program ON datasets (program_id);

CREATE TABLE IF NOT EXISTS dataset_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES datasets(id),
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'building' CHECK (status IN ('building','ready','failed')),
  selection_query jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  record_count integer NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  content_hash text NOT NULL,
  created_by_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS dataset_versions_dataset_number ON dataset_versions (dataset_id, version_number);
CREATE INDEX IF NOT EXISTS dataset_versions_dataset_created ON dataset_versions (dataset_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dataset_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_version_id uuid NOT NULL REFERENCES dataset_versions(id),
  record_id uuid NOT NULL REFERENCES records(id),
  record_version_id uuid NOT NULL REFERENCES record_versions(id),
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  included_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS dataset_records_version_record ON dataset_records (dataset_version_id, record_id);
CREATE UNIQUE INDEX IF NOT EXISTS dataset_records_version_ordinal ON dataset_records (dataset_version_id, ordinal);
CREATE INDEX IF NOT EXISTS dataset_records_record_version ON dataset_records (record_version_id);

ALTER TABLE datasets ADD CONSTRAINT datasets_head_version_fkey FOREIGN KEY (head_version_id) REFERENCES dataset_versions(id);

CREATE OR REPLACE FUNCTION prevent_ready_dataset_mutation() RETURNS trigger AS $$
DECLARE ready boolean;
BEGIN
  IF TG_TABLE_NAME = 'dataset_versions' THEN
    IF OLD.status = 'ready' THEN RAISE EXCEPTION 'ready dataset versions are immutable'; END IF;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM dataset_versions v
      WHERE v.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.dataset_version_id ELSE NEW.dataset_version_id END
        AND v.status = 'ready'
    ) INTO ready;
    IF ready THEN RAISE EXCEPTION 'records in ready dataset versions are immutable'; END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS dataset_versions_immutable ON dataset_versions;
CREATE TRIGGER dataset_versions_immutable BEFORE UPDATE OR DELETE ON dataset_versions FOR EACH ROW EXECUTE FUNCTION prevent_ready_dataset_mutation();
DROP TRIGGER IF EXISTS dataset_records_parent_immutable ON dataset_records;
CREATE TRIGGER dataset_records_parent_immutable BEFORE INSERT OR UPDATE OR DELETE ON dataset_records FOR EACH ROW EXECUTE FUNCTION prevent_ready_dataset_mutation();

CREATE TABLE IF NOT EXISTS shared_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_version_id uuid NOT NULL REFERENCES dataset_versions(id),
  token_hash text NOT NULL,
  recipient_label text,
  access_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by_id uuid REFERENCES users(id),
  created_by_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shared_datasets_token_hash ON shared_datasets (token_hash);
CREATE INDEX IF NOT EXISTS shared_datasets_version_status ON shared_datasets (dataset_version_id, status);
CREATE INDEX IF NOT EXISTS shared_datasets_expires ON shared_datasets (expires_at);

CREATE TABLE IF NOT EXISTS shared_dataset_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_dataset_id uuid NOT NULL REFERENCES shared_datasets(id),
  action text NOT NULL,
  actor_user_id uuid REFERENCES users(id),
  request_id text,
  ip_hash text,
  user_agent_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shared_dataset_access_share_created ON shared_dataset_access_logs (shared_dataset_id, created_at DESC);

ALTER TABLE export_jobs ADD COLUMN IF NOT EXISTS record_version_id uuid REFERENCES record_versions(id);
ALTER TABLE export_jobs ADD COLUMN IF NOT EXISTS dataset_version_id uuid REFERENCES dataset_versions(id);
CREATE INDEX IF NOT EXISTS export_jobs_record_version ON export_jobs (record_version_id);
CREATE INDEX IF NOT EXISTS export_jobs_dataset_version ON export_jobs (dataset_version_id);

INSERT INTO config_registries (key, name_en, name_zh, status)
VALUES
  ('task_type', 'Task types', '任务类型', 'active'),
  ('program_membership_role', 'Program membership roles', '项目成员角色', 'active'),
  ('affiliation_type', 'Affiliation types', '所属关系类型', 'active'),
  ('notification_kind', 'Notification kinds', '通知类型', 'active'),
  ('dataset_field_profile', 'Dataset field profiles', '数据集字段方案', 'active')
ON CONFLICT (key) DO NOTHING;

-- Usable baseline configuration. These are versioned rows, not route enums;
-- administrators may archive them or publish organization-specific versions.
INSERT INTO config_registry_items (
  registry_id, key, version, label_en, label_zh, status, sort_order, metadata, published_at
)
SELECT registry.id, seed.item_key, 1, seed.label_en, seed.label_zh, 'active', seed.sort_order, seed.metadata, now()
FROM config_registries registry
JOIN (VALUES
  ('task_type', 'data_collection', 'Data collection', '数据采集', 1, '{}'::jsonb),
  ('program_membership_role', 'member', 'Member', '成员', 1, '{}'::jsonb),
  ('program_membership_role', 'coordinator', 'Coordinator', '协调员', 2, '{}'::jsonb),
  ('affiliation_type', 'staff', 'Staff', '员工', 1, '{}'::jsonb),
  ('affiliation_type', 'volunteer', 'Volunteer', '志愿者', 2, '{}'::jsonb),
  ('affiliation_type', 'partner', 'Partner', '合作伙伴', 3, '{}'::jsonb),
  ('affiliation_type', 'researcher', 'Researcher', '研究人员', 4, '{}'::jsonb),
  ('affiliation_type', 'independent', 'Independent', '独立人士', 5, '{}'::jsonb),
  ('notification_kind', 'task_assigned', 'Task assigned', '任务已分配', 1, '{"channels":["in_app"]}'::jsonb),
  ('dataset_field_profile', 'approved_evidence_default', 'Approved evidence default', '已批准证据默认方案', 1, '{"include":["structured_answers","approved_findings","evidence_excerpts","collector_notes","form_version_information"]}'::jsonb)
) AS seed(registry_key, item_key, label_en, label_zh, sort_order, metadata)
  ON seed.registry_key = registry.key
ON CONFLICT (registry_id, key, version) DO NOTHING;

-- Initial source behavior is persisted configuration. This INSERT also repairs
-- fresh installations where the legacy lookup table was empty when 0002 ran.
-- Runtime code loads metadata.policy and never branches on these seed keys;
-- administrators can publish a later registry-item version to change behavior.
INSERT INTO config_registry_items (
  registry_id, key, version, label_en, label_zh, status, sort_order, metadata, published_at
)
SELECT registry.id, seed.item_key, 1, seed.label_en, seed.label_zh, 'active', seed.sort_order,
  jsonb_build_object('policy', seed.policy), now()
FROM config_registries registry
JOIN (VALUES
  ('field_visit', 'Field visit', '现场访视', 1, '{"requiresVisit":true,"requiresSite":true,"requiresActivity":true,"requiresPiiAttestation":true,"requiredAttributionFields":[],"allowedIdentifierFields":[],"privacyDisposition":"flag","defaultConcernOriginKey":"field_observation"}'::jsonb),
  ('professor_interview', 'Professor interview', '教授访谈', 2, '{"requiresVisit":false,"requiresSite":false,"requiresActivity":false,"requiresPiiAttestation":false,"requiredAttributionFields":["professorName","attributionPermission","quotePermission"],"allowedIdentifierFields":["professorName","affiliation"],"privacyDisposition":"redact","defaultConcernOriginKey":"expert_interview"}'::jsonb),
  ('literature', 'Literature', '文献', 3, '{"requiresVisit":false,"requiresSite":false,"requiresActivity":false,"requiresPiiAttestation":false,"requiredAttributionFields":["title"],"allowedIdentifierFields":["title","authors","url"],"privacyDisposition":"redact","defaultConcernOriginKey":"literature"}'::jsonb),
  ('other', 'Other', '其他', 4, '{"requiresVisit":false,"requiresSite":false,"requiresActivity":false,"requiresPiiAttestation":true,"requiredAttributionFields":[],"allowedIdentifierFields":[],"privacyDisposition":"flag","defaultConcernOriginKey":"field_observation"}'::jsonb)
) AS seed(item_key, label_en, label_zh, sort_order, policy) ON true
WHERE registry.key = 'source_kind'
ON CONFLICT (registry_id, key, version) DO UPDATE
SET metadata = jsonb_set(COALESCE(config_registry_items.metadata, '{}'::jsonb), '{policy}', EXCLUDED.metadata->'policy', true),
    updated_at = now();

INSERT INTO permissions (key, module, name_en, name_zh, description)
VALUES
  ('programs.view','programs','View programs','查看项目','View programs in assigned scope.'),
  ('programs.manage','programs','Manage programs','管理项目','Create and update programs.'),
  ('programs.manage_membership','programs','Manage program membership','管理项目成员','Add, update, and remove program members.'),
  ('tasks.view','tasks','View tasks','查看任务','View assigned or scoped tasks.'),
  ('tasks.create','tasks','Create tasks','创建任务','Create program tasks.'),
  ('tasks.assign','tasks','Assign tasks','分配任务','Assign program tasks to users.'),
  ('tasks.edit','tasks','Edit tasks','编辑任务','Update task lifecycle and configuration.'),
  ('locations.view','locations','View locations','查看地点','Search canonical locations and aliases.'),
  ('locations.manage','locations','Manage locations','管理地点','Manage aliases and location merges.'),
  ('review.view','review','View unified review','查看统一审核','View the scoped unified review queue.'),
  ('review.decide','review','Make review decisions','执行统一审核','Act on scoped review items.'),
  ('findings.view','findings','View findings','查看发现','View approved and pending findings.'),
  ('findings.review','findings','Review findings','审核发现','Review AI and human findings.'),
  ('insights.view','insights','View insights','查看洞察','View scoped operational insights.'),
  ('notifications.view','notifications','View notifications','查看通知','View and mark personal notifications.'),
  ('notifications.manage','notifications','Manage notification settings','管理通知设置','Manage personal notification preferences.'),
  ('reports.edit','reports','Edit reports','编辑报告','Create and edit human-authoritative report drafts.'),
  ('records.download','records','Download records','下载记录','Download an authorized record snapshot.'),
  ('records.share','records','Share records','共享记录','Create a controlled one-record dataset share.'),
  ('records.view_restricted_pii','records','View restricted PII','查看受限个人信息','Explicit capability required for restricted record data.'),
  ('datasets.create','datasets','Create datasets','创建数据集','Create immutable datasets from scoped records.'),
  ('datasets.download','datasets','Download datasets','下载数据集','Download authorized dataset versions.'),
  ('datasets.share','datasets','Share datasets','共享数据集','Create and revoke controlled dataset shares.'),
  ('datasets.refresh','datasets','Refresh datasets','刷新数据集','Create a new immutable dataset version.'),
  ('people.view','people','View people','查看人员','View people and profile details.'),
  ('people.create_account','people','Create accounts','创建账户','Manually provision an account.'),
  ('people.reset_password','people','Reset passwords','重置密码','Reset credentials and invalidate sessions.'),
  ('people.edit_profile','people','Edit profiles','编辑资料','Edit identity and profile fields.'),
  ('people.edit_affiliation','people','Edit affiliations','编辑所属关系','Manage affiliation history.'),
  ('data.download','data','Download data','下载数据','Canonical data download capability.'),
  ('data.share','data','Share data','共享数据','Canonical controlled sharing capability.'),
  ('ask_collect.use','chat','Use Ask Collect','使用 Ask Collect','Canonical Ask Collect capability.'),
  ('ai.configure','ai','Configure AI','配置 AI','Canonical AI configuration capability.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, effect)
SELECT r.id, p.id, 'allow' FROM roles r CROSS JOIN permissions p
WHERE r.key = 'admin' AND r.organization_id IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, effect)
SELECT r.id, p.id, 'allow'
FROM roles r JOIN permissions p ON p.key = ANY (CASE r.key
  WHEN 'volunteer' THEN ARRAY['programs.view','tasks.view','locations.view','notifications.view','notifications.manage']::text[]
  WHEN 'operations_reviewer' THEN ARRAY['programs.view','tasks.view','tasks.assign','tasks.edit','locations.view','review.view','review.decide','findings.view','findings.review','insights.view','notifications.view','notifications.manage','records.download']::text[]
  WHEN 'research_lead' THEN ARRAY['programs.view','programs.manage','programs.manage_membership','tasks.view','tasks.create','tasks.assign','tasks.edit','locations.view','locations.manage','review.view','review.decide','findings.view','findings.review','insights.view','notifications.view','notifications.manage','reports.edit','records.download','records.share','datasets.create','datasets.download','datasets.share','datasets.refresh','data.download','data.share','ask_collect.use']::text[]
  WHEN 'winston_research' THEN ARRAY['programs.view','locations.view','findings.view','insights.view','notifications.view','reports.view','datasets.download','data.download','ask_collect.use']::text[]
  ELSE ARRAY[]::text[] END)
WHERE r.organization_id IS NULL AND r.key <> 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;
