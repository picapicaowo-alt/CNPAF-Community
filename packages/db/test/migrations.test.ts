import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { listSqlMigrations } from "./migration-test-utils";

test("legacy data migrates and immutable/versioning constraints are enforced", async () => {
  const db = new PGlite();
  try {
    // Seed the legacy fixture after migration 0001, then run every remaining
    // migration dynamically so adding a numbered SQL file automatically enters
    // this upgrade-path test.
    const sqlDirectory = new URL("../sql/", import.meta.url);
    await db.exec(await readFile(new URL("0001_init.sql", sqlDirectory), "utf8"));
    await db.exec(`
      INSERT INTO organizations (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Test Org');
      INSERT INTO users (id, email, name, password_hash, role, organization_id)
      VALUES ('00000000-0000-0000-0000-000000000002', 'legacy@example.org', 'Legacy Reviewer', 'hash', 'coordinator', '00000000-0000-0000-0000-000000000001');
      INSERT INTO sessions (user_id, token_hash, expires_at)
      VALUES ('00000000-0000-0000-0000-000000000002', 'session-hash', now() + interval '1 day');
    `);
    const files = await listSqlMigrations();
    for (const file of files.slice(1)) {
      await db.exec(await readFile(new URL(file, sqlDirectory), "utf8"));
    }

    const fieldTypes = await db.query<{ key: string; control: string }>(`
      SELECT item.key, item.metadata->>'control' AS control
      FROM config_registry_items item
      JOIN config_registries registry ON registry.id = item.registry_id
      WHERE registry.key = 'collection_field_type' AND item.status = 'active'
      ORDER BY item.sort_order
    `);
    assert.deepEqual(fieldTypes.rows, [
      { key: "short_text", control: "text" },
      { key: "long_text", control: "textarea" },
      { key: "number", control: "number" },
      { key: "date_time", control: "date" },
      { key: "single_select", control: "single" },
      { key: "multi_select", control: "multi" },
      { key: "boolean", control: "boolean" },
      { key: "rating_scale", control: "rating" },
      { key: "dropdown_choice", control: "dropdown" },
      { key: "information", control: "display" },
    ]);

    const sourcePolicies = await db.query<{ key: string; default_origin: string }>(`
      SELECT item.key, item.metadata->'policy'->>'defaultConcernOriginKey' AS default_origin
      FROM config_registry_items item
      JOIN config_registries registry ON registry.id = item.registry_id
      WHERE registry.key = 'source_kind' AND item.status = 'active'
      ORDER BY item.key
    `);
    assert.equal(sourcePolicies.rows.length, 4);
    assert.equal(sourcePolicies.rows.every((row) => Boolean(row.default_origin)), true);

    const role = await db.query<{ key: string }>(`SELECT r.key FROM user_role_assignments ura JOIN roles r ON r.id = ura.role_id WHERE ura.user_id = '00000000-0000-0000-0000-000000000002' AND ura.status = 'active'`);
    assert.deepEqual(role.rows.map((row) => row.key), ["operations_reviewer"]);
    const coordinatorPermissions = await db.query<{ key: string }>(`
      SELECT permission.key
      FROM role_permissions grant_row
      JOIN roles role ON role.id = grant_row.role_id
      JOIN permissions permission ON permission.id = grant_row.permission_id
      WHERE role.key = 'operations_reviewer'
        AND grant_row.effect = 'allow'
        AND permission.key IN (
          'programs.manage',
          'programs.manage_membership',
          'tasks.create',
          'locations.manage',
          'people.view',
          'templates.view',
          'templates.create',
          'templates.edit',
          'templates.publish',
          'templates.archive',
          'people.manage_groups'
        )
      ORDER BY permission.key
    `);
    assert.deepEqual(coordinatorPermissions.rows.map((row) => row.key), [
      "locations.manage",
      "people.manage_groups",
      "people.view",
      "programs.manage",
      "programs.manage_membership",
      "tasks.create",
      "templates.archive",
      "templates.create",
      "templates.edit",
      "templates.publish",
      "templates.view",
    ]);
    const answerTable = await db.query<{ exists: boolean }>(`
      SELECT to_regclass('record_field_answers') IS NOT NULL AS exists
    `);
    assert.equal(answerTable.rows[0]?.exists, true);
    const peopleGroupTables = await db.query<{ group_table: boolean; membership_table: boolean }>(`
      SELECT
        to_regclass('person_groups') IS NOT NULL AS group_table,
        to_regclass('person_group_memberships') IS NOT NULL AS membership_table
    `);
    assert.deepEqual(peopleGroupTables.rows[0], {
      group_table: true,
      membership_table: true,
    });
    const studentAffiliation = await db.query<{ count: number }>(`
      SELECT count(*)::int AS count
      FROM config_registry_items item
      JOIN config_registries registry ON registry.id = item.registry_id
      WHERE registry.key = 'affiliation_type'
        AND item.key = 'student'
        AND item.status = 'active'
    `);
    assert.equal(studentAffiliation.rows[0]?.count, 1);
    const locationAddressColumns = await db.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'sites'
        AND column_name IN ('city', 'state', 'country')
      ORDER BY column_name
    `);
    assert.deepEqual(locationAddressColumns.rows.map((row) => row.column_name), [
      "city",
      "country",
      "state",
    ]);
    const accountAvatarColumns = await db.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users'
        AND column_name IN ('avatar_storage_key', 'avatar_mime_type')
      ORDER BY column_name
    `);
    assert.deepEqual(accountAvatarColumns.rows.map((row) => row.column_name), [
      "avatar_mime_type",
      "avatar_storage_key",
    ]);
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
    const requestFingerprintColumns = await db.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_name = 'record_versions' AND column_name = 'request_fingerprint'`);
    assert.equal(requestFingerprintColumns.rows.length, 1);

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

    await db.exec(`
      INSERT INTO programs (id, organization_id, key, name_en, name_zh)
      VALUES ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', 'program-a', 'Program A', '项目 A');
      UPDATE programs SET status = 'completed' WHERE id = '00000000-0000-0000-0000-000000000040';
      INSERT INTO tasks (id, program_id, organization_id, template_version_id, task_type_key, title, created_by_id)
      VALUES ('00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000021', 'configured_task', 'Task A', '00000000-0000-0000-0000-000000000002');
      INSERT INTO task_assignments (id, task_id, assignee_id, assigned_by_id, status, declined_at, decline_reason)
      VALUES ('00000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'declined', now(), 'Schedule conflict');
      INSERT INTO users (id, email, name, password_hash, role, organization_id)
      VALUES ('00000000-0000-0000-0000-000000000045', 'collector@example.org', 'Collector', 'hash', 'volunteer', '00000000-0000-0000-0000-000000000001');
      INSERT INTO datasets (id, organization_id, name, created_by_id)
      VALUES ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000001', 'Dataset A', '00000000-0000-0000-0000-000000000002');
      INSERT INTO dataset_versions (id, dataset_id, version_number, status, content_hash, created_by_id)
      VALUES ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000041', 1, 'building', 'hash-a', '00000000-0000-0000-0000-000000000002');
      INSERT INTO dataset_records (dataset_version_id, record_id, record_version_id, ordinal)
      VALUES ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-000000000027', 0);
      UPDATE dataset_versions SET status = 'ready', record_count = 1 WHERE id = '00000000-0000-0000-0000-000000000042';
    `);
    const declinedAssignment = await db.query<{ status: string; decline_reason: string }>(`SELECT status, decline_reason FROM task_assignments WHERE id = '00000000-0000-0000-0000-000000000044'`);
    assert.deepEqual(declinedAssignment.rows[0], { status: "declined", decline_reason: "Schedule conflict" });
    await assert.rejects(
      () => db.exec(`INSERT INTO task_assignments (task_id, assignee_id, assigned_by_id, status) VALUES ('00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000000002', 'declined')`),
      /check constraint/i,
    );
    await assert.rejects(
      () => db.exec(`UPDATE dataset_records SET included_fields = '{"changed":true}' WHERE dataset_version_id = '00000000-0000-0000-0000-000000000042'`),
      /immutable/,
    );

    await db.exec(`
      INSERT INTO reports (id, organization_id, title, created_by_id)
      VALUES ('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000001', 'Report A', '00000000-0000-0000-0000-000000000002');
      INSERT INTO report_versions (id, report_id, version_number, title, status, created_by_id)
      VALUES ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000050', 1, 'Report A', 'draft', '00000000-0000-0000-0000-000000000002');
      INSERT INTO report_sections (id, report_version_id, section_key, title, content)
      VALUES ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000051', 'summary', 'Summary', 'Human text');
      UPDATE report_versions SET status = 'published', published_at = now() WHERE id = '00000000-0000-0000-0000-000000000051';
    `);
    await assert.rejects(
      () => db.exec(`UPDATE report_sections SET content = 'AI overwrite' WHERE id = '00000000-0000-0000-0000-000000000052'`),
      /immutable/,
    );
  } finally {
    await db.close();
  }
});
