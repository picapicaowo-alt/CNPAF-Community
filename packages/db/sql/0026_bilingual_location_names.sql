-- Canonical locations need an explicit name for each supported interface
-- language. Existing single-language names remain available in the legacy
-- column and are copied only into the locale they can be identified as.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS name_zh text;

UPDATE sites
SET name_zh = name
WHERE name_zh IS NULL AND name ~ '[一-龥]';

UPDATE sites
SET name_en = name
WHERE name_en IS NULL AND name !~ '[一-龥]';

CREATE INDEX IF NOT EXISTS sites_name_en ON sites (name_en);
CREATE INDEX IF NOT EXISTS sites_name_zh ON sites (name_zh);

-- Existing draft forms with the explicit immediate-safety question should
-- receive the new runtime alert without requiring the author to recreate it.
-- Published versions remain immutable and can opt in through a new draft.
UPDATE template_fields AS field
SET
  configuration = jsonb_set(
    COALESCE(field.configuration, '{}'::jsonb),
    '{safetyAlert}',
    '{"enabled":true,"triggerValues":[true]}'::jsonb,
    true
  ),
  updated_at = now()
FROM template_sections AS section
JOIN template_versions AS version ON version.id = section.template_version_id
WHERE field.template_section_id = section.id
  AND version.status = 'draft'
  AND field.field_type_key = 'boolean'
  AND (
    field.label_zh ~ '(立即|立刻).*(安全|危险)' OR
    lower(field.label_en) ~ '(immediate danger|immediate safety)'
  );
