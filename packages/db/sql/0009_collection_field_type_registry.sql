-- Collection form fields are configuration-driven. Runtime code stores the
-- selected registry key and reads control metadata from the pinned task
-- package instead of branching on compiled business labels.
INSERT INTO config_registry_items (
  registry_id, key, version, label_en, label_zh, status, sort_order, metadata, published_at
)
SELECT registry.id, seed.item_key, 1, seed.label_en, seed.label_zh, 'active', seed.sort_order, seed.metadata, now()
FROM config_registries registry
JOIN (VALUES
  ('short_text', 'Short text', '短文本', 1, '{"control":"text"}'::jsonb),
  ('long_text', 'Long text', '长文本', 2, '{"control":"textarea"}'::jsonb),
  ('number', 'Number', '数字', 3, '{"control":"number"}'::jsonb),
  ('date_time', 'Date and time', '日期与时间', 4, '{"control":"date"}'::jsonb),
  ('single_select', 'Single select', '单选', 5, '{"control":"single"}'::jsonb),
  ('multi_select', 'Multi select', '多选', 6, '{"control":"multi"}'::jsonb),
  ('boolean', 'Yes or no', '是或否', 7, '{"control":"boolean"}'::jsonb)
) AS seed(item_key, label_en, label_zh, sort_order, metadata)
  ON registry.key = 'collection_field_type'
ON CONFLICT (registry_id, key, version) DO NOTHING;
