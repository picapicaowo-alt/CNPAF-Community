-- Preserve every configured form answer as a typed, version-pinned snapshot.
-- Legacy qualitative/quantitative columns remain during the transition so
-- older records and exports continue to work.
CREATE TABLE IF NOT EXISTS record_field_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_version_id uuid NOT NULL REFERENCES record_versions(id),
  template_version_id uuid NOT NULL REFERENCES template_versions(id),
  template_section_id uuid NOT NULL REFERENCES template_sections(id),
  template_field_id uuid NOT NULL REFERENCES template_fields(id),
  section_key text NOT NULL,
  section_label_en text NOT NULL,
  section_label_zh text NOT NULL,
  section_sort_order integer NOT NULL DEFAULT 0,
  field_key text NOT NULL,
  field_sort_order integer NOT NULL DEFAULT 0,
  field_type_key text NOT NULL,
  label_en text NOT NULL,
  label_zh text NOT NULL,
  value jsonb,
  missing_reason_key text,
  custom_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS record_field_answers_version_field
  ON record_field_answers (record_version_id, template_field_id);
CREATE INDEX IF NOT EXISTS record_field_answers_record_version
  ON record_field_answers (record_version_id);
CREATE INDEX IF NOT EXISTS record_field_answers_template_field
  ON record_field_answers (template_version_id, field_key);
CREATE INDEX IF NOT EXISTS record_field_answers_missing_reason
  ON record_field_answers (missing_reason_key)
  WHERE missing_reason_key IS NOT NULL;
