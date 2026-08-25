# Latest integrated update summary

Audit date: 2026-08-24. Branch: `cursor/frontend`. Remote baseline commit:
`9ae12f9` (`Build responsive Figma-aligned collection frontend`). A remote fetch
confirmed `HEAD...origin/cursor/frontend` is `0/0`.

The running version includes a large **uncommitted integration set** on top of
that commit. It is the newest local code, but it is not a reproducible release
until reviewed and committed. Existing user changes were preserved during this
audit.

## Integrated functional updates

- Responsive staff/volunteer navigation and refreshed account, dashboard,
  records, task, data, insights, people, form and location experiences.
- Dynamic form builder/runtime with sections, fields, options, visibility and
  branching rules, rating/dropdown/information controls, ordering, duplication,
  version comparison, preview, publish/archive and quick-capture support.
- Program details and multi-person membership management; organization-scoped,
  cross-department people groups with many-to-many membership.
- Task creation, assignment, bulk operations, volunteer collection package,
  status transitions, correction/resubmission and notifications.
- Location create/edit/archive/approve, aliases, merge workflow, configurable
  types and city/state/country address fields.
- Typed field-answer snapshots, review correction targets, dataset builder,
  refresh/download/share options and account avatar storage.
- Expanded OpenAPI/shared Zod contracts and route inventory tests for the new
  APIs.

## Dataset Phase 1 — ready for demo

- Records is now the primary evidence-filter surface. The operations reviewer
  receives scoped Program, Location, Form Version, Collector, date, review,
  Research Use, and advanced evidence options without requiring
  `datasets.create`; Dataset creation keeps its separate permission scope.
- The Records API, visible list, select-all/current-result behavior and Dataset
  handoff consume the same canonical filter query. Legacy Insights drill-downs
  are translated into that filter model when repeatable.
- Records filters cover time, Program, Location, Form Version, Collector,
  review/Research Use state, Service/source type, Population, Finding Type and
  canonical Theme/Concern.
- A Dataset can be created from canonical filter results, the eligible visible
  result, or manually selected records.
- The default Dataset accepts only human-approved, privacy-cleared/redacted,
  research-approved records inside the actor's current scope.
- Creation freezes exact Record Versions. Refresh creates the next immutable
  Dataset Version with its own record count and content hash; earlier versions
  are never rewritten.
- Field policy and restricted-PII permissions are enforced again at download;
  CSV and JSON cannot expand the frozen field set.
- Keyword, privacy-state and concern drill-downs freeze explicit current Record
  IDs instead of being stored as misleading repeatable filters.
- Existing Insights/Analytics → Records query parameters remain compatible and
  feed the Dataset workflow.

The complete entity relationship, compliance gates and tomorrow-demo sequence
are in `docs/dataset-phase-1-demo.md`.

## Dataset governance and report handoff — implemented locally

- `/data/:datasetId` shows immutable version history, per-version hashes,
  frozen Record Version references and deterministic version downloads.
- Controlled shares pin one Dataset Version, reveal the bearer link once,
  retain access logs and support atomic revocation. Archiving retains all
  versions/audit history while revoking every active share and blocking refresh,
  new shares and new reports.
- A chosen Dataset Version can create an editable initial Report Version. The
  database stores a direct `report_versions.source_dataset_version_id` foreign
  key, copies approved-finding citations with Record Version metadata, and
  revalidates current scope before report creation.
- The commercial rating methodology, rubric/threshold versioning, customer
  entitlement and immutable sellable Rating Version remain the next product
  phase; they are not hardcoded into this handoff.

## Local → S3 migration implementation

- `npm run storage:migrate -- manifest|backfill|verify|cutover-check` implements
  inventory, SHA-256, resumable bounded uploads, full streamed verification and
  a fail-closed switch decision. A database ledger records each run/object.
- The first local inventory run is recorded as
  `ad3cb467-f81f-43b0-b7f6-6838102c9868`: one referenced object, 93,512 bytes,
  zero missing local references and zero orphan files. It is intentionally not
  cutover-ready because no S3 target has been configured or verified.
- S3 runtime supports an explicit local read fallback during a bounded rollback
  window. The operator procedure is in `docs/storage-migration-runbook.md`.

## Database updates

Migrations `0010`–`0018` add coordinator workflow permissions and notification
kinds, typed record field answers, field-level correction targets, P1 form
controls, coordinator authoring permissions, people groups, location address
fields/form archive permission, account avatar metadata, Dataset archive
permission, Report→Dataset Version provenance, and the storage migration ledger.

The migration suite now discovers every numbered SQL file automatically. A new
schema-sync test migrates an empty PGlite database and compares all 77 public
Drizzle tables and every declared column. The legacy upgrade fixture continues
to verify immutable snapshots, published configuration, provenance,
idempotency, dataset immutability and role/scope behavior.

## Architecture and hardcode audit

- Frontend, Backend, Database and AI remain logical modules in one Git repo.
  Their four module branches now exist locally and on `origin`; ownership and
  integration order are recorded in `docs/repository-strategy.md`.
- The four branch tips still do not contain the large local integration set as
  module-owned commits. Branch creation and ownership rules are complete; actual
  commit splitting and reproducible integration remain open work.
- Web and database environment access is centralized in typed configuration
  boundaries. The OpenAI endpoint, storage provider, directories, region,
  bucket and credentials are deployment configuration.
- Legacy operations pages now call typed feature APIs rather than embedding
  browser requests. Explicit `any` was removed from the reviewed flow.
- `npm run check:architecture` prevents the high-risk hardcode and dependency
  boundary patterns defined in `docs/coding-standards.md`.

## Verification status

- Remote branch parity: passed (`0/0`).
- Strict TypeScript: passed.
- Backend/OpenAPI/contract tests: 37 passed.
- Database legacy migration test: passed.
- Database schema/migration table-and-column drift test: passed (79 tables).
- Next.js 16.3.2 production build: passed, including TypeScript and all generated
  application/API routes.
- Local health flow: HTTP 200 with `db: true`, local storage ready, and no queued
  or dead jobs.
- Authenticated Records verification as Operations Reviewer: all primary and
  advanced filters rendered without `datasets.create`; selecting one Location
  issued `/records?locationIds=...` and changed the visible table from 10 to 2
  matching Records. Reset restored all 10.
- Dataset Phase 2 localhost flow: created `Dataset Phase 2 E2E` v1 from seven
  eligible Records; verified seven exact Record Version rows and content hash;
  created and revoked a controlled share; created a two-section initial report
  with a direct, clickable Dataset v1 source; archived the dedicated Dataset and
  confirmed versions/downloads/citations remained while new share/report actions
  were removed. Eight time-bounded verification permission overrides were
  removed immediately after the run.
- Storage inventory run: one referenced object (93,512 bytes), zero missing
  local references and zero orphans. Cutover check correctly remains closed
  until an S3 target is configured, backfilled and fully verified.
- Authenticated browser smoke: dashboard plus forms, programs, locations,
  people, tasks, records, data, review, configuration, capture, insights and
  account all rendered meaningful content with no Next.js error overlay.
- Mobile quick-capture flow: selected a database-backed location, loaded the
  published form package and rendered the version-pinned dynamic fields.
- Browser errors and framework overlays: none in the isolated CNPAF session.
  The Records WCAG A/AA audit reported zero confirmed violations; contrast
  remained incomplete for gradient-backed navigation elements because the
  automated tool could not determine their background color.
