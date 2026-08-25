-- Operations coordinators own the day-to-day collection workflow. The role
-- must be able to prepare the program/location prerequisites, inspect the
-- published form, create the task, and assign active program members.
INSERT INTO role_permissions (role_id, permission_id, effect)
SELECT role.id, permission.id, 'allow'
FROM roles role
JOIN permissions permission ON permission.key = ANY (ARRAY[
  'programs.manage',
  'programs.manage_membership',
  'tasks.create',
  'locations.manage',
  'people.view',
  'templates.view'
]::text[])
WHERE role.key = 'operations_reviewer'
  AND role.organization_id IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE
SET effect = 'allow';

INSERT INTO config_registry_items (
  registry_id, key, version, label_en, label_zh, status, sort_order, metadata, published_at
)
SELECT registry.id, seed.item_key, 1, seed.label_en, seed.label_zh, 'active', seed.sort_order, '{"channels":["in_app"]}'::jsonb, now()
FROM config_registries registry
JOIN (VALUES
  ('task_reassigned', 'Task reassigned', '任务已重新分配', 2),
  ('record_needs_completion', 'Submission needs completion', '提交需要补充', 3),
  ('record_approved', 'Submission approved', '提交已批准', 4)
) AS seed(item_key, label_en, label_zh, sort_order) ON true
WHERE registry.key = 'notification_kind'
ON CONFLICT (registry_id, key, version) DO NOTHING;
