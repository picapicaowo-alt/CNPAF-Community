# CNPAF Collect coding standards

These rules are part of the repository contract. `npm run check` enforces the
rules that can be checked safely without relying on reviewer memory.

## TypeScript

- Keep `strict` enabled in every workspace. Do not use explicit `any`; accept
  `unknown` at external boundaries and narrow it with Zod or type guards.
- Export one canonical DTO for every HTTP shape from `@cnpaf/shared`; do not keep
  frontend and backend copies of the same contract.
- Prefer discriminated unions for state transitions and dynamic controls.
- Avoid unsafe casts. A cast may document a library boundary only after runtime
  validation or a database invariant makes the value safe.
- Functions should have one domain purpose. Extract pure parsing, sorting,
  validation, and serialization helpers from React and database code.

## React and Next.js

- `page.tsx` composes a feature screen and owns only route-level parameters or
  navigation. Reusable UI belongs in `src/features/<domain>` or `src/components`.
- Client Components cannot be async. Effects declare stable dependencies,
  clean up subscriptions, and ignore or abort stale requests when races are
  possible.
- Independent requests start together with `Promise.all`. Do not introduce a
  request waterfall for data that can load concurrently.
- Browser networking is centralized in `features/<domain>/api.ts`. Components
  and UI route files do not call `fetch` directly.
- Use semantic controls, associated labels, keyboard-accessible interactions,
  visible focus, and an accessible loading/error status.
- Internal navigation uses `next/link`; dynamic App Router parameters follow the
  installed Next.js 16 async conventions.

## Backend and API

- Route Handlers authenticate, parse one strict request contract, call a domain
  service, and return the documented response/error. Multi-step transactions
  belong in `src/lib/modules`.
- Every mutation verifies permission and scope, validates its state transition,
  writes required audit/notification rows atomically, and returns a stable code.
- Network, AI, storage, and email operations never run inside a database
  transaction.
- API paths under `/api/v1` are public contract constants, not deployment
  configuration. External origins and service endpoints are runtime config.

## Database

- Migrations are forward-only and named `NNNN_description.sql`. Never edit an
  already deployed migration; add the next number.
- Update `packages/db/src/schema.ts` in the same change. The migration suite
  applies every numbered SQL file and compares all public tables and columns to
  Drizzle.
- Use constraints and indexes for durable invariants. Do not rely on a React
  control to protect immutable versions, cross-organization references, or
  idempotency.
- User-editable catalogs use versioned registry tables. Closed TypeScript enums
  are limited to truly stable protocol states.

## AI and privacy

- PII scanning happens before any external provider call. Photos are never sent
  to AI.
- Provider, model, prompt, output schema, workflow, and fallback policy are
  version-pinned database records. Each run stores provenance and its input hash.
- Keys and external endpoints are supplied through the typed server config.
  Provider configuration may name an environment variable but must not store its
  value.
- Model output is untrusted input: validate it before persistence and require a
  human decision for findings or safety-sensitive actions.

## Hardcode policy

"No hardcode" means no environment-specific URL, credential, organization/user
ID, model override, storage location, or mutable business catalog embedded in
runtime source. The following literals are legitimate code contracts:

- `/api/v1` routes and HTTP methods;
- stable workflow/permission keys shared across layers;
- validation bounds and protocol states backed by tests;
- bilingual copy and seed fixtures explicitly identified as defaults.

All `process.env` reads belong in `apps/web/src/config/server.ts` or
`packages/db/src/runtime-config.ts`. `npm run check:architecture` blocks direct UI
fetches, browser/server boundary violations, explicit `any`, source-level external
URLs, environment reads outside these boundaries, and common credential forms.

## Comments and documentation

- Comments explain invariants, security assumptions, compatibility behavior, or
  a non-obvious trade-off. Prefer clear names over narration.
- Update OpenAPI and architecture documents with behavior changes.
- Record a repository-boundary decision before moving code between deployables.
