# Branch workflow (one repo, two lines)

Repo: https://github.com/picapicaowo-alt/CNPAF-Community

We use **two long-lived branches** in this monorepo—not two GitHub repos.

| Branch | Owns | Typical paths |
|--------|------|----------------|
| `cursor/backend` | API, data layer, server libs, infra | `packages/db`, `packages/shared`, `apps/web/src/app/api`, `apps/web/src/lib`, `docker-compose.yml`, `Dockerfile`, `.env.example` |
| `cursor/frontend` | PWA UI, client behavior | `apps/web/src/app` (pages), `apps/web/src/components`, `apps/web/public`, `apps/web/src/app/globals.css`, `apps/web/src/lib/offline.ts` |

`packages/shared` holds Zod contracts and i18n used by both sides—coordinate changes that touch API shapes.

## Daily work

- Backend fixes and API changes → commit on `cursor/backend`
- Pages, forms, ops UI → commit on `cursor/frontend`
- Merge both into `main` when a slice is ready to integrate or deploy

## Running locally

Still one Next.js app (UI + `/api/v1` in the same process):

```bash
docker compose up -d postgres
npm install
npm run db:migrate && npm run db:seed
npm run dev
```

Open http://localhost:3000

## Cross-branch API calls

While developing on either branch, the UI uses relative paths (`/api/v1/...`) against the same origin. If the API is hosted separately later, set `NEXT_PUBLIC_API_URL` on the frontend branch.
