import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("legacy data migrates and immutable/versioning constraints are enforced", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile(new URL("../sql/0001_init.sql", import.meta.url), "utf8"));
    await db.exec(`
      INSERT INTO organizations (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Test Org');
      INSERT INTO users (id, email, name, password_hash, role, organization_id)
      VALUES ('00000000-0000-0000-0000-000000000002', 'legacy@example.org', 'Legacy Reviewer', 'hash', 'coordinator', '00000000-0000-0000-0000-000000000001');
      INSERT INTO sessions (user_id, token_hash, expires_at)
      VALUES ('00000000-0000-0000-0000-000000000002', 'session-hash', now() + interval '1 day');
    `);
    await db.exec(await readFile(new URL("../sql/0002_backend_platform.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../sql/0003_record_template_integrity.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../sql/0004_configuration_version_integrity.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../sql/0005_audit_permission.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../sql/0006_record_occurrence_time.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../sql/0007_ai_output_schema_provenance.sql", import.meta.url), "utf8"));

    const role = await db.query<{ key: string }>(`SELECT r.key FROM user_role_assignments ura JOIN roles r ON r.id = ura.role_id WHERE ura.user_id = '00000000-0000-0000-0000-000000000002' AND ura.status = 'active'`);
    assert.deepEqual(role.rows.map((row) => row.key), ["operations_reviewer"]);
    const session = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM sessions WHERE token_hash = 'session-hash'`);
    assert.equal(session.rows[0]?.n, 1);

    await db.exec(`
      INSERT INTO templates (id, key, template_type_key) VALUES ('00000000-0000-0000-0000-000000000010', 'published-test', 'activity');
      INSERT INTO template_versions (id, template_id, version, status, name_en, name_zh)
      VALUES ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000010', 1, 'published', 'Published', '已发布');
    `);
    await assert.rejects(() => db.exec(`INSERT INTO template_sections (template_version_id, key, label_en, label_zh) VALUES ('00000000-0000-0000-0000-000000000011', 'late', 'Late', '过晚')`), /immutable/);

    await db.exec(`
      INSERT INTO templates (id, key, template_type_key) VALUES ('00000000-0000-0000-0000-000000000020', 'record-test', 'literature');
      INSERT INTO template_versions (id, template_id, version, status, name_en, name_zh)
      VALUES ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000020', 1, 'draft', 'Record', '记录');
      INSERT INTO template_sections (id, template_version_id, key, label_en, label_zh)
      VALUES ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000021', 'section', 'Section', '部分');
      INSERT INTO template_fields (id, template_section_id, key, field_type_key, label_en, label_zh, allow_custom_entry)
      VALUES ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000022', 'field', 'multi_select', 'Field', '字段', true);
      INSERT INTO template_field_options (id, template_field_id, key, label_en, label_zh)
      VALUES ('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000023', 'option', 'Option', '选项');
      UPDATE template_versions SET status = 'published' WHERE id = '00000000-0000-0000-0000-000000000021';
      INSERT INTO records (id, client_record_id, source_kind, created_by_id)
      VALUES ('00000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-000000000026', 'literature', '00000000-0000-0000-0000-000000000002');
      INSERT INTO record_versions (id, record_id, version_number, template_version_id, occurred_at, is_snapshot)
      VALUES ('00000000-0000-0000-0000-000000000027', '00000000-0000-0000-0000-000000000025', 1, '00000000-0000-0000-0000-000000000021', '2026-01-02T03:04:05Z', false);
      INSERT INTO record_structured_selections (id, record_version_id, template_field_id, option_id)
      VALUES ('00000000-0000-0000-0000-000000000028', '00000000-0000-0000-0000-000000000027', '00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000024');
      INSERT INTO record_custom_entries (id, record_version_id, template_field_id, custom_text)
      VALUES ('00000000-0000-0000-0000-000000000029', '00000000-0000-0000-0000-000000000027', '00000000-0000-0000-0000-000000000023', 'Original text');
      UPDATE record_versions SET is_snapshot = true WHERE id = '00000000-0000-0000-0000-000000000027';
      UPDATE record_custom_entries SET mapping_status = 'keep_free_text' WHERE id = '00000000-0000-0000-0000-000000000029';
    `);
    await assert.rejects(() => db.exec(`UPDATE record_structured_selections SET value = '{"changed":true}' WHERE id = '00000000-0000-0000-0000-000000000028'`), /immutable/);
    await assert.rejects(() => db.exec(`UPDATE record_custom_entries SET custom_text = 'Changed text' WHERE id = '00000000-0000-0000-0000-000000000029'`), /immutable/);
    const occurrence = await db.query<{ occurred_at: Date }>(`SELECT occurred_at FROM record_versions WHERE id = '00000000-0000-0000-0000-000000000027'`);
    assert.equal(new Date(occurrence.rows[0]!.occurred_at).toISOString(), "2026-01-02T03:04:05.000Z");
    await assert.rejects(() => db.exec(`UPDATE record_versions SET occurred_at = '2026-01-03T03:04:05Z' WHERE id = '00000000-0000-0000-0000-000000000027'`), /immutable/);
    const aiRunColumns = await db.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_runs' AND column_name = 'output_schema_version_id'`);
    assert.equal(aiRunColumns.rows.length, 1);

    await db.exec(`
      INSERT INTO output_schema_versions (id, key, version, status, schema)
      VALUES ('00000000-0000-0000-0000-000000000030', 'test_schema', 1, 'published', '{"type":"object"}');
      INSERT INTO prompt_versions (id, version, status, output_schema_version, system_prompt)
      VALUES ('00000000-0000-0000-0000-000000000031', 99, 'active', 'test_schema@1', 'Original prompt');
      UPDATE prompt_versions SET status = 'archived' WHERE id = '00000000-0000-0000-0000-000000000031';
    `);
    await assert.rejects(() => db.exec(`UPDATE output_schema_versions SET schema = '{"type":"array"}' WHERE id = '00000000-0000-0000-0000-000000000030'`), /immutable/);
    await assert.rejects(() => db.exec(`UPDATE prompt_versions SET system_prompt = 'Changed prompt' WHERE id = '00000000-0000-0000-0000-000000000031'`), /immutable/);

    await db.exec(`INSERT INTO jobs (kind, idempotency_key) VALUES ('a', NULL), ('b', NULL), ('c', 'same-key')`);
    await assert.rejects(() => db.exec(`INSERT INTO jobs (kind, idempotency_key) VALUES ('d', 'same-key')`), /unique|duplicate/i);
  } finally {
    await db.close();
  }
});
