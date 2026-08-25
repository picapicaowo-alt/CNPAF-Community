# Records → Dataset → Report → Rating roadmap

Status date: 2026-08-24. Dataset governance, Dataset Version → initial Report
Version provenance, and executable Local → S3 migration controls are now
implemented in the local integration set. Commercial Rating Version methodology
and entitlement remain planned.

## Product chain and source of truth

```text
Authorized Records
  └─> canonical evidence filters + keyword/current-result selection
        └─> Dataset definition
              └─> immutable Dataset Version (exact Record Versions)
                    └─> initial Report Version + source citations
                          └─> human review / methodology checks
                                └─> published Report / Rating product
```

Records is the primary evidence workspace. Program, Form Version, Location,
Collector, evidence date, review state, Research Use, Service/source,
Population, Finding Type, Theme/Concern, and source-origin filters must first
narrow the Records list. Selection, “select current result,” Dataset creation,
and later report generation must consume that same result definition; a screen
must not display one population while freezing or reporting another.

A Dataset Version is the reproducibility boundary. Reports and ratings must cite
its frozen `recordId + recordVersionId` pairs, filter definition, field policy,
record count, and content hash. A corrected Record or refreshed Dataset produces
a new downstream version; it never silently rewrites a report already sold or
published.

## Implemented: Dataset governance UI

Build one Dataset detail route around the existing immutable backend model:

1. Overview: owner organization/program, classification, status, selection
   definition, field policy, head version, counts, hash, creator, and timestamps.
2. Version history: version number, frozen records, creation reason, hash, and
   deterministic CSV/JSON download for every retained version.
3. Sharing: create an expiring recipient-scoped share, display the bearer token
   once, list active/expired/revoked grants, and show access history.
4. Revocation: require confirmation, revoke atomically, and retain audit history.
5. Archive: remove the Dataset from active workflows without deleting frozen
   versions, shares, access logs, citations, or audit events.
6. Report handoff: start an initial report from a chosen Dataset Version, never
   from an unversioned live query.

Permissions remain separate (`datasets.download`, `datasets.share`,
`datasets.refresh`, `datasets.create`, `datasets.archive`). The UI can hide unavailable actions, but
the API rechecks permission, current Record scope, privacy state, and Research
Use on every download/share operation.

## Implemented handoff; next phase: commercial ratings

The initial-report handoff stores a direct foreign key from Report Version to
Dataset Version, copies approved evidence citations with the frozen
`recordId + recordVersionId`, and preserves the source when a new report draft
version is created. Report section structure remains author-configurable.

- Merge evidence by stable Record/field/finding identifiers, not translated
  labels. Preserve disagreements and missing data instead of collapsing them.
- Pin report template, methodology, rating rubric, AI workflow/model/prompt, and
  Dataset Version. Store their version IDs with the Report Version.
- Generate source-backed draft sections with citations to frozen evidence.
  Model output is untrusted and cannot publish or assign a sellable rating.
- Require named human review, methodology/quality checks, conflict-of-interest
  disclosure, and an explicit publish transition.
- Publish immutable Report/Rating versions with correction/supersession links,
  entitlement/access rules, and an audit trail suitable for customer disputes.
- Keep rating dimensions, thresholds, weights, labels, and sale/entitlement
  policies in versioned database configuration. Do not hardcode them in React,
  Route Handlers, prompts, or deployment files.

## Local attachment storage → S3 migration

The migration belongs to the existing Database and Backend branches; it is not a
fifth long-lived repository or module branch.

1. **Inventory:** emit a resumable manifest for every local object containing
   entity/reference ID, current storage key, byte length, media type, SHA-256,
   and inventory timestamp. Report missing files and duplicate references before
   upload.
2. **Upload/backfill:** copy idempotently to an S3 staging namespace using the
   typed storage configuration. Persist destination key, size, checksum, and
   migration checkpoint in bounded batches; never store credentials in the DB,
   manifest, source code, or logs.
3. **Verify:** compare manifest count/bytes/checksums with S3 metadata and a full
   streamed checksum before declaring an object migrated. Produce zero-mismatch
   and zero-unresolved-reference reports.
4. **Compatibility window:** deploy S3 writes plus local/S3 dual-read fallback,
   monitor misses and checksum failures, then backfill objects created during
   migration. If dual-write is used, make it explicit and time-bounded.
5. **Switch:** change `STORAGE_BACKEND` only after reconciliation passes; keep
   the local source read-only during the rollback window. Switching providers
   must not change database entity IDs or public API URLs.
6. **Finalize/rollback:** record the cutover, retain manifests and audit logs,
   test restore/rollback, and remove local copies only through a separately
   approved retention operation.

Required operator outputs are: inventory manifest, upload checkpoint, checksum
reconciliation, database-reference reconciliation, cutover decision, and
rollback result. Each output must be reproducible and safe to rerun.

The executable workflow and rollback order are documented in
`docs/storage-migration-runbook.md`; migration state is held in
`storage_migration_runs` and `storage_migration_objects`.

## Acceptance gates

- A Records filter visibly changes the list and the API request uses the same
  canonical filter values.
- “Select current result” and Dataset creation resolve exactly the displayed
  eligible Records, with explicit-ID freezing for keyword/non-canonical filters.
- A report can trace every claim and rating input to one frozen Dataset Version.
- No rating rule, storage endpoint, credential, organization ID, or customer
  entitlement is embedded as an environment-specific source literal.
- Dataset share/revoke/archive and storage cutover have permission, audit,
  recovery, and end-to-end tests before production use.
