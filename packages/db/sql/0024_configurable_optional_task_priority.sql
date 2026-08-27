BEGIN;

INSERT INTO config_registries (
  key,
  name_en,
  name_zh,
  description,
  status
)
VALUES (
  'priority_level',
  'Priority levels',
  '优先级',
  'Optional priority choices shared by task workflows.',
  'active'
)
ON CONFLICT (key) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_zh = EXCLUDED.name_zh,
  description = EXCLUDED.description,
  status = 'active',
  updated_at = now();

INSERT INTO config_registry_items (
  registry_id,
  key,
  version,
  label_en,
  label_zh,
  help_text_en,
  help_text_zh,
  status,
  sort_order,
  metadata,
  published_at
)
SELECT
  registry.id,
  item.key,
  1,
  item.label_en,
  item.label_zh,
  item.help_text_en,
  item.help_text_zh,
  'active',
  item.sort_order,
  '{}'::jsonb,
  now()
FROM config_registries registry
CROSS JOIN (
  VALUES
    ('low', 'Low', '低', 'Lower than normal urgency.', '低于一般紧迫程度。', 10),
    ('medium', 'Medium', '中', 'Normal urgency when a priority is needed.', '需要标注优先级时的一般紧迫程度。', 20),
    ('high', 'High', '高', 'Requires earlier attention than normal work.', '需要比一般工作更早处理。', 30)
) AS item(key, label_en, label_zh, help_text_en, help_text_zh, sort_order)
WHERE registry.key = 'priority_level'
ON CONFLICT (registry_id, key, version) DO NOTHING;

ALTER TABLE tasks
  ALTER COLUMN priority DROP DEFAULT,
  ALTER COLUMN priority DROP NOT NULL,
  ALTER COLUMN priority TYPE text
  USING CASE
    WHEN priority > 0 THEN 'high'
    WHEN priority < 0 THEN 'low'
    ELSE NULL
  END;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_priority_key_format
  CHECK (priority IS NULL OR priority ~ '^[a-z][a-z0-9_.-]{0,159}$');

COMMIT;
