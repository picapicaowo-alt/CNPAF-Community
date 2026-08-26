-- Keep each persisted locale column single-language. Historical seed values
-- used "Chinese / English" and "English / Chinese" display strings, which
-- caused mixed-language UI even after the user changed locale.
UPDATE lookups
SET
  name_zh = btrim(split_part(name_zh, ' / ', 1)),
  name_en = btrim(split_part(name_en, ' / ', 1)),
  updated_at = now()
WHERE name_zh LIKE '% / %' OR name_en LIKE '% / %';

UPDATE config_registry_items
SET
  label_zh = btrim(split_part(label_zh, ' / ', 1)),
  label_en = btrim(split_part(label_en, ' / ', 1)),
  updated_at = now()
WHERE label_zh LIKE '% / %' OR label_en LIKE '% / %';

UPDATE canonical_themes
SET
  name_zh = btrim(split_part(name_zh, ' / ', 1)),
  name_en = btrim(split_part(name_en, ' / ', 1)),
  updated_at = now()
WHERE name_zh LIKE '% / %' OR name_en LIKE '% / %';

UPDATE activity_definitions
SET
  name_zh = btrim(split_part(name_zh, ' / ', 1)),
  name_en = btrim(split_part(name_en, ' / ', 1)),
  fields = (
    SELECT jsonb_agg(
      CASE WHEN field ? 'anchors' THEN
        jsonb_set(
          jsonb_set(
            jsonb_set(field, '{nameZh}', to_jsonb(btrim(split_part(field->>'nameZh', ' / ', 1)))),
            '{nameEn}',
            to_jsonb(btrim(split_part(field->>'nameEn', ' / ', 1)))
          ),
          '{anchors}',
          (
            SELECT jsonb_agg(
              jsonb_set(
                jsonb_set(anchor, '{zh}', to_jsonb(btrim(split_part(anchor->>'zh', ' / ', 1)))),
                '{en}',
                to_jsonb(btrim(split_part(anchor->>'en', ' / ', 1)))
              )
              ORDER BY anchor_ordinal
            )
            FROM jsonb_array_elements(field->'anchors') WITH ORDINALITY AS anchor_entries(anchor, anchor_ordinal)
          )
        )
      ELSE
        jsonb_set(
          jsonb_set(field, '{nameZh}', to_jsonb(btrim(split_part(field->>'nameZh', ' / ', 1)))),
          '{nameEn}',
          to_jsonb(btrim(split_part(field->>'nameEn', ' / ', 1)))
        )
      END
      ORDER BY ordinal
    )
    FROM jsonb_array_elements(fields) WITH ORDINALITY AS entries(field, ordinal)
  ),
  updated_at = now()
WHERE name_zh LIKE '% / %'
   OR name_en LIKE '% / %'
   OR fields::text LIKE '% / %';
