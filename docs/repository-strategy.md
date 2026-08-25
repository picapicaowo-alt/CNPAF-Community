# One repository, four module branches

## Decision

CNPAF Collect uses **one Git repository and four long-lived module branches**.
The branches separate ownership and review flow; they do not duplicate code and
are not independent repositories or deployments.

The four remote branches are:

| Branch | Primary ownership | Typical paths |
| --- | --- | --- |
| `cursor/database` | Postgres schema, migrations, seed and database verification | `packages/db/**` |
| `cursor/backend` | HTTP API, authorization, domain services, OpenAPI and shared HTTP contracts | `apps/web/src/app/api/**`, `apps/web/src/lib/modules/**`, `packages/shared/src/backend-contracts.ts`, `docs/openapi.v1.yaml` |
| `cursor/ai` | AI workflows, providers, prompts, output validation, review and provenance | `apps/web/src/lib/ai*.ts`, `apps/web/src/app/api/v1/ai/**`, AI-specific shared contracts |
| `cursor/frontend` | React/Next UI, PWA behavior and browser feature clients | `apps/web/src/app/**` excluding `api`, `apps/web/src/features/**`, `apps/web/src/components/**`, `apps/web/public/**`, CSS |

`packages/shared` is the contract seam. General HTTP DTO changes are coordinated
by Backend; AI-specific contracts are coordinated by AI. A database change
needed by either module is implemented and verified on Database first.

## Dependency and integration order

```text
cursor/database ─┐
                 ├──> cursor/backend ───> cursor/frontend ───> main
cursor/ai ───────┘
```

The diagram describes dependency order, not permission to merge unverified
work. AI synchronizes with the database and backend contracts it consumes; the
backend integration then exposes a stable API to Frontend.

For a cross-module feature, organize reviewable commits in this order:

1. `cursor/database`: schema, forward-only migration, seed and drift tests.
2. `cursor/backend`: shared Zod/OpenAPI contract, domain service, Route Handler,
   authorization, audit and backend tests.
3. `cursor/ai`: provider/workflow implementation and provenance tests when the
   feature uses AI.
4. `cursor/frontend`: feature API client, React UI, responsive behavior and
   browser verification.
5. `main`: only after `npm run check`, `npm run build` and the affected end-to-end
   flow pass on the integrated commit.

## Branch rules

- A branch owns its module; it does not weaken dependency boundaries.
- Do not copy DTOs or database definitions between branches. Merge the owning
  branch and consume the canonical source.
- Do not commit frontend-only controls for an API or migration that has not been
  integrated and verified.
- Database migrations remain forward-only and sequential across all branches.
- AI secrets and deployment endpoints remain typed runtime configuration.
- Rebase or merge the latest dependency branch before requesting downstream
  review; never force-push a shared branch without team coordination.
- `main` is the deployable integration line. The four module branches are work
  lanes, not four separate production versions.

## Current integration note

All four branches now exist locally and on `origin`. The current localhost build
also contains a large uncommitted integration set on `cursor/frontend`; those
changes are not represented by any branch tip until they are reviewed, split by
module ownership and committed.

Current status is intentionally explicit:

- [x] Four official long-lived module branches created and published.
- [x] Ownership, dependency order, checks, and merge policy documented.
- [ ] Existing uncommitted integration changes inventoried into reviewable
  Database, Backend, AI, and Frontend commit groups.
- [ ] Those groups committed to their owning branches and integrated into a
  reproducible `main` build.

Do not describe branch creation as completed code separation. The Local-to-S3
migration is cross-module work on Database and Backend, not an additional
long-lived branch.
