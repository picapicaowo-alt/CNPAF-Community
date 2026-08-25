-- Coordinators need an end-to-end operational path: create a draft form,
-- configure it, then publish it for tasks and quick capture.
INSERT INTO role_permissions (role_id, permission_id, effect)
SELECT role.id, permission.id, 'allow'
FROM roles role
JOIN permissions permission ON permission.key = ANY (ARRAY[
  'templates.create',
  'templates.edit',
  'templates.publish'
]::text[])
WHERE role.key = 'operations_reviewer'
  AND role.organization_id IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE
SET effect = 'allow';
