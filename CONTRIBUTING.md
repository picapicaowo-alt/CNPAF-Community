# Contributing to CNPAF Collect

The repository is a strict TypeScript modular monorepo. Every change must keep
the frontend, HTTP contract, domain services, database migrations, and AI
workflow provenance synchronized.

## Required workflow

1. Read `docs/application-architecture.md` and `docs/coding-standards.md`.
2. Keep a change in dependency order: shared contract → database migration →
   backend service/route → frontend feature → tests/docs.
3. Never commit credentials, local `.env` files, uploaded data, or generated
   build output.
4. Run `npm run check` and `npm run build` before handoff.
5. For workflow changes, run `npm run test:e2e:full-chain` against the local
   seeded stack and verify desktop plus mobile layouts.

## Review contract

- A database change requires a forward-only numbered SQL migration and matching
  Drizzle schema change. The schema-sync test must pass.
- A public API change requires a strict shared Zod schema, OpenAPI update, route
  inventory coverage, authorization, audit behavior, and typed frontend client.
- AI provider/model/prompt/output schema selection is versioned data. Secrets and
  endpoints are runtime environment configuration, never source literals.
- Complex React routes compose `src/features`; browser requests live in the
  feature's `api.ts` file.
- Explain why for security, privacy, transaction, migration, or non-obvious
  business invariants. Do not add comments that merely restate syntax.

See `docs/repository-strategy.md` before changing repository or deployment
boundaries.
