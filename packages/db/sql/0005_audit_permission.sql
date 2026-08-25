INSERT INTO permissions (key, module, name_en, name_zh, description)
VALUES ('audit.view', 'audit', 'View audit events', '查看审计事件', 'View access-control and sensitive-operation audit events within scope.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, effect)
SELECT r.id, p.id, 'allow'
FROM roles r JOIN permissions p ON p.key = 'audit.view'
WHERE r.key = 'admin' AND r.organization_id IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;
