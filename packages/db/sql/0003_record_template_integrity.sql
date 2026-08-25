CREATE OR REPLACE FUNCTION protect_snapshot_template_data() RETURNS trigger AS $$
DECLARE
  snapshot boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT is_snapshot INTO snapshot FROM record_versions WHERE id = OLD.record_version_id;
  ELSE
    SELECT is_snapshot INTO snapshot FROM record_versions WHERE id = NEW.record_version_id;
  END IF;
  IF snapshot THEN RAISE EXCEPTION 'structured data on submitted record versions is immutable'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS record_structured_selections_snapshot_immutable ON record_structured_selections;
CREATE TRIGGER record_structured_selections_snapshot_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON record_structured_selections
  FOR EACH ROW EXECUTE FUNCTION protect_snapshot_template_data();

CREATE OR REPLACE FUNCTION protect_snapshot_custom_entry_source() RETURNS trigger AS $$
DECLARE
  snapshot boolean;
  version_id uuid;
BEGIN
  version_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.record_version_id ELSE NEW.record_version_id END;
  SELECT is_snapshot INTO snapshot FROM record_versions WHERE id = version_id;
  IF snapshot AND TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'custom entry source data on submitted record versions is immutable';
  END IF;
  IF snapshot AND (
    NEW.record_version_id IS DISTINCT FROM OLD.record_version_id OR
    NEW.template_field_id IS DISTINCT FROM OLD.template_field_id OR
    NEW.category_id IS DISTINCT FROM OLD.category_id OR
    NEW.custom_text IS DISTINCT FROM OLD.custom_text
  ) THEN
    RAISE EXCEPTION 'custom entry source data on submitted record versions is immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS record_custom_entries_snapshot_source_immutable ON record_custom_entries;
CREATE TRIGGER record_custom_entries_snapshot_source_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON record_custom_entries
  FOR EACH ROW EXECUTE FUNCTION protect_snapshot_custom_entry_source();
