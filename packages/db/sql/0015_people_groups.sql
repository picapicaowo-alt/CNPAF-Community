-- Organization-scoped, reusable groups for assigning and filtering people.
-- Department/school remains affiliation metadata; a person may belong to
-- multiple groups and groups may intentionally span departments.
CREATE TABLE IF NOT EXISTS person_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  key text NOT NULL,
  name_en text NOT NULL,
  name_zh text NOT NULL,
  description_en text,
  description_zh text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS person_groups_org_key
  ON person_groups (organization_id, key);
CREATE INDEX IF NOT EXISTS person_groups_org_status
  ON person_groups (organization_id, status, name_en);

CREATE TABLE IF NOT EXISTS person_group_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES person_groups(id),
  user_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  added_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS person_group_memberships_group_user
  ON person_group_memberships (group_id, user_id);
CREATE INDEX IF NOT EXISTS person_group_memberships_user_status
  ON person_group_memberships (user_id, status);
CREATE INDEX IF NOT EXISTS person_group_memberships_group_status
  ON person_group_memberships (group_id, status);

INSERT INTO permissions (key, module, name_en, name_zh, description)
VALUES (
  'people.manage_groups',
  'people',
  'Manage people groups',
  '管理人员分组',
  'Create reusable groups and manage cross-department group membership.'
)
ON CONFLICT (key) DO UPDATE SET
  module = EXCLUDED.module,
  name_en = EXCLUDED.name_en,
  name_zh = EXCLUDED.name_zh,
  description = EXCLUDED.description,
  status = 'active';

INSERT INTO role_permissions (role_id, permission_id, effect)
SELECT role.id, permission.id, 'allow'
FROM roles role
JOIN permissions permission ON permission.key = 'people.manage_groups'
WHERE role.organization_id IS NULL
  AND role.key IN ('admin', 'operations_reviewer')
ON CONFLICT (role_id, permission_id) DO UPDATE SET effect = 'allow';

INSERT INTO config_registry_items (
  registry_id, key, version, label_en, label_zh, status, sort_order, metadata, published_at
)
SELECT registry.id, 'student', 1, 'Student', '学生', 'active', 6, '{}'::jsonb, now()
FROM config_registries registry
WHERE registry.key = 'affiliation_type'
ON CONFLICT (registry_id, key, version) DO NOTHING;
