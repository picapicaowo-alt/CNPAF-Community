CREATE TABLE IF NOT EXISTS notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  kind_key text NOT NULL,
  title_template text NOT NULL,
  body_template text NOT NULL,
  email_subject_template text NOT NULL,
  action_label_template text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  updated_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS notification_templates_org_kind
  ON notification_templates (organization_id, kind_key);
CREATE INDEX IF NOT EXISTS notification_templates_org_status
  ON notification_templates (organization_id, status);

CREATE TABLE IF NOT EXISTS account_action_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  purpose text NOT NULL CHECK (purpose IN ('onboarding', 'password_reset')),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  requested_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS account_action_tokens_hash
  ON account_action_tokens (token_hash);
CREATE INDEX IF NOT EXISTS account_action_tokens_user_purpose_created
  ON account_action_tokens (user_id, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS account_action_tokens_expiry
  ON account_action_tokens (expires_at) WHERE used_at IS NULL;

INSERT INTO permissions (key, module, name_en, name_zh, description, status)
VALUES (
  'notifications.manage_templates',
  'notifications',
  'Manage notification templates',
  '管理通知模板',
  'Customize organization-level in-app and email messages for system events.',
  'active'
)
ON CONFLICT (key) DO UPDATE
SET name_en = EXCLUDED.name_en,
    name_zh = EXCLUDED.name_zh,
    description = EXCLUDED.description,
    status = 'active',
    updated_at = now();

INSERT INTO role_permissions (role_id, permission_id, effect)
SELECT role.id, permission.id, 'allow'
FROM roles role
JOIN permissions permission ON permission.key = 'notifications.manage_templates'
WHERE role.key = 'admin' AND role.status = 'active'
ON CONFLICT (role_id, permission_id) DO UPDATE SET effect = 'allow';

INSERT INTO config_registry_items (
  registry_id, key, version, label_en, label_zh, status, sort_order, metadata, published_at
)
SELECT registry.id, seed.item_key, 1, seed.label_en, seed.label_zh, 'active', seed.sort_order,
  '{"channels":["in_app","email"]}'::jsonb, now()
FROM config_registries registry
JOIN (VALUES
  ('account_onboarding', 'Account onboarding', '账号入职欢迎', 8),
  ('password_reset_requested', 'Password reset requested', '密码重置请求', 9)
) AS seed(item_key, label_en, label_zh, sort_order) ON true
WHERE registry.key = 'notification_kind'
ON CONFLICT (registry_id, key, version) DO UPDATE
SET label_en = EXCLUDED.label_en,
    label_zh = EXCLUDED.label_zh,
    metadata = EXCLUDED.metadata,
    updated_at = now();
