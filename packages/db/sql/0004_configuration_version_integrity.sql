CREATE OR REPLACE FUNCTION protect_published_output_schema() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'published' AND (
    NEW.key IS DISTINCT FROM OLD.key OR
    NEW.version IS DISTINCT FROM OLD.version OR
    NEW.schema IS DISTINCT FROM OLD.schema
  ) THEN
    RAISE EXCEPTION 'published output schema versions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS output_schema_versions_immutable ON output_schema_versions;
CREATE TRIGGER output_schema_versions_immutable
  BEFORE UPDATE ON output_schema_versions
  FOR EACH ROW EXECUTE FUNCTION protect_published_output_schema();

CREATE OR REPLACE FUNCTION protect_active_prompt_content() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('active', 'archived') AND (
    NEW.version IS DISTINCT FROM OLD.version OR
    NEW.output_schema_version IS DISTINCT FROM OLD.output_schema_version OR
    NEW.system_prompt IS DISTINCT FROM OLD.system_prompt
  ) THEN
    RAISE EXCEPTION 'active or archived prompt version content is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prompt_versions_content_immutable ON prompt_versions;
CREATE TRIGGER prompt_versions_content_immutable
  BEFORE UPDATE ON prompt_versions
  FOR EACH ROW EXECUTE FUNCTION protect_active_prompt_content();
