# Local → S3 storage migration runbook

Status: executable, fail-closed, and safe to rerun. The database keeps backend-
neutral `storage_key` values; switching storage does not rewrite entity IDs or
public routes.

## Preconditions

1. Apply migration `0018` and take a database backup.
2. Keep `STORAGE_BACKEND=local` while inventory/backfill/verification run.
3. Configure credentials outside source control (prefer an EC2/ECS role) and
   set `S3_MIGRATION_BUCKET`, `S3_MIGRATION_REGION`, and
   `S3_MIGRATION_PREFIX`. The migration prefix must be the intended final
   application prefix unless a separately verified server-side copy is planned.
4. Keep the local upload directory writable until the final delta backfill,
   then read-only for the rollback window.

## 1. Inventory and immutable manifest

```bash
npm run db:migrate
npm run storage:migrate -- manifest
```

The command inventories attachments, export artifacts and avatar references,
plus unreferenced local objects. It writes an ignored local manifest containing
storage key, byte size, SHA-256 and database references and creates a matching
database ledger run. A manifest is never overwritten; use a new path with
`--manifest` for a new run.

Stop if `missingLocal` is non-zero. Resolve the database reference or restore
the object before uploading.

## 2. Idempotent bounded backfill

```bash
npm run storage:migrate -- backfill
```

`STORAGE_MIGRATION_BATCH_SIZE` controls the bounded checkpoint batch. Before
each upload, the command re-hashes the local object and refuses objects changed
since inventory. Existing S3 objects are skipped only when byte size and the
stored SHA-256 metadata match. Errors are stored per object and a rerun resumes
from the same manifest.

## 3. Full streamed verification

```bash
npm run storage:migrate -- verify
npm run storage:migrate -- cutover-check
```

Verification downloads every S3 object as a stream and compares both byte
length and SHA-256. `cutover-check` returns `ready: true` only when there are no
missing local references, failed objects or unverified ledger rows. Treat every
other result as a hard stop.

## 4. Delta, switch, and compatibility window

1. Temporarily stop uploads or place the application in a controlled write
   window.
2. Generate a fresh manifest and repeat backfill, verification and cutover
   check for the delta.
3. Set `STORAGE_BACKEND=s3`, `S3_BUCKET`, `S3_REGION`, and `S3_PREFIX` to the
   verified target. Set `STORAGE_FALLBACK_LOCAL_DIR` to the absolute read-only
   local source directory for the time-bounded rollback window.
4. Deploy and exercise avatar, attachment and export reads plus one new upload.
   Monitor S3 404/checksum/application errors. New writes go only to S3; local
   fallback is read-only and is never treated as proof that backfill succeeded.

## 5. Rollback and finalization

If the S3 read/write smoke test fails, restore `STORAGE_BACKEND=local` and the
previous deployment configuration; database storage keys remain compatible.
Record the failed migration run and do not delete S3 or local objects during
diagnosis.

After the approved rollback window and a restore drill, remove
`STORAGE_FALLBACK_LOCAL_DIR`. Local deletion is a separate retention operation
requiring explicit approval; this migration tool never deletes source data.
