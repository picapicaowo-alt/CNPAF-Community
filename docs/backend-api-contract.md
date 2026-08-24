# CNPAF Collect Backend API Contract

Status: frontend-ready V4.1 backend contract for `cursor/backend`

Base path: `/api/v1`

Authentication: `cnpaf_session` secure HTTP-only cookie
Machine-readable contract: [`openapi.v1.yaml`](./openapi.v1.yaml)

The attached product and RBAC documents are treated as product requirements. Runtime request validation is defined by the exported Zod schemas in `packages/shared/src/contracts.ts` and `packages/shared/src/backend-contracts.ts`; those schemas are the canonical TypeScript contract for frontend implementation.

## Contract conventions

- IDs are UUID strings. Timestamps are ISO-8601 strings over HTTP.
- Business values such as roles, services, source kinds, template types, registry values, workflow types, report types, and data classifications are open strings loaded from APIs. Frontends must not compile them into closed enums.
- Successful create calls return `201`; queued AI/report/export work returns `202`; deletion returns `204`.
- New V4.1 endpoints return `{ "error": { "code": string, "message": string, "details"?: unknown, "requestId"?: string } }`. Legacy routes retain `{ "error": string }` until their compatibility clients migrate.
- Missing authentication returns `401`. Authorization failures return `403` and can include `authorization`, the policy decision reason.
- Permission checks are server-side. UI capability hiding is only a convenience and never the security boundary.
- Published template, AI workflow, and report-template versions are immutable. Create a new draft version to make changes.
- Published human report versions and ready dataset versions are immutable. Edits and refreshes create a new version.
- AI output is a proposal. Only `ApprovedFinding` rows produced by a human review are eligible for report, Ask Collect, and export retrieval.

## Session and navigation

| Method | Path | Response |
|---|---|---|
| GET | `/me` | user identity, role assignments, effective permission keys, scopes, capabilities |
| GET | `/me/capabilities` | role assignments, effective permissions/capabilities, normalized scopes |
| GET | `/auth/me` | compatibility superset of `/me` |
| POST | `/auth/password` | verify current password, set the new password, clear first-login restriction, and invalidate every other session |

`permissions` and `capabilities` are arrays of stable permission-key strings. Navigation, actions, and route guards should use these keys. `roles` are display/assignment metadata, not frontend authorization logic.

An account with `mustChangePassword: true` may use only session inspection,
logout, and `/auth/password`; every other protected route returns
`PASSWORD_CHANGE_REQUIRED`. Password resets, deactivation, and material role or
scope changes invalidate active sessions.

Normalized scope response:

```json
{
  "organizationIds": ["uuid"],
  "siteIds": ["uuid"],
  "serviceIds": ["uuid"],
  "serviceKeys": ["adult_day_health"],
  "templateIds": ["uuid"],
  "dataClasses": ["approved_evidence"],
  "researchUse": ["approved_for_research"]
}
```

## Endpoint matrix

### Users, roles, and scoped access

| Method | Path | Permission | Request contract |
|---|---|---|---|
| GET/POST | `/admin/users?q=&limit=` | `people.view` / `people.create_account` | `manualAccountCreateBodySchema` on POST |
| GET | `/users` | `users.view` | — |
| POST | `/users/invite` | `users.invite` | `inviteBodySchema` |
| GET | `/users/:id` | `users.view` | — |
| PATCH | `/users/:id/status` | `users.edit` or `users.deactivate` | `{ status: "active" | "inactive", reason? }` |
| GET | `/roles` | `roles.view` | — |
| POST | `/users/:id/role-assignments` | `roles.assign` | `roleAssignmentInputSchema` |
| POST | `/users/:id/permission-scopes` | `permissions.assign` | `scopeReferenceSchema` |
| PATCH | `/permission-scopes/:id` | `permissions.assign` | `scopeReferenceUpdateSchema` |
| DELETE | `/permission-scopes/:id` | `permissions.assign` | — |
| GET/PUT | `/admin/users/:id/access` | `permissions.assign` | `replaceUserAccessBodySchema` on PUT |
| GET/PUT | `/admin/users/:id/roles` | `roles.assign` | same effective-access representation |
| GET/PATCH | `/admin/users/:id` | `users.view` / `users.edit` | `userUpdateBodySchema` on PATCH |
| POST | `/admin/users/:id/deactivate` | `users.deactivate` | `{ reason? }` |
| POST | `/admin/users/:id/reactivate` | `users.edit` | `{ reason? }` |
| POST | `/admin/users/:id/reset-password` | `people.reset_password` | `resetPasswordBodySchema` |
| GET/POST | `/admin/users/:id/affiliations` | `people.view` / `people.edit_affiliation` | `affiliationBodySchema` on POST |
| DELETE | `/admin/users/:id/affiliations/:affiliationId` | `people.edit_affiliation` | — |
| GET/POST | `/admin/roles` | `roles.view` / `roles.manage` | `roleCreateBodySchema` on POST |
| PATCH | `/admin/roles/:id` | `roles.manage` | `roleUpdateBodySchema` |
| GET | `/admin/permissions` | `roles.view` | — |
| GET | `/admin/audit-events?before=&limit=` | scoped `audit.view` | stable opaque cursor; access-filtered events |

Access replacement is atomic and audited with before/after state. Role/user access changes and administrator mutations to registries, templates, report templates, and AI configuration create `AuditEvent` rows with the actor and affected entity. Explicit deny wins over explicit allow and role grants. Role assignment dates and override expiry are enforced by the authorization service.

`GET /admin/users` returns frontend-ready people cards: safe user profile,
active roles, normalized access scopes, affiliations, and program memberships.
It never returns password hashes, session tokens, or temporary passwords. Manual
account creation and reset responses return a temporary password exactly once;
the caller must deliver it through an approved channel.

### Programs, tasks, locations, and notifications

| Method | Path | Permission | Request contract / response |
|---|---|---|---|
| GET/POST | `/programs` | scoped `programs.view` / `programs.manage` | `programCreateBodySchema` on POST |
| GET/PATCH | `/programs/:programId` | scoped `programs.view` / `programs.manage` | `programUpdateBodySchema` on PATCH |
| POST | `/programs/:programId/memberships` | `programs.manage_membership` | `programMembershipBodySchema` |
| DELETE | `/programs/:programId/memberships/:membershipId` | `programs.manage_membership` | deactivates the membership |
| GET/POST | `/tasks` | assigned or scoped `tasks.view` / `tasks.create` | `taskCreateBodySchema` on POST |
| GET/PATCH | `/tasks/:taskId` | assignee or scoped `tasks.view` / `tasks.edit` | human-readable program/location/form DTO |
| POST | `/tasks/:taskId/assignments` | `tasks.assign` | `taskAssignmentBodySchema` |
| PATCH | `/tasks/:taskId/assignments/:assignmentId` | assignee or `tasks.edit` | `taskAssignmentTransitionBodySchema` |
| POST | `/tasks/:taskId/start` | task assignee | transition the caller's assignment |
| POST | `/tasks/:taskId/complete` | task assignee | transition the caller's assignment |
| POST | `/tasks/:taskId/close` | `tasks.edit` | close the task |
| GET | `/tasks/my` | authenticated assignee | caller's assigned tasks |
| GET | `/tasks/today` | authenticated assignee | currently actionable assignments |
| GET | `/tasks/:taskId/package` | assignee or scoped `tasks.view` | pinned task, assignment, form version, org-visible registry items, sync contract, content hash |
| GET/POST | `/locations?q=&latitude=&longitude=` | scoped `locations.view` / `locations.manage` | fuzzy/alias/proximity search; `locationCreateBodySchema` on POST |
| POST | `/locations/:locationId/aliases` | `locations.manage` | `locationAliasBodySchema` |
| POST | `/locations/:locationId/merge` | `locations.manage` | `locationMergeBodySchema` |
| GET | `/notifications` | `notifications.view` | caller's persisted in-app notifications |
| POST | `/notifications/:notificationId/read` | notification owner | mark read |
| GET/PUT | `/notifications/preferences` | `notifications.manage` | `notificationPreferenceBodySchema` on PUT |

Assignment transitions preserve `in_progress`, `completed`, `declined`, and
`cancelled` as distinct states. A collector decline requires a human-readable
`declineReason`; it is never collapsed into cancellation.

Task and assignment lifecycle updates use conditional writes so stale clients
receive `409` instead of overwriting a concurrent transition. Assigning a task
persists the notification in the same transaction. The offline task package is
self-describing and pins one published form version; the PWA must send
`localVersion` and `idempotencyKey` when it later synchronizes a record.

Locations are canonical site rows with version-independent aliases. Merge locks
both location rows in stable ID order, moves records/visits/tasks/aliases in one
transaction, and retains merge history. Latitude and longitude must be supplied
together.

### Config registries and templates

| Method | Path | Permission | Request contract |
|---|---|---|---|
| GET | `/config/registries/:registryKey` | authenticated | optional `?status=active` |
| POST | `/config/registries/:registryKey/items` | `services.manage` | `registryItemBodySchema` |
| PATCH | `/config/registries/:registryKey/items/:id` | `services.manage` | `registryItemUpdateBodySchema` |
| POST | `/config/registries/:registryKey/items/:id/archive` | `services.manage` | — |
| GET/POST | `/templates` | `templates.view` / `templates.create` | `templateCreateBodySchema` |
| GET | `/templates/:id` | scoped `templates.view` | — |
| POST | `/templates/:id/versions` | scoped `templates.edit` | `templateVersionCreateBodySchema` |
| GET/PATCH | `/template-versions/:id` | scoped `templates.view` / `templates.edit` | `templateVersionUpdateBodySchema` |
| POST | `/template-versions/:id/publish` | scoped `templates.publish` | — |
| POST | `/template-versions/:id/sections` | scoped `templates.edit` | `templateSectionBodySchema` |
| POST | `/template-sections/:id/fields` | scoped `templates.edit` | `templateFieldBodySchema` |
| POST | `/template-fields/:id/options` | scoped `templates.edit` | `templateFieldOptionBodySchema` |
| PATCH | `/template-field-options/:id` | scoped `templates.edit` | partial `templateFieldOptionBodySchema` |
| POST | `/template-field-options/:id/archive` | scoped `templates.archive` | — |

Registry updates to active items create a new version and archive the old item. Published template version rows and all of their section/field/option children are protected by database triggers.

### Records, privacy, safety, and custom mappings

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/records` | `records.view`, `records.view_own`, or eligible `records.view_approved` | scope-filtered list |
| POST | `/records` | `records.create` | draft upsert; `draftBodySchema` |
| PUT | `/records` | `records.submit` | immutable snapshot; `submitBodySchema` |
| GET | `/records/:id` | scoped record permission | approved-evidence mode never returns raw versions or attachments |
| POST | `/records/:id/review-decisions` | scoped `records.review` | `reviewBodySchema` |
| GET | `/review/inbox` | scoped `review.view` plus item capability | unified summaries; privacy-gated records only |
| GET | `/review/items/:id` | scoped `review.view` plus item capability | type-specific detail without client-side queue dispatch |
| POST | `/review/items/:id/decision` | `review.decide` plus underlying capability | `unifiedReviewDecisionBodySchema` |
| GET | `/review-queue` | scoped `records.review` | — |
| GET | `/privacy-queue` | scoped `privacy.view` | — |
| POST | `/privacy-flags/:id/resolve` | scoped `privacy.resolve` | `privacyResolveBodySchema` |
| GET | `/safety-queue` | scoped `safety.view` | — |
| POST | `/safety-flags/:id/resolve` | scoped `safety.resolve` | `safetyResolveBodySchema` |
| GET | `/custom-entries?status=pending` | scoped `taxonomy.approve_mapping` | — |
| POST | `/custom-entries/:id/map-existing` | scoped `taxonomy.approve_mapping` | `customEntryDecisionBodySchema` |
| POST | `/custom-entries/:id/create-option` | scoped `taxonomy.approve_mapping` | same |
| POST | `/custom-entries/:id/keep-free-text` | scoped `taxonomy.approve_mapping` | same |
| POST | `/custom-entries/:id/dismiss` | scoped `taxonomy.approve_mapping` | same |

Privacy resolution with redaction creates a new immutable `RecordVersion`; it never mutates the flagged snapshot. External AI is not called while privacy is flagged. Safety remains a separate human queue and never triggers external reporting.

The same draft shape is used by `POST /records` and `PUT /records`; submit additionally requires `piiAttestation`. `occurredAt` is persisted on the record version and is distinct from server `submittedAt`.

```json
{
  "clientRecordId": "uuid",
  "idempotencyKey": "device-generated-key",
  "localVersion": 1,
  "sourceKind": "configured_source_key",
  "siteId": "uuid",
  "templateVersionId": "uuid",
  "occurredAt": "2026-08-23T10:30:00-07:00",
  "structuredSelections": [
    { "templateFieldId": "uuid", "optionId": "uuid", "value": {} }
  ],
  "customEntries": [
    { "templateFieldId": "uuid", "categoryId": null, "customText": "Unlisted value" }
  ],
  "qualitative": "De-identified collection notes",
  "quantitative": {},
  "attribution": {},
  "contentLanguage": "en",
  "piiAttestation": true
}
```

### AI classification and configuration

| Method | Path | Permission | Request contract |
|---|---|---|---|
| GET | `/ai/runs` | scoped `ai.view_runs` | — |
| GET | `/ai/runs/:id` | scoped `ai.view_runs` | run provenance, findings, reviews |
| GET | `/ai/runs/:id/findings` | scoped `ai.view_runs` | findings and review history |
| POST | `/records/:recordVersionId/ai/classify` | scoped `ai.request_reclassification` | `{ idempotencyKey?, workflowVersionId? }` |
| POST | `/ai/runs/:id/reclassify` | scoped `ai.request_reclassification` | `aiReclassifyBodySchema` |
| POST | `/ai/runs/:id/retry` | scoped `ai.retry_run` | — |
| POST | `/ai/findings/:id/review` | scoped `ai.review_findings` | `aiFindingReviewBodySchema` |
| GET/POST | `/ai/workflows` | `ai.configure_workflows` | `aiWorkflowBodySchema` on POST |
| POST | `/ai/workflows/:id/versions` | `ai.configure_workflows` | `aiWorkflowVersionBodySchema` |
| PATCH | `/ai/workflow-versions/:id` | `ai.configure_workflows` | `aiWorkflowVersionUpdateBodySchema` |
| POST | `/ai/workflow-versions/:id/publish` | `ai.configure_workflows` | — |
| GET/POST | `/ai/prompt-versions` | `ai.configure_prompts` | `promptVersionBodySchema` on POST |
| GET/POST | `/ai/output-schema-versions` | `ai.configure_workflows` | `outputSchemaVersionBodySchema` on POST |
| PATCH | `/ai/output-schema-versions/:id` | `ai.configure_workflows` | `outputSchemaVersionUpdateBodySchema` |
| POST | `/ai/output-schema-versions/:id/publish` | `ai.configure_workflows` | — |
| GET/POST | `/ai/provider-configs` | `ai.configure_workflows` | `aiProviderConfigBodySchema` on POST |
| PATCH | `/ai/provider-configs/:id` | `ai.configure_workflows` | `aiProviderConfigUpdateBodySchema` |
| GET/POST | `/ai/model-configs` | `ai.configure_workflows` | `aiModelConfigBodySchema` on POST |
| PATCH | `/ai/model-configs/:id` | `ai.configure_workflows` | `aiModelConfigUpdateBodySchema` |

Reclassification always creates a new `AiRun` linked through `parentAiRunId`. Every run persists workflow/prompt/provider/model/output-schema provenance, privacy-screened input snapshot, output, token metadata, error metadata, and idempotency key. The same execution service runs `record_classification`, `report_generation`, and `ask_collect`; provider calls are atomically claimed so concurrent equivalent requests cannot double-run. A workflow falls back to the local provider only when its published version explicitly sets `featureFlags.fallbackProviderKey` to `local_heuristic`.

Classification output is validated against the selected versioned JSON Schema. The built-in `@cnpaf/shared#aiOutputSchema` contract creates reviewable findings; other valid configured schemas remain available in `AiRun.parsedOutput` without being forced through the built-in shape.

### Reports, Ask Collect, analytics, and exports

| Method | Path | Permission | Request contract |
|---|---|---|---|
| GET | `/analytics` | scoped `analytics.view` or canonical `insights.view` | origin-separated aggregates |
| GET | `/reports` | scoped `reports.view` | authorized editable reports plus legacy generated artifacts |
| POST | `/report-runs` | `reports.generate` | `reportRunBodySchema`; returns `202` |
| GET | `/report-runs/:id` | `reports.view` plus current evidence access | — |
| GET | `/reports/:id` | `reports.view` plus current evidence access | artifact and citations |
| POST | `/reports/:id/approve` | `reports.publish` | `reportApprovalBodySchema` |
| POST | `/reports` | scoped `reports.edit` | `editableReportCreateBodySchema`; creates human report + v1 |
| PATCH | `/reports/:id` | scoped `reports.edit` | `editableReportUpdateBodySchema` |
| POST | `/reports/:id/versions` | scoped `reports.edit` | `editableReportVersionBodySchema`; immutable new draft snapshot |
| GET/PATCH | `/report-versions/:versionId` | `reports.view` / `reports.edit` | `editableReportVersionUpdateBodySchema` on PATCH |
| POST | `/report-versions/:versionId/publish` | `reports.publish` | publish and freeze the version |
| POST | `/report-versions/:versionId/sections` | `reports.edit` | `reportSectionInputSchema` |
| PATCH/DELETE | `/report-sections/:sectionId` | `reports.edit` | `reportSectionUpdateBodySchema` on PATCH |
| POST | `/report-sections/:sectionId/duplicate` | `reports.edit` | `reportSectionDuplicateBodySchema` |
| POST | `/report-sections/:sectionId/reorder` | `reports.edit` | `reportSectionReorderBodySchema` |
| GET | `/report-sections/:sectionId/sources` | `reports.view` plus current evidence access | authorized source links only |
| POST | `/report-sections/:sectionId/ai-draft` | `reports.edit` | `reportSectionAiDraftBodySchema`; creates suggestion, never overwrites content |
| GET/POST | `/report-templates` | `reports.publish` | `reportTemplateBodySchema` on POST |
| POST | `/report-templates/:id/versions` | `reports.publish` | `reportTemplateVersionBodySchema` |
| PATCH | `/report-template-versions/:id` | `reports.publish` | `reportTemplateVersionUpdateBodySchema` |
| POST | `/report-template-versions/:id/publish` | `reports.publish` | — |
| POST | `/ask-collect/conversations` | `chat.ask_collect` or canonical `ask_collect.use` | `askConversationBodySchema` |
| POST | `/ask-collect/conversations/:id/messages` | `chat.ask_collect` or canonical `ask_collect.use` | `askMessageBodySchema` |
| GET | `/ask-collect/conversations/:id` | owner + either Ask Collect permission | messages and structured sources |
| POST | `/export-jobs` | scoped `exports.create` | `exportJobBodySchema`; returns `202` |
| GET | `/export-jobs` | `exports.create` | current user's jobs |
| GET | `/export-jobs/:id` | owner + `exports.create` | — |
| GET | `/export-jobs/:id/download` | owner + scoped `exports.download` | file response |

Report, chat, and export retrieval filters evidence before synthesis/serialization. Report generation and Ask Collect invoke their selected published AI workflow and create durable `AiRun` rows; the deterministic local provider is the seeded development default, while configured OpenAI workflow versions use `OPENAI_API_KEY` without storing secrets in the database. Saved reports, saved chat answers, and generated downloads re-check current access so a later scope revocation cannot be bypassed with an old artifact URL.

The `/reports` collection serves the V4.1 human-authoritative editor; legacy
generated artifacts remain available through report-run linkage and may be used
as cited source material. Report DTOs include the last editor's safe display
name, filters, evidence policy, version history, ordered sections, and source
summaries required by the desktop and mobile Figma flows. Accepting an AI draft
is an explicit human section update and is audited.

`reportRunBodySchema.filters` and `exportJobBodySchema.filters` accept `dateFrom`, `dateTo`, `organizationIds`, `siteIds`, `serviceTypeKeys`, `populationKeys`, `sourceOrigins`, `templateVersionIds`, `findingTypes`, and `themeOrConcernIds`. Dates filter by `occurredAt`, then `submittedAt`, then evidence creation time. Reports store the exact filters, evidence policy, evidence IDs, distinct record/site/visit units by origin, and workflow/prompt/provider/model/output-schema provenance. `approvedOnly` is always `true`.

Ask Collect performs permission, requested-scope, privacy, and research-use filtering before relevance ranking. Every returned statement has a structured `ApprovedFinding` citation. Saved answers are redacted if any cited source later becomes inaccessible.

`GET/POST/PATCH /jobs` is an internal worker administration endpoint protected by `settings.manage`; AI reviewers use the scoped `/ai/runs` endpoints instead.

### Records, datasets, downloads, and controlled sharing

| Method | Path | Permission | Request contract / behavior |
|---|---|---|---|
| POST | `/records/:id/download` | scoped `records.download` | `dataDownloadBodySchema`; current approved version only; JSON/CSV/PDF |
| POST | `/records/:id/share` | scoped `records.share` | `recordShareBodySchema`; creates an immutable one-record dataset version |
| GET/POST | `/datasets` | scoped `datasets.download` or `datasets.create` / `datasets.create` | `datasetCreateBodySchema` on POST |
| GET | `/datasets/:datasetId` | scoped `datasets.download` | dataset and immutable version history |
| POST | `/datasets/:datasetId/refresh` | `datasets.refresh` | `datasetRefreshBodySchema`; creates the next frozen version |
| POST | `/datasets/:datasetId/download` | `datasets.download` plus current record access | `dataDownloadBodySchema`; JSON/CSV |
| POST | `/datasets/:datasetId/share` | `datasets.share` plus current record access | `datasetShareBodySchema`; returns the bearer token once |
| POST | `/dataset-shares/:shareId/revoke` | scoped `datasets.share` | atomically revokes an active grant |
| GET | `/shared-datasets/:token` | authenticated, scoped recipient | re-checks share scope, expiry, dataset permission, and every frozen record |

A dataset version freezes exact `recordId + recordVersionId` pairs, the complete
selection query, field policy, record count, and content hash. Refresh never
mutates an earlier version. Every declared filter—date, organization, program,
location, service/source type, population, source origin, form version,
collector, review status, research-use status, finding type, and canonical
theme/concern—is applied by one shared filter implementation across reports,
exports, Ask Collect, and datasets. Unknown filter fields are rejected rather
than ignored.

`approved_evidence` datasets require current approved, privacy-cleared,
research-eligible evidence access. Any other classification additionally
requires both `records.view` and `records.view_restricted_pii`. A frozen field
policy cannot be expanded while downloading. Share tokens are stored only as
SHA-256 hashes; access is logged and revalidated on every request.

## Database migrations

| Migration | Purpose |
|---|---|
| `0002_backend_platform.sql` | RBAC, dynamic configuration/templates, AI, privacy/safety review, reports/chat/exports, indexes and legacy backfill |
| `0003_record_template_integrity.sql` | immutable submitted structured/custom source data |
| `0004_configuration_version_integrity.sql` | immutable published schemas and active/archived prompts |
| `0005_audit_permission.sql` | `audit.view` permission and admin grant |
| `0006_record_occurrence_time.sql` | persisted/indexed record occurrence timestamp |
| `0007_ai_output_schema_provenance.sql` | direct `AiRun` foreign-key provenance to the selected output schema version |
| `0008_v4_1_foundation.sql` | first-login credentials, programs/memberships/affiliations, tasks, location aliases/merges/coordinates, notifications, human report versions, immutable datasets/shares/access logs, V4.1 permissions and source-kind policy registry data |
| `0009_collection_field_type_registry.sql` | active collection field controls and renderer metadata used by versioned form builders and pinned task packages |

## Durable states

| Entity | States |
|---|---|
| `AiRun` | `queued → running → succeeded | failed | skipped_privacy | cancelled` |
| `RecordCustomEntry.mappingStatus` | `pending → mapped_existing | created_new | keep_free_text | dismissed` |
| `ReportRun` | `queued → running → succeeded | failed` |
| `ReportArtifact` | `draft → approved | archived` |
| `ExportJob` | `queued → running → succeeded | failed` |
| `Job` | `queued → running → succeeded | queued(retry) → dead` |
| `Program` | `draft → active → completed | archived` |
| `Task` | `draft → open → closed | cancelled → archived` |
| `TaskAssignment` | `assigned → in_progress → completed | cancelled` |
| `HumanReport` | `draft → archived` |
| `HumanReportVersion` | `draft → published | archived` |
| `Dataset` | `active → archived` |
| `DatasetVersion` | `building → ready | failed` |
| `DatasetShare` | `active → revoked` plus time-based expiry |

The job worker claims tasks transactionally using `FOR UPDATE SKIP LOCKED`.
Record submission idempotency is namespaced by actor and request route and binds
the key to a request content hash; replay with different content returns
`IDEMPOTENCY_CONFLICT`. AI runs and jobs retain unique idempotency keys.

## Frontend integration sequence

1. Log in, then fetch `/me` once and cache identity/capability/scope data.
2. Fetch registries and published templates; render labels from the selected locale while retaining stable string keys.
3. Use stable device-generated idempotency keys for offline submission, AI classification, section drafting, and other retried mutations. Never reuse one key with different content.
4. Treat `202` as queued work and poll the corresponding run/job resource.
5. On `401`, return to login. On `403`, refresh `/me/capabilities`; permission changes may have taken effect. On `409`, refresh the affected versioned resource.
6. Display AI provenance and citations; never present an unreviewed finding as approved evidence.
