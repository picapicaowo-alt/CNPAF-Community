-- Reviewers may point a correction request at exact fields. The identifiers
-- refer to the version-pinned template fields captured with the submission.
ALTER TABLE review_decisions
  ADD COLUMN IF NOT EXISTS correction_field_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
