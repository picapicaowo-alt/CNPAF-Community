-- P1 form controls extend the same configuration registry used by every
-- published form package. Stable keys are persisted; bilingual labels remain
-- editable registry metadata.
INSERT INTO config_registry_items (
  registry_id, key, version, label_en, label_zh, status, sort_order, metadata, published_at
)
SELECT registry.id, seed.item_key, 1, seed.label_en, seed.label_zh, 'active', seed.sort_order, seed.metadata, now()
FROM config_registries registry
JOIN (VALUES
  ('rating_scale', 'Rating scale', '评分量表', 8, '{"control":"rating"}'::jsonb),
  ('dropdown_choice', 'Dropdown', '下拉选择', 9, '{"control":"dropdown"}'::jsonb),
  ('information', 'Information text', '说明文字', 10, '{"control":"display"}'::jsonb)
) AS seed(item_key, label_en, label_zh, sort_order, metadata)
  ON registry.key = 'collection_field_type'
ON CONFLICT (registry_id, key, version) DO NOTHING;
