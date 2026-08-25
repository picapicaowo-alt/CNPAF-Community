-- Keep location addresses useful to staff without requiring GIS coordinates.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS country text;

-- Preserve the old region value as a best-effort city during the transition.
UPDATE sites
SET city = region
WHERE city IS NULL AND region IS NOT NULL AND btrim(region) <> '';

-- Operations reviewers can safely remove forms from active use. The application
-- archives the form so published versions and task history remain traceable.
INSERT INTO role_permissions (role_id, permission_id, effect)
SELECT role.id, permission.id, 'allow'
FROM roles role
JOIN permissions permission ON permission.key = 'templates.archive'
WHERE role.key = 'operations_reviewer'
  AND role.organization_id IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE
SET effect = 'allow';
