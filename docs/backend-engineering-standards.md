# CNPAF Collect backend engineering standards

These standards adapt the reusable engineering practices found in Coursistant's
`lms-backend` to the Next.js/Drizzle architecture in this repository. They do
not copy LMS-specific roles, course rules, or business enums.

## Architecture boundaries

- `app/api/v1/**/route.ts` is the controller boundary. A route authenticates,
  validates a shared DTO, calls one domain service, and serializes the result.
- `lib/modules/<domain>` owns business transitions, authorization context,
  transactions, locking, audit creation, and notification creation.
- `@cnpaf/shared` owns Zod request/response schemas, stable platform state
  machines, permission keys, and public contract types.
- `@cnpaf/db` owns storage schema, constraints, indexes, and migrations. Route
  handlers must not reproduce database invariants in ad-hoc queries.
- Dynamic business content (programs, form definitions, service types,
  locations, task types, classifications, report templates, and labels) comes
  from persisted registries or versioned configuration. Stable protocol values
  such as HTTP error codes, workflow states, and permission keys remain code
  constants and are seeded by migrations.

## Authentication and authorization

- Every protected route resolves one verified `SessionUser`; never accept actor
  identity, organization, or role from the request body.
- Authorize capabilities, not legacy role labels. UI visibility is only a
  convenience; each API independently evaluates permission plus resource scope.
- Explicit deny wins. Resource scopes support global, organization, program,
  location/site, service, form/template, data classification, and research use.
- Users with `mustChangePassword` may call only session, logout, and password
  change APIs. Password resets and material access changes invalidate sessions.
- Use the same concealment policy consistently: a missing resource is `404`;
  a visible resource outside the actor's capability is `403`.

## Transactions, concurrency, and idempotency

- A state-changing operation and its required audit event are committed in the
  same short database transaction.
- Do not make network, object storage, e-mail, or AI calls while holding a
  database transaction. Persist an outbox/job/notification first and process it
  afterward.
- Lock shared rows in a documented stable order. Prefer atomic conditional
  updates for state transitions. Queue workers claim work with
  `FOR UPDATE SKIP LOCKED`.
- Retriable create/submit/share endpoints accept an idempotency key. Its
  namespace is actor + method + route + key; a stored request fingerprint must
  match before replaying the stored success response.
- Published form versions, submitted record versions, published report
  versions, and dataset versions are immutable snapshots.

## Errors and API contracts

- Public errors use `{ error: { code, message, details?, requestId? } }` for new
  endpoints. During migration, legacy `{ error: string }` consumers remain
  supported by the compatibility helper.
- Zod schemas reject unknown fields on security-sensitive writes. IDs are UUIDs,
  pagination cursors are opaque, and list limits are bounded.
- Each route appears in `docs/openapi.v1.yaml`; CI compares the route inventory
  with the contract and includes negative request fixtures.
- Human-facing DTOs include labels and summaries rather than leaking internal
  join-table identifiers as the only representation.

## Audit, privacy, and observability

- Audit actor, action, entity, target user (where applicable), before/after
  state, reason, and request metadata. Never store passwords, password hashes,
  session tokens, provider secrets, raw restricted evidence, or signed URLs.
- AI and report outputs retain prompt/workflow/model/input provenance. AI output
  is always a suggestion until an authorized human accepts it.
- Logs contain a request ID and stable error code, but no authentication tokens,
  private record content, or credentials.

## Required verification

- Unit tests cover authorization precedence, state machines, input parsing, and
  redaction.
- Migration tests apply all SQL from an empty database and assert constraints.
- Integration tests cover success plus unauthenticated, unauthorized,
  wrong-scope, invalid-transition, stale-version, and idempotency-conflict paths.
- Concurrency tests cover duplicate submit/share, assignment races, dataset
  refresh, report version creation, and job claiming.
- `npm run test:backend`, `npm run build`, and the OpenAPI/route inventory check
  must pass before handoff.
