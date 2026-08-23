-- CNPAF Collect backend platform expansion.
-- Additive migration: legacy columns and tables remain available during rollout.

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  name_en text NOT NULL,
  name_zh text NOT NULL,
  description text,
  organization_id uuid REFERENCES organizations(id),
  is_system_role boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS roles_global_key ON roles (key) WHERE organization_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS roles_org_key ON roles (organization_id, key) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS roles_organization ON roles (organization_id);

CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  module text NOT NULL,
  name_en text NOT NULL,
  name_zh text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS permissions_key ON permissions (key);
CREATE INDEX IF NOT EXISTS permissions_module ON permissions (module);

CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id),
  permission_id uuid NOT NULL REFERENCES permissions(id),
  effect text NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow', 'deny')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_role_permission ON role_permissions (role_id, permission_id);
CREATE INDEX IF NOT EXISTS role_permissions_permission ON role_permissions (permission_id);

CREATE TABLE IF NOT EXISTS user_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  role_id uuid NOT NULL REFERENCES roles(id),
  organization_id uuid REFERENCES organizations(id),
  starts_at timestamptz,
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  assigned_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_role_assignments_user_status ON user_role_assignments (user_id, status);
CREATE INDEX IF NOT EXISTS user_role_assignments_role ON user_role_assignments (role_id);
CREATE INDEX IF NOT EXISTS user_role_assignments_organization ON user_role_assignments (organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_role_assignments_active_unique
  ON user_role_assignments (user_id, role_id, COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS permission_scope_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  permission_id uuid REFERENCES permissions(id),
  role_assignment_id uuid REFERENCES user_role_assignments(id),
  scope_type text NOT NULL,
  scope_id uuid,
  scope_key text,
  effect text NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow', 'deny')),
  assigned_by_id uuid REFERENCES users(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (scope_type = 'global' OR scope_id IS NOT NULL OR scope_key IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS permission_scopes_user_type ON permission_scope_assignments (user_id, scope_type);
CREATE INDEX IF NOT EXISTS permission_scopes_permission ON permission_scope_assignments (permission_id);
CREATE INDEX IF NOT EXISTS permission_scopes_role_assignment ON permission_scope_assignments (role_assignment_id);
CREATE INDEX IF NOT EXISTS permission_scopes_scope_id ON permission_scope_assignments (scope_id);

CREATE TABLE IF NOT EXISTS user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  permission_id uuid NOT NULL REFERENCES permissions(id),
  effect text NOT NULL CHECK (effect IN ('allow', 'deny')),
  scope_type text,
  scope_id uuid,
  scope_key text,
  assigned_by_id uuid REFERENCES users(id),
  reason text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (scope_type IS NOT NULL OR (scope_id IS NULL AND scope_key IS NULL))
);
CREATE INDEX IF NOT EXISTS permission_overrides_user_permission ON user_permission_overrides (user_id, permission_id);
CREATE INDEX IF NOT EXISTS permission_overrides_expires ON user_permission_overrides (expires_at);

ALTER TABLE invites ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES roles(id);
ALTER TABLE invites ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
ALTER TABLE invites ADD COLUMN IF NOT EXISTS initial_scopes jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS invites_role ON invites (role_id);

CREATE TABLE IF NOT EXISTS config_registries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name_en text NOT NULL,
  name_zh text NOT NULL,
  description text,
  handler_key text,
  status text NOT NULL DEFAULT 'active',
  created_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS config_registry_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id uuid NOT NULL REFERENCES config_registries(id),
  key text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  label_en text NOT NULL,
  label_zh text NOT NULL,
  help_text_en text,
  help_text_zh text,
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  canonical_item_id uuid,
  supersedes_item_id uuid,
  organization_id uuid REFERENCES organizations(id),
  published_at timestamptz,
  created_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS config_registry_item_key_version ON config_registry_items (registry_id, key, version);
CREATE INDEX IF NOT EXISTS config_registry_items_status_order ON config_registry_items (registry_id, status, sort_order);
CREATE INDEX IF NOT EXISTS config_registry_items_organization ON config_registry_items (organization_id);
CREATE INDEX IF NOT EXISTS config_registry_items_canonical ON config_registry_items (canonical_item_id);

CREATE TABLE IF NOT EXISTS templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  template_type_key text NOT NULL,
  organization_id uuid REFERENCES organizations(id),
  status text NOT NULL DEFAULT 'draft',
  current_published_version_id uuid,
  created_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS templates_org_key ON templates (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), key);
CREATE INDEX IF NOT EXISTS templates_type_status ON templates (template_type_key, status);

CREATE TABLE IF NOT EXISTS template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES templates(id),
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  name_en text NOT NULL,
  name_zh text NOT NULL,
  description_en text,
  description_zh text,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  created_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS template_versions_template_version ON template_versions (template_id, version);
CREATE INDEX IF NOT EXISTS template_versions_status ON template_versions (status);

CREATE TABLE IF NOT EXISTS template_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_version_id uuid NOT NULL REFERENCES template_versions(id),
  key text NOT NULL,
  label_en text NOT NULL,
  label_zh text NOT NULL,
  help_text_en text,
  help_text_zh text,
  sort_order integer NOT NULL DEFAULT 0,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS template_sections_version_key ON template_sections (template_version_id, key);
CREATE INDEX IF NOT EXISTS template_sections_order ON template_sections (template_version_id, sort_order);

CREATE TABLE IF NOT EXISTS template_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_section_id uuid NOT NULL REFERENCES template_sections(id),
  key text NOT NULL,
  field_type_key text NOT NULL,
  label_en text NOT NULL,
  label_zh text NOT NULL,
  help_text_en text,
  help_text_zh text,
  placeholder_en text,
  placeholder_zh text,
  required boolean NOT NULL DEFAULT false,
  allow_missing_reason boolean NOT NULL DEFAULT false,
  allow_custom_entry boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility_conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  branching_logic jsonb NOT NULL DEFAULT '[]'::jsonb,
  canonical_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS template_fields_section_key ON template_fields (template_section_id, key);
CREATE INDEX IF NOT EXISTS template_fields_order ON template_fields (template_section_id, sort_order);

CREATE TABLE IF NOT EXISTS template_field_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_field_id uuid NOT NULL REFERENCES template_fields(id),
  key text NOT NULL,
  label_en text NOT NULL,
  label_zh text NOT NULL,
  help_text_en text,
  help_text_zh text,
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  canonical_registry_item_id uuid REFERENCES config_registry_items(id),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS template_field_options_field_key ON template_field_options (template_field_id, key);
CREATE INDEX IF NOT EXISTS template_field_options_order ON template_field_options (template_field_id, status, sort_order);
CREATE INDEX IF NOT EXISTS template_field_options_canonical ON template_field_options (canonical_registry_item_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'templates_current_published_version_fkey') THEN
    ALTER TABLE templates ADD CONSTRAINT templates_current_published_version_fkey
      FOREIGN KEY (current_published_version_id) REFERENCES template_versions(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS records_scope_review ON records (organization_id, site_id, source_kind, review_status);

CREATE OR REPLACE FUNCTION prevent_published_template_child_mutation() RETURNS trigger AS $$
DECLARE
  published boolean;
BEGIN
  IF TG_TABLE_NAME = 'template_sections' THEN
    IF TG_OP = 'DELETE' THEN
      SELECT EXISTS (SELECT 1 FROM template_versions WHERE id = OLD.template_version_id AND status = 'published') INTO published;
    ELSE
      SELECT EXISTS (SELECT 1 FROM template_versions WHERE id = NEW.template_version_id AND status = 'published') INTO published;
    END IF;
  ELSIF TG_TABLE_NAME = 'template_fields' THEN
    IF TG_OP = 'DELETE' THEN
      SELECT EXISTS (SELECT 1 FROM template_sections s JOIN template_versions v ON v.id = s.template_version_id WHERE s.id = OLD.template_section_id AND v.status = 'published') INTO published;
    ELSE
      SELECT EXISTS (SELECT 1 FROM template_sections s JOIN template_versions v ON v.id = s.template_version_id WHERE s.id = NEW.template_section_id AND v.status = 'published') INTO published;
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      SELECT EXISTS (SELECT 1 FROM template_fields f JOIN template_sections s ON s.id = f.template_section_id JOIN template_versions v ON v.id = s.template_version_id WHERE f.id = OLD.template_field_id AND v.status = 'published') INTO published;
    ELSE
      SELECT EXISTS (SELECT 1 FROM template_fields f JOIN template_sections s ON s.id = f.template_section_id JOIN template_versions v ON v.id = s.template_version_id WHERE f.id = NEW.template_field_id AND v.status = 'published') INTO published;
    END IF;
  END IF;
  IF published THEN RAISE EXCEPTION 'children of published template versions are immutable'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS template_sections_parent_immutable ON template_sections;
CREATE TRIGGER template_sections_parent_immutable BEFORE INSERT OR UPDATE OR DELETE ON template_sections FOR EACH ROW EXECUTE FUNCTION prevent_published_template_child_mutation();
DROP TRIGGER IF EXISTS template_fields_parent_immutable ON template_fields;
CREATE TRIGGER template_fields_parent_immutable BEFORE INSERT OR UPDATE OR DELETE ON template_fields FOR EACH ROW EXECUTE FUNCTION prevent_published_template_child_mutation();
DROP TRIGGER IF EXISTS template_field_options_parent_immutable ON template_field_options;
CREATE TRIGGER template_field_options_parent_immutable BEFORE INSERT OR UPDATE OR DELETE ON template_field_options FOR EACH ROW EXECUTE FUNCTION prevent_published_template_child_mutation();

CREATE TABLE IF NOT EXISTS report_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_run_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  content jsonb NOT NULL,
  approved_by_id uuid REFERENCES users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS report_artifacts_run_version ON report_artifacts (report_run_id, version);
CREATE INDEX IF NOT EXISTS report_artifacts_status ON report_artifacts (status);

CREATE TABLE IF NOT EXISTS report_evidence_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_artifact_id uuid NOT NULL REFERENCES report_artifacts(id),
  evidence_type text NOT NULL,
  evidence_id uuid NOT NULL,
  citation_label text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS report_evidence_link_unique ON report_evidence_links (report_artifact_id, evidence_type, evidence_id);
CREATE INDEX IF NOT EXISTS report_evidence_links_evidence ON report_evidence_links (evidence_type, evidence_id);

CREATE TABLE IF NOT EXISTS ask_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  title text,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ask_conversations_user_updated ON ask_conversations (user_id, updated_at);

CREATE TABLE IF NOT EXISTS ask_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ask_conversations(id),
  role text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  ai_run_id uuid REFERENCES ai_runs(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ask_messages_conversation_created ON ask_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS ask_message_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES ask_messages(id),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  citation_label text,
  excerpt text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ask_message_sources_message ON ask_message_sources (message_id);
CREATE INDEX IF NOT EXISTS ask_message_sources_source ON ask_message_sources (source_type, source_id);

DROP INDEX IF EXISTS jobs_kind_version;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS locked_by text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS finished_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS jobs_idempotency ON jobs (idempotency_key);

CREATE TABLE IF NOT EXISTS export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by_id uuid NOT NULL REFERENCES users(id),
  export_type_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_classification text NOT NULL DEFAULT 'approved_evidence',
  storage_key text,
  mime_type text,
  byte_size integer,
  expires_at timestamptz,
  error_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS export_jobs_requester_created ON export_jobs (requested_by_id, created_at);
CREATE INDEX IF NOT EXISTS export_jobs_status_created ON export_jobs (status, created_at);

ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES users(id);
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS before_state jsonb;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS after_state jsonb;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS reason text;
CREATE INDEX IF NOT EXISTS audit_actor_created ON audit_events (actor_id, created_at);
CREATE INDEX IF NOT EXISTS audit_target_created ON audit_events (target_user_id, created_at);

-- Stable, configurable role definitions. These are seed data, not application enums.
INSERT INTO roles (key, name_en, name_zh, description, is_system_role)
VALUES
  ('volunteer', 'Volunteer / Collector', '志愿者 / 收集员', 'Collects and submits records.', true),
  ('operations_reviewer', 'Operations Reviewer', '运营审核员', 'Reviews records, privacy, safety, and AI findings.', true),
  ('research_lead', 'Research Lead', '研究负责人', 'Manages research configuration, synthesis, and scoped exports.', true),
  ('admin', 'Admin', '管理员', 'Manages users, permissions, configuration, and system settings.', true),
  ('winston_research', 'Winston Research', 'Winston 研究', 'Research-facing access to approved, scoped evidence only.', true)
ON CONFLICT DO NOTHING;

INSERT INTO permissions (key, module, name_en, name_zh, description)
VALUES
  ('records.create', 'records', 'Create records', '创建记录', 'Create a new collection record.'),
  ('records.edit_own', 'records', 'Edit own drafts', '编辑自己的草稿', 'Edit drafts created by the current user.'),
  ('records.submit', 'records', 'Submit records', '提交记录', 'Submit a collection record.'),
  ('records.view_own', 'records', 'View own records', '查看自己的记录', 'View records created by the current user.'),
  ('records.view', 'records', 'View scoped records', '查看范围内记录', 'View records allowed by assigned scopes.'),
  ('records.view_approved', 'records', 'View approved evidence', '查看已批准证据', 'View approved and research-eligible evidence.'),
  ('records.review', 'records', 'Review records', '审核记录', 'Review records within assigned scopes.'),
  ('records.return', 'records', 'Return records', '退回记录', 'Return a record for completion.'),
  ('privacy.view', 'privacy', 'View privacy queue', '查看隐私队列', 'View scoped privacy flags.'),
  ('privacy.redact', 'privacy', 'Redact records', '编辑脱敏记录', 'Create a privacy-cleared redacted copy.'),
  ('privacy.resolve', 'privacy', 'Resolve privacy flags', '解决隐私标记', 'Resolve scoped privacy flags.'),
  ('safety.view', 'safety', 'View safety queue', '查看安全队列', 'View scoped safety flags.'),
  ('safety.resolve', 'safety', 'Resolve safety flags', '解决安全标记', 'Resolve scoped safety flags.'),
  ('templates.view', 'templates', 'View templates', '查看模板', 'View configured templates.'),
  ('templates.create', 'templates', 'Create templates', '创建模板', 'Create templates and draft versions.'),
  ('templates.edit', 'templates', 'Edit templates', '编辑模板', 'Edit draft template versions.'),
  ('templates.publish', 'templates', 'Publish templates', '发布模板', 'Publish immutable template versions.'),
  ('templates.archive', 'templates', 'Archive templates', '归档模板', 'Archive templates and options.'),
  ('taxonomy.view', 'taxonomy', 'View taxonomy', '查看分类法', 'View canonical taxonomy.'),
  ('taxonomy.edit', 'taxonomy', 'Edit taxonomy', '编辑分类法', 'Edit taxonomy configuration.'),
  ('taxonomy.approve_mapping', 'taxonomy', 'Approve mappings', '批准映射', 'Review custom-entry and taxonomy mappings.'),
  ('ai.view_runs', 'ai', 'View AI runs', '查看 AI 运行', 'View scoped AI run provenance.'),
  ('ai.retry_run', 'ai', 'Retry AI runs', '重试 AI 运行', 'Retry failed AI runs.'),
  ('ai.review_findings', 'ai', 'Review AI findings', '审核 AI 发现', 'Approve, edit, or dismiss AI findings.'),
  ('ai.request_reclassification', 'ai', 'Request reclassification', '请求重新分类', 'Create a new immutable classification run.'),
  ('ai.configure_workflows', 'ai', 'Configure AI workflows', '配置 AI 工作流', 'Create and publish AI workflow versions.'),
  ('ai.configure_prompts', 'ai', 'Configure prompts', '配置提示词', 'Manage prompt and output-schema versions.'),
  ('analytics.view', 'analytics', 'View analytics', '查看分析', 'View scoped aggregate analytics.'),
  ('reports.view', 'reports', 'View reports', '查看报告', 'View scoped report artifacts.'),
  ('reports.generate', 'reports', 'Generate reports', '生成报告', 'Generate a versioned report run.'),
  ('reports.publish', 'reports', 'Publish reports', '发布报告', 'Approve and publish report artifacts.'),
  ('chat.ask_collect', 'chat', 'Use Ask Collect', '使用 Ask Collect', 'Ask evidence-grounded questions within scope.'),
  ('exports.create', 'exports', 'Create exports', '创建导出', 'Create scoped export jobs.'),
  ('exports.download', 'exports', 'Download exports', '下载导出', 'Download an authorized export artifact.'),
  ('exports.research', 'exports', 'Research exports', '研究导出', 'Create approved research exports.'),
  ('users.view', 'users', 'View users', '查看用户', 'View users and their effective access.'),
  ('users.invite', 'users', 'Invite users', '邀请用户', 'Invite a user with initial access.'),
  ('users.edit', 'users', 'Edit users', '编辑用户', 'Edit identity and status.'),
  ('users.deactivate', 'users', 'Deactivate users', '停用用户', 'Deactivate or reactivate a user.'),
  ('roles.view', 'roles', 'View roles', '查看角色', 'View the role catalog.'),
  ('roles.assign', 'roles', 'Assign roles', '分配角色', 'Assign and remove user roles.'),
  ('roles.manage', 'roles', 'Manage roles', '管理角色', 'Create and edit role definitions.'),
  ('permissions.assign', 'permissions', 'Assign permissions', '分配权限', 'Assign scopes and explicit overrides.'),
  ('sites.manage', 'configuration', 'Manage sites', '管理站点', 'Create and maintain sites.'),
  ('services.manage', 'configuration', 'Manage services', '管理服务', 'Manage service and schema registries.'),
  ('settings.manage', 'settings', 'Manage settings', '管理设置', 'Manage platform settings.')
ON CONFLICT (key) DO NOTHING;

-- Role defaults. Admin receives the complete active permission catalog.
INSERT INTO role_permissions (role_id, permission_id, effect)
SELECT r.id, p.id, 'allow'
FROM roles r CROSS JOIN permissions p
WHERE r.key = 'admin' AND r.organization_id IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, effect)
SELECT r.id, p.id, 'allow'
FROM roles r JOIN permissions p ON p.key = ANY (CASE r.key
  WHEN 'volunteer' THEN ARRAY['records.create','records.edit_own','records.submit','records.view_own']::text[]
  WHEN 'operations_reviewer' THEN ARRAY['records.view','records.review','records.return','privacy.view','privacy.redact','privacy.resolve','safety.view','safety.resolve','ai.view_runs','ai.retry_run','ai.review_findings','ai.request_reclassification','analytics.view']::text[]
  WHEN 'research_lead' THEN ARRAY['records.view','records.view_approved','records.review','templates.view','templates.create','templates.edit','templates.publish','templates.archive','taxonomy.view','taxonomy.edit','taxonomy.approve_mapping','ai.view_runs','ai.review_findings','ai.request_reclassification','analytics.view','reports.view','reports.generate','reports.publish','chat.ask_collect','exports.create','exports.download','exports.research','services.manage','sites.manage']::text[]
  WHEN 'winston_research' THEN ARRAY['records.view_approved','analytics.view','reports.view','chat.ask_collect','exports.create','exports.download','exports.research']::text[]
  ELSE ARRAY[]::text[] END)
WHERE r.organization_id IS NULL AND r.key <> 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Preserve existing accounts: coordinator becomes Operations Reviewer.
INSERT INTO user_role_assignments (user_id, role_id, organization_id, status)
SELECT u.id, r.id, u.organization_id, 'active'
FROM users u
JOIN roles r ON r.organization_id IS NULL AND r.key = CASE u.role
  WHEN 'coordinator' THEN 'operations_reviewer'
  WHEN 'admin' THEN 'admin'
  ELSE 'volunteer'
END
WHERE NOT EXISTS (
  SELECT 1 FROM user_role_assignments ura
  WHERE ura.user_id = u.id AND ura.role_id = r.id AND ura.status = 'active'
);

-- Register every expanding business concept. Existing lookup rows are copied as v1 items.
INSERT INTO config_registries (key, name_en, name_zh, status)
VALUES
  ('service_type', 'Service types', '服务类型', 'active'),
  ('source_kind', 'Source kinds', '来源类型', 'active'),
  ('site_type', 'Site types', '站点类型', 'active'),
  ('population_type', 'Population types', '人群类型', 'active'),
  ('collection_field_type', 'Collection field types', '收集字段类型', 'active'),
  ('missing_reason', 'Missing reasons', '缺失原因', 'active'),
  ('concern_origin', 'Concern origins', '关注来源', 'active'),
  ('safety_flag_type', 'Safety flag types', '安全标记类型', 'active'),
  ('taxonomy_namespace', 'Taxonomy namespaces', '分类命名空间', 'active'),
  ('template_type', 'Template types', '模板类型', 'active'),
  ('ai_workflow_type', 'AI workflow types', 'AI 工作流类型', 'active'),
  ('report_type', 'Report types', '报告类型', 'active'),
  ('data_classification', 'Data classifications', '数据敏感级别', 'active')
ON CONFLICT (key) DO NOTHING;

INSERT INTO config_registry_items (registry_id, key, version, label_en, label_zh, status, sort_order, published_at)
SELECT cr.id, l.key, 1, l.name_en, l.name_zh, l.status, l.sort_order, now()
FROM lookups l
JOIN config_registries cr ON cr.key = l.category
ON CONFLICT (registry_id, key, version) DO NOTHING;

INSERT INTO config_registry_items (registry_id, key, version, label_en, label_zh, status, sort_order, published_at)
SELECT cr.id, seed.key, 1, seed.label_en, seed.label_zh, 'active', seed.sort_order, now()
FROM config_registries cr
JOIN (VALUES
  ('template_type','activity','Activity','活动',1),
  ('template_type','survey','Survey','问卷',2),
  ('template_type','interview','Interview','访谈',3),
  ('template_type','literature','Literature','文献',4),
  ('data_classification','aggregate_only','Aggregate only','仅聚合数据',1),
  ('data_classification','approved_evidence','Approved evidence','已批准证据',2),
  ('data_classification','approved_findings','Approved findings','已批准发现',3),
  ('data_classification','redacted_record','Redacted record','已脱敏记录',4),
  ('data_classification','raw_operational','Raw operational','原始运营数据',5),
  ('data_classification','restricted_pii','Restricted PII','受限个人信息',6),
  ('data_classification','research_approved','Research approved','已批准研究数据',7),
  ('ai_workflow_type','record_classification','Record classification','记录分类',1),
  ('ai_workflow_type','reclassification','Reclassification','重新分类',2),
  ('ai_workflow_type','custom_entry_mapping','Custom entry mapping','自定义条目映射',3),
  ('ai_workflow_type','report_generation','Report generation','报告生成',4),
  ('ai_workflow_type','ask_collect','Ask Collect','Ask Collect',5),
  ('report_type','signal_report','Signal report','信号报告',1)
) AS seed(registry_key,key,label_en,label_zh,sort_order) ON seed.registry_key = cr.key
ON CONFLICT (registry_id, key, version) DO NOTHING;

ALTER TABLE record_versions ADD COLUMN IF NOT EXISTS template_version_id uuid REFERENCES template_versions(id);
CREATE INDEX IF NOT EXISTS record_versions_template ON record_versions (template_version_id);

CREATE OR REPLACE FUNCTION prevent_published_template_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'published template versions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS template_versions_immutable ON template_versions;
CREATE TRIGGER template_versions_immutable BEFORE UPDATE OR DELETE ON template_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_published_template_mutation();

CREATE OR REPLACE FUNCTION prevent_submitted_record_version_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.is_snapshot = true THEN
    RAISE EXCEPTION 'submitted record versions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS record_versions_immutable ON record_versions;
CREATE TRIGGER record_versions_immutable BEFORE UPDATE OR DELETE ON record_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_submitted_record_version_mutation();

CREATE TABLE IF NOT EXISTS record_structured_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_version_id uuid NOT NULL REFERENCES record_versions(id),
  template_field_id uuid NOT NULL REFERENCES template_fields(id),
  option_id uuid NOT NULL REFERENCES template_field_options(id),
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS record_structured_selection_unique ON record_structured_selections (record_version_id, template_field_id, option_id);
CREATE INDEX IF NOT EXISTS record_structured_selections_field ON record_structured_selections (template_field_id);
CREATE INDEX IF NOT EXISTS record_structured_selections_option ON record_structured_selections (option_id);

CREATE TABLE IF NOT EXISTS record_custom_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_version_id uuid NOT NULL REFERENCES record_versions(id),
  template_field_id uuid NOT NULL REFERENCES template_fields(id),
  category_id uuid REFERENCES config_registry_items(id),
  custom_text text NOT NULL,
  mapping_status text NOT NULL DEFAULT 'pending',
  mapped_canonical_option_id uuid REFERENCES config_registry_items(id),
  reviewed_by_id uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS record_custom_entries_status_created ON record_custom_entries (mapping_status, created_at);
CREATE INDEX IF NOT EXISTS record_custom_entries_record_version ON record_custom_entries (record_version_id);
CREATE INDEX IF NOT EXISTS record_custom_entries_template_field ON record_custom_entries (template_field_id);

CREATE TABLE IF NOT EXISTS custom_entry_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custom_entry_id uuid NOT NULL REFERENCES record_custom_entries(id),
  reviewer_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL,
  mapped_canonical_option_id uuid REFERENCES config_registry_items(id),
  created_option_id uuid REFERENCES config_registry_items(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS custom_entry_reviews_entry ON custom_entry_reviews (custom_entry_id);

CREATE TABLE IF NOT EXISTS output_schema_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  schema jsonb NOT NULL,
  created_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS output_schema_key_version ON output_schema_versions (key, version);

CREATE TABLE IF NOT EXISTS ai_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_model_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_config_id uuid NOT NULL REFERENCES ai_provider_configs(id),
  key text NOT NULL,
  model_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_model_configs_provider_key ON ai_model_configs (provider_config_id, key);
CREATE INDEX IF NOT EXISTS ai_model_configs_status ON ai_model_configs (status);

CREATE TABLE IF NOT EXISTS ai_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name_en text NOT NULL,
  name_zh text NOT NULL,
  workflow_type_key text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  current_published_version_id uuid,
  created_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_workflows_type_status ON ai_workflows (workflow_type_key, status);

CREATE TABLE IF NOT EXISTS ai_workflow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES ai_workflows(id),
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  prompt_version_id uuid REFERENCES prompt_versions(id),
  output_schema_version_id uuid REFERENCES output_schema_versions(id),
  provider_config_id uuid REFERENCES ai_provider_configs(id),
  model_config_id uuid REFERENCES ai_model_configs(id),
  trigger_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  permitted_inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  privacy_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  retry_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_ceiling numeric,
  human_approval_required boolean NOT NULL DEFAULT true,
  feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  created_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_workflow_versions_workflow_version ON ai_workflow_versions (workflow_id, version);
CREATE INDEX IF NOT EXISTS ai_workflow_versions_status ON ai_workflow_versions (status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_workflows_current_published_version_fkey') THEN
    ALTER TABLE ai_workflows ADD CONSTRAINT ai_workflows_current_published_version_fkey
      FOREIGN KEY (current_published_version_id) REFERENCES ai_workflow_versions(id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION prevent_published_configuration_version_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'published' THEN RAISE EXCEPTION 'published configuration versions are immutable'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ai_workflow_versions_immutable ON ai_workflow_versions;
CREATE TRIGGER ai_workflow_versions_immutable BEFORE UPDATE OR DELETE ON ai_workflow_versions FOR EACH ROW EXECUTE FUNCTION prevent_published_configuration_version_mutation();

DROP INDEX IF EXISTS ai_runs_record_version;
ALTER TABLE ai_runs ALTER COLUMN record_version_id DROP NOT NULL;
ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS workflow_version_id uuid REFERENCES ai_workflow_versions(id);
ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS report_run_id uuid;
ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS parent_ai_run_id uuid;
ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS reviewer_instruction text;
ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS finished_at timestamptz;
ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;
ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS token_usage jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS cost_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS error_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES users(id);
CREATE INDEX IF NOT EXISTS ai_runs_record_version_created ON ai_runs (record_version_id, created_at);
CREATE INDEX IF NOT EXISTS ai_runs_parent ON ai_runs (parent_ai_run_id);
CREATE INDEX IF NOT EXISTS ai_runs_workflow_status ON ai_runs (workflow_version_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS ai_runs_idempotency ON ai_runs (idempotency_key);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_runs_parent_fkey') THEN
    ALTER TABLE ai_runs ADD CONSTRAINT ai_runs_parent_fkey FOREIGN KEY (parent_ai_run_id) REFERENCES ai_runs(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS finding_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_finding_id uuid NOT NULL REFERENCES ai_findings(id),
  reviewer_id uuid NOT NULL REFERENCES users(id),
  decision text NOT NULL,
  edited_statement text,
  canonical_registry_item_id uuid REFERENCES config_registry_items(id),
  reviewer_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finding_reviews_finding_created ON finding_reviews (ai_finding_id, created_at);

CREATE TABLE IF NOT EXISTS approved_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_finding_id uuid NOT NULL REFERENCES ai_findings(id),
  finding_review_id uuid NOT NULL REFERENCES finding_reviews(id),
  record_version_id uuid REFERENCES record_versions(id),
  finding_type text NOT NULL,
  approved_value jsonb NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  canonical_registry_item_id uuid REFERENCES config_registry_items(id),
  approved_by_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'approved',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS approved_findings_review ON approved_findings (finding_review_id);
CREATE INDEX IF NOT EXISTS approved_findings_record_type ON approved_findings (record_version_id, finding_type);
CREATE INDEX IF NOT EXISTS approved_findings_canonical ON approved_findings (canonical_registry_item_id);

CREATE TABLE IF NOT EXISTS privacy_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES records(id),
  record_version_id uuid NOT NULL REFERENCES record_versions(id),
  status text NOT NULL DEFAULT 'open',
  hits jsonb NOT NULL DEFAULT '[]'::jsonb,
  redacted_text text,
  resolution text,
  resolved_by_id uuid REFERENCES users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS privacy_flags_status_created ON privacy_flags (status, created_at);
CREATE INDEX IF NOT EXISTS privacy_flags_record_version ON privacy_flags (record_version_id);

ALTER TABLE safety_flags ADD COLUMN IF NOT EXISTS resolution text;
ALTER TABLE safety_flags ADD COLUMN IF NOT EXISTS resolution_notes text;
ALTER TABLE safety_flags ADD COLUMN IF NOT EXISTS resolved_by_id uuid REFERENCES users(id);
ALTER TABLE safety_flags ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
CREATE INDEX IF NOT EXISTS safety_flags_record ON safety_flags (record_id);

CREATE TABLE IF NOT EXISTS report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name_en text NOT NULL,
  name_zh text NOT NULL,
  report_type_key text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  current_published_version_id uuid,
  created_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_template_id uuid NOT NULL REFERENCES report_templates(id),
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  created_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS report_template_versions_template_version ON report_template_versions (report_template_id, version);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_templates_current_published_version_fkey') THEN
    ALTER TABLE report_templates ADD CONSTRAINT report_templates_current_published_version_fkey
      FOREIGN KEY (current_published_version_id) REFERENCES report_template_versions(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_template_version_id uuid NOT NULL REFERENCES report_template_versions(id),
  workflow_version_id uuid REFERENCES ai_workflow_versions(id),
  requested_by_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'queued',
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  error_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_runs_status_created ON report_runs (status, created_at);
CREATE INDEX IF NOT EXISTS report_runs_requester ON report_runs (requested_by_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_runs_report_run_fkey') THEN
    ALTER TABLE ai_runs ADD CONSTRAINT ai_runs_report_run_fkey FOREIGN KEY (report_run_id) REFERENCES report_runs(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_artifacts_report_run_fkey') THEN
    ALTER TABLE report_artifacts ADD CONSTRAINT report_artifacts_report_run_fkey FOREIGN KEY (report_run_id) REFERENCES report_runs(id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS report_template_versions_immutable ON report_template_versions;
CREATE TRIGGER report_template_versions_immutable BEFORE UPDATE OR DELETE ON report_template_versions FOR EACH ROW EXECUTE FUNCTION prevent_published_configuration_version_mutation();
