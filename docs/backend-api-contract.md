# CNPAF Collect Backend API Contract

Status: frontend-ready backend contract for `cursor/backend`

Base path: `/api/v1`

Authentication: `cnpaf_session` secure HTTP-only cookie
Machine-readable contract: [`openapi.v1.yaml`](./openapi.v1.yaml)

The attached product and RBAC documents are treated as product requirements. Runtime request validation is defined by the exported Zod schemas in `packages/shared/src/contracts.ts` and `packages/shared/src/backend-contracts.ts`; those schemas are the canonical TypeScript contract for frontend implementation.

## Contract conventions

- IDs are UUID strings. Timestamps are ISO-8601 strings over HTTP.
- Business values such as roles, services, source kinds, template types, registry values, workflow types, report types, and data classifications are open strings loaded from APIs. Frontends must not compile them into closed enums.
- Successful create calls return `201`; queued AI/report/export work returns `202`; deletion returns `204`.
- Validation or state-transition errors return `{ "error": string }` with `400` or `409`.
- Missing authentication returns `401`. Authorization failures return `403` and can include `authorization`, the policy decision reason.
- Permission checks are server-side. UI capability hiding is only a convenience and never the security boundary.
- Published template, AI workflow, and report-template versions are immutable. Create a new draft version to make changes.
- AI output is a proposal. Only `ApprovedFinding` rows produced by a human review are eligible for report, Ask Collect, and export retrieval.

## Session and navigation

| Method | Path | Response |
|---|---|---|
| GET | `/me` | user identity, role assignments, effective permission keys, scopes, capabilities |
| GET | `/me/capabilities` | role assignments, effective permissions/capabilities, normalized scopes |
| GET | `/auth/me` | compatibility superset of `/me` |

`permissions` and `capabilities` are arrays of stable permission-key strings. Navigation, actions, and route guards should use these keys. `roles` are display/assignment metadata, not frontend authorization logic.

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
| GET/POST | `/admin/roles` | `roles.view` / `roles.manage` | `roleCreateBodySchema` on POST |
| PATCH | `/admin/roles/:id` | `roles.manage` | `roleUpdateBodySchema` |
| GET | `/admin/permissions` | `roles.view` | — |
| GET | `/admin/audit-events?before=&limit=` | scoped `audit.view` | stable opaque cursor; access-filtered events |

Access replacement is atomic and audited with before/after state. Role/user access changes and administrator mutations to registries, templates, report templates, and AI configuration create `AuditEvent` rows with the actor and affected entity. Explicit deny wins over explicit allow and role grants. Role assignment dates and override expiry are enforced by the authorization service.

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
  "sourceKind": "field_visit",
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
| GET | `/analytics` | scoped `analytics.view` | origin-separated aggregates |
| GET | `/reports` | scoped `reports.view` | currently authorized artifacts |
| POST | `/report-runs` | `reports.generate` | `reportRunBodySchema`; returns `202` |
| GET | `/report-runs/:id` | `reports.view` plus current evidence access | — |
| GET | `/reports/:id` | `reports.view` plus current evidence access | artifact and citations |
| POST | `/reports/:id/approve` | `reports.publish` | `reportApprovalBodySchema` |
| GET/POST | `/report-templates` | `reports.publish` | `reportTemplateBodySchema` on POST |
| POST | `/report-templates/:id/versions` | `reports.publish` | `reportTemplateVersionBodySchema` |
| PATCH | `/report-template-versions/:id` | `reports.publish` | `reportTemplateVersionUpdateBodySchema` |
| POST | `/report-template-versions/:id/publish` | `reports.publish` | — |
| POST | `/ask-collect/conversations` | `chat.ask_collect` | `askConversationBodySchema` |
| POST | `/ask-collect/conversations/:id/messages` | `chat.ask_collect` | `askMessageBodySchema` |
| GET | `/ask-collect/conversations/:id` | owner + `chat.ask_collect` | messages and structured sources |
| POST | `/export-jobs` | scoped `exports.create` | `exportJobBodySchema`; returns `202` |
| GET | `/export-jobs` | `exports.create` | current user's jobs |
| GET | `/export-jobs/:id` | owner + `exports.create` | — |
| GET | `/export-jobs/:id/download` | owner + scoped `exports.download` | file response |

Report, chat, and export retrieval filters evidence before synthesis/serialization. Report generation and Ask Collect invoke their selected published AI workflow and create durable `AiRun` rows; the deterministic local provider is the seeded development default, while configured OpenAI workflow versions use `OPENAI_API_KEY` without storing secrets in the database. Saved reports, saved chat answers, and generated downloads re-check current access so a later scope revocation cannot be bypassed with an old artifact URL.

`reportRunBodySchema.filters` and `exportJobBodySchema.filters` accept `dateFrom`, `dateTo`, `organizationIds`, `siteIds`, `serviceTypeKeys`, `populationKeys`, `sourceOrigins`, `templateVersionIds`, `findingTypes`, and `themeOrConcernIds`. Dates filter by `occurredAt`, then `submittedAt`, then evidence creation time. Reports store the exact filters, evidence policy, evidence IDs, distinct record/site/visit units by origin, and workflow/prompt/provider/model/output-schema provenance. `approvedOnly` is always `true`.

Ask Collect performs permission, requested-scope, privacy, and research-use filtering before relevance ranking. Every returned statement has a structured `ApprovedFinding` citation. Saved answers are redacted if any cited source later becomes inaccessible.

`GET/POST/PATCH /jobs` is an internal worker administration endpoint protected by `settings.manage`; AI reviewers use the scoped `/ai/runs` endpoints instead.

## Database migrations

| Migration | Purpose |
|---|---|
| `0002_backend_platform.sql` | RBAC, dynamic configuration/templates, AI, privacy/safety review, reports/chat/exports, indexes and legacy backfill |
| `0003_record_template_integrity.sql` | immutable submitted structured/custom source data |
| `0004_configuration_version_integrity.sql` | immutable published schemas and active/archived prompts |
| `0005_audit_permission.sql` | `audit.view` permission and admin grant |
| `0006_record_occurrence_time.sql` | persisted/indexed record occurrence timestamp |
| `0007_ai_output_schema_provenance.sql` | direct `AiRun` foreign-key provenance to the selected output schema version |

## Durable states

| Entity | States |
|---|---|
| `AiRun` | `queued → running → succeeded | failed | skipped_privacy | cancelled` |
| `RecordCustomEntry.mappingStatus` | `pending → mapped_existing | created_new | keep_free_text | dismissed` |
| `ReportRun` | `queued → running → succeeded | failed` |
| `ReportArtifact` | `draft → approved | archived` |
| `ExportJob` | `queued → running → succeeded | failed` |
| `Job` | `queued → running → succeeded | queued(retry) → dead` |

The job worker claims tasks transactionally using `FOR UPDATE SKIP LOCKED`; `idempotencyKey` is unique for AI runs and jobs.

## Frontend integration sequence

1. Log in, then fetch `/me` once and cache identity/capability/scope data.
2. Fetch registries and published templates; render labels from the selected locale while retaining stable string keys.
3. Use idempotency keys for offline draft submission, AI classification, and other retried mutations.
4. Treat `202` as queued work and poll the corresponding run/job resource.
5. On `401`, return to login. On `403`, refresh `/me/capabilities`; permission changes may have taken effect. On `409`, refresh the affected versioned resource.
6. Display AI provenance and citations; never present an unreviewed finding as approved evidence.
