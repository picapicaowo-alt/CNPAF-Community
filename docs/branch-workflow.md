# Branch workflow: one repo, four module branches

Repository: `picapicaowo-alt/CNPAF-Community`.

CNPAF Collect uses four long-lived branches in the same Git repository:

| Branch | Work lane |
| --- | --- |
| `cursor/database` | Schema, migrations, seed and database tests |
| `cursor/backend` | API, contracts, authorization and domain services |
| `cursor/ai` | AI workflow/provider/review/provenance code |
| `cursor/frontend` | React/Next UI, PWA and browser feature clients |

The complete path ownership, dependency order and cross-module rules are the
canonical policy in [repository-strategy.md](repository-strategy.md).

## Daily workflow

1. Start from the owning module branch.
2. Pull the latest upstream dependency branch before changing a shared seam.
3. Keep shared contracts, database migration and consuming code in explicit,
   reviewable commits.
4. Run `npm run check` on every branch and `npm run build` on the integrated
   frontend line.
5. Merge the verified integrated result to `main` for release.

## Running locally

All branches use the same local stack:

```bash
docker compose up -d postgres
npm install
npm run db:migrate && npm run db:seed
npm run dev
```

Open http://localhost:3000. The frontend uses same-origin `/api/v1` contracts;
branch separation never changes runtime URLs.
