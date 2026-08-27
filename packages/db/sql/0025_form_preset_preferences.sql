CREATE TABLE form_preset_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key text NOT NULL,
  organization_id uuid REFERENCES organizations(id),
  preset_key text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  replacement_template_id uuid REFERENCES templates(id),
  updated_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX form_preset_preferences_scope_preset
  ON form_preset_preferences(scope_key, preset_key);
CREATE INDEX form_preset_preferences_organization
  ON form_preset_preferences(organization_id);
