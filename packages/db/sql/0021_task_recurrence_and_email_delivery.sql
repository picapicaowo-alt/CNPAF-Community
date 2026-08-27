CREATE TABLE IF NOT EXISTS task_recurrence_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_task_id uuid NOT NULL REFERENCES tasks(id),
  frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  interval integer NOT NULL DEFAULT 1 CHECK (interval BETWEEN 1 AND 52),
  timezone text NOT NULL,
  next_occurrence_at timestamptz NOT NULL,
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  generated_count integer NOT NULL DEFAULT 1 CHECK (generated_count >= 1),
  created_by_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS task_recurrence_series_template ON task_recurrence_series (template_task_id);
CREATE INDEX IF NOT EXISTS task_recurrence_series_status_next ON task_recurrence_series (status, next_occurrence_at);

CREATE TABLE IF NOT EXISTS task_recurrence_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id uuid NOT NULL REFERENCES task_recurrence_series(id),
  task_id uuid NOT NULL REFERENCES tasks(id),
  scheduled_for timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS task_recurrence_occurrences_series_time ON task_recurrence_occurrences (series_id, scheduled_for);
CREATE UNIQUE INDEX IF NOT EXISTS task_recurrence_occurrences_task ON task_recurrence_occurrences (task_id);

CREATE TABLE IF NOT EXISTS notification_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id),
  provider text NOT NULL,
  recipient_email text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS notification_email_deliveries_notification ON notification_email_deliveries (notification_id);
CREATE INDEX IF NOT EXISTS notification_email_deliveries_status_created ON notification_email_deliveries (status, created_at);

INSERT INTO config_registry_items (
  registry_id, key, version, label_en, label_zh, status, sort_order, metadata, published_at
)
SELECT registry.id, seed.item_key, 1, seed.label_en, seed.label_zh, 'active', seed.sort_order,
  '{"channels":["in_app","email"]}'::jsonb, now()
FROM config_registries registry
JOIN (VALUES
  ('task_reminder', 'Task reminder', '任务提醒', 2),
  ('task_reassigned', 'Task reassigned', '任务已重新分配', 3)
) AS seed(item_key, label_en, label_zh, sort_order) ON true
WHERE registry.key = 'notification_kind'
ON CONFLICT (registry_id, key, version) DO UPDATE
SET metadata = EXCLUDED.metadata,
    updated_at = now();

UPDATE config_registry_items item
SET metadata = jsonb_set(COALESCE(item.metadata, '{}'::jsonb), '{channels}', '["in_app","email"]'::jsonb, true),
    updated_at = now()
FROM config_registries registry
WHERE item.registry_id = registry.id
  AND registry.key = 'notification_kind'
  AND item.key = 'task_assigned';
