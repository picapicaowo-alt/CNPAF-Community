CREATE TABLE IF NOT EXISTS institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  institution_type_key text NOT NULL DEFAULT 'organization'
    CHECK (institution_type_key IN ('school', 'organization')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS institutions_org_name ON institutions (organization_id, name);
CREATE INDEX IF NOT EXISTS institutions_org_status_name ON institutions (organization_id, status, name);

ALTER TABLE user_affiliations
  ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES institutions(id);
CREATE INDEX IF NOT EXISTS user_affiliations_institution ON user_affiliations (institution_id);

INSERT INTO institutions (organization_id, name, institution_type_key, status)
SELECT DISTINCT organization_id, institution_name, 'organization', 'active'
FROM user_affiliations
WHERE organization_id IS NOT NULL AND btrim(institution_name) <> ''
ON CONFLICT (organization_id, name) DO NOTHING;

UPDATE user_affiliations affiliation
SET institution_id = institution.id
FROM institutions institution
WHERE affiliation.institution_id IS NULL
  AND affiliation.organization_id = institution.organization_id
  AND affiliation.institution_name = institution.name;

INSERT INTO config_registry_items (
  registry_id, key, version, label_en, label_zh, status, sort_order, metadata, published_at
)
SELECT registry.id, seed.item_key, 1, seed.label_en, seed.label_zh, 'active', seed.sort_order,
  '{"channels":["in_app","email"]}'::jsonb, now()
FROM config_registries registry
JOIN (VALUES
  ('group_membership_changed', 'Group membership changed', '人员分组已变更', 4),
  ('program_membership_changed', 'Program membership changed', '项目归属已变更', 5),
  ('access_changed', 'Role or access changed', '角色或权限已变更', 6),
  ('affiliation_changed', 'School or institution changed', '学校或机构归属已变更', 7)
) AS seed(item_key, label_en, label_zh, sort_order) ON true
WHERE registry.key = 'notification_kind'
ON CONFLICT (registry_id, key, version) DO UPDATE
SET label_en = EXCLUDED.label_en,
    label_zh = EXCLUDED.label_zh,
    metadata = EXCLUDED.metadata,
    updated_at = now();
