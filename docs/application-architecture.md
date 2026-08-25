# CNPAF Collect application architecture

This document is the implementation contract for the V5 functional scope. The
frontend and backend remain in one TypeScript monorepo, but they are separate
layers with explicit dependency direction.

The physical Git strategy is one repository with Database, Backend, AI and
Frontend module branches. Ownership and integration order are defined in
[repository-strategy.md](repository-strategy.md); branch separation never
changes the dependency direction below.

## Dependency direction

```text
apps/web/src/app/**/page.tsx
  → apps/web/src/features/<domain> (React UI, hooks, browser API client)
    → apps/web/src/lib/api-client.ts
      → apps/web/src/app/api/v1/**/route.ts (HTTP controller)
        → apps/web/src/lib/modules/<domain>.ts (backend domain service)
          → @cnpaf/db (schema and persistence)

All layers may depend on @cnpaf/shared for DTOs, Zod schemas, stable workflow
states, field-runtime types, permissions, and localization keys.

Runtime environment access is also directional: web server code reads typed
configuration only through `apps/web/src/config/server.ts`, and database commands
only through `packages/db/src/runtime-config.ts`.
```

Dependencies must never point upward:

- React features do not import database schema, backend services, secrets, or
  server-only modules.
- Route Handlers do not contain React code or duplicate domain transactions.
- Domain services do not import pages, components, or browser APIs.
- Database migrations do not encode display behavior.

## Repository ownership

### `packages/shared`

- Strict Zod request and response schemas.
- Public DTO and discriminated-union types.
- Stable permission and workflow state constants.
- Dynamic form runtime types and pure validation helpers shared by builder,
  collector, review, records, and export.
- No React, database driver, filesystem, or environment-variable access.

### `packages/db`

- Drizzle tables, indexes, constraints, and relations.
- Forward-only numbered SQL migrations.
- Migration tests from an empty database plus legacy upgrade fixtures.
- Database invariants such as immutable published versions and submitted
  snapshots.

### `apps/web/src/lib/modules`

- Backend use cases and domain state transitions.
- Resource authorization, transactions, locking, idempotency, audit events, and
  required notifications.
- Returns plain serializable DTO inputs to controllers; never returns a React
  element or a raw secret.

### `apps/web/src/app/api/v1`

- Thin HTTP controllers only: authenticate, parse one shared schema, invoke one
  domain service, serialize the result/error.
- Dynamic `params` are awaited according to Next.js 16 conventions.
- No multi-step business workflow, ad-hoc authorization query, or duplicated
  database invariant in a Route Handler.

### `apps/web/src/features`

Every business feature owns its frontend code:

```text
features/<domain>/
  api.ts                 browser-safe typed API calls
  types.ts               frontend view types or shared DTO re-exports
  hooks/                 reusable client state and effects
  components/            domain React components
  runtime/               pure domain UI helpers where applicable
  *.test.ts              pure helper and component-level tests
```

- A feature may import reusable visual primitives from `src/components`, but
  generic components must not import a feature.
- Browser API calls stay in `features/<domain>/api.ts`; JSX does not scatter raw
  endpoint strings through event handlers.
- Hooks own loading/error/mutation state when it is reused or materially
  simplifies a component.
- Prefer pure functions for sorting, validation, labels, state transitions, and
  request-body construction.

### `apps/web/src/app/**/page.tsx`

- Route composition only: render the feature screen and handle route-level
  params/search params.
- A page must not become the domain service, form runtime, and API client at the
  same time.
- New complex pages should normally be a small wrapper around a feature screen.
- Interactive screens are React Client Components only where state, effects, or
  browser APIs are required.

### `apps/web/src/components`

- Reusable, domain-neutral primitives such as page headers, empty/error states,
  buttons, status pills, dialogs, and field layout.
- Components must be accessible by default: associated labels, keyboard
  operation, visible focus, semantic buttons, and appropriate live regions.

## Dynamic form architecture

There is one form definition and one rendering runtime.

```text
Published FormVersion DTO
  → normalize/validate runtime model (@cnpaf/shared)
    → DynamicFormRenderer (features/forms/runtime)
      ├─ Admin preview mode
      ├─ assigned task collection mode
      ├─ quick capture mode
      ├─ review read-only mode
      └─ records read-only mode
```

- Builder components edit draft definitions; they do not implement a separate
  preview renderer.
- Controls are selected from registry metadata through a typed control key, not
  display labels.
- Each answer is addressed by stable field ID/Key and retains its typed value,
  missing reason, and optional custom entry.
- A task pins one published version. Runtime labels and validation come from
  that version snapshot.
- Adding a new control requires: a shared control type, builder configuration,
  runtime input component, answer serialization, read-only display, validation,
  migration/contract support when needed, and tests.

## People and assignment architecture

- School, department, institution, and title are time-aware user affiliation
  attributes; they are not overloaded as assignment groups.
- `person_groups` are organization-scoped reusable cohorts, and
  `person_group_memberships` is a many-to-many relation so one person may join
  several department or cross-department teams.
- Group details and the complete selected member list are saved in one audited
  transaction. Cross-organization and inactive users are rejected before the
  write begins.
- Programs consume groups only as a candidate filter. Program membership and
  its role remain explicit records, so later edits to a reusable group never
  silently add or remove people from an existing program.

## TypeScript and React rules

- TypeScript `strict` remains enabled in every workspace.
- Do not add `any`; use `unknown` at external boundaries and narrow it.
- Use discriminated unions for field controls, answers, review items, and
  workflow commands.
- Parse every write request with a strict shared Zod schema.
- Avoid duplicate handwritten versions of API DTOs. Export or infer the type
  from `@cnpaf/shared` when the shape crosses the HTTP boundary.
- React state stores editable UI state, not copies of derivable data; derive
  filtered/sorted collections with pure functions or `useMemo` when useful.
- Effects must declare dependencies and clean up timers/listeners. Ignore or
  abort stale asynchronous results when a query can race.
- Fetch independent resources in parallel.
- Use `next/link` for internal navigation and Next.js navigation hooks only in
  Client Components.
- User-facing statuses and registry values render localized labels, never raw
  database keys when a label is available.

## Backend mutation rules

1. Authenticate the session actor.
2. Parse a shared strict schema.
3. Load the resource and evaluate permission plus scope in the domain service.
4. Validate the state transition and referenced version/configuration.
5. Commit the mutation and required audit/notification rows atomically.
6. Return the documented DTO or a stable public API error.

Network, AI, storage, and e-mail calls do not run inside database transactions.

## Change organization

Feature work should be reviewable as separate concerns across the four module
branches:

1. shared contract/runtime changes;
2. database schema and migration;
3. backend domain service and Route Handler;
4. frontend feature module and thin route page;
5. tests and documentation.

Do not hide an incomplete backend mutation behind a frontend-only control, and
do not expose a backend capability without a permission-aware, usable frontend
entry when it is part of the accepted functional scope.

## Required verification

- `npm run test:backend`
- `npm run build`
- route/OpenAPI inventory verification
- migration test from empty and legacy fixtures
- end-to-end browser verification for the affected role and workflow
- responsive check for staff desktop and volunteer mobile layouts

For the V5 P0 workflow, the canonical end-to-end acceptance sequence is in
`docs/product-functional-scope-v5.md`.
