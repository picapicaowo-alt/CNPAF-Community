# CNPAF Collect

PWA for CNPAF field collection: **capture → server-side privacy scan → AI propose → human approve → origin-split analytics**.

Not a research OS. Not an App Store build. Same site for volunteers (phone) and coordinators (desktop). Add to Home Screen on iOS Safari.

## Stack

- `apps/web` — Next.js App Router PWA
- `packages/shared` — lookups, Zod contracts, i18n, source-kind handlers
- `packages/db` — Postgres schema, SQL migrations, seeds

Lookups live in seed tables (not Postgres ENUMs). Activity definitions, canonical themes, and AI prompts are versioned.

**Branches:** backend work on `cursor/backend`, frontend work on `cursor/frontend` (same repo). See [docs/branch-workflow.md](docs/branch-workflow.md).

## Setup

Postgres runs in Docker. Next.js usually runs on the host.

```bash
cp .env.example .env
cp .env.example apps/web/.env.local
docker compose up -d postgres
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000

To run the web app in Docker as well:

```bash
docker compose --profile app up --build
```

Demo accounts (password from `SEED_PASSWORD`, default `cnpaf-dev-change-me`):

- `volunteer@cnpaf.local`
- `ops@cnpaf.local`
- `admin@cnpaf.local`

Set `OPENAI_API_KEY` to use OpenAI structured JSON. Without it, analysis uses a local heuristic so the queue still runs.

Attachments default to local disk (`STORAGE_BACKEND=local`, `UPLOAD_DIR`). On AWS set `STORAGE_BACKEND=s3` plus `S3_BUCKET` / `S3_REGION`. For MinIO or other S3-compatible stores, also set `S3_ENDPOINT`. EC2 should use an instance role; do not put access keys in git.

## v1 behavior

- Field visits require de-identification attestation; professor interviews store names; literature stores title/URL
- PII scan happens **before** any external model call
- Photos: optional, EXIF stripped, never sent to AI
- Drafts autosave to IndexedDB and sync with idempotency keys
- Service worker does not force-reload while a capture form is open
- Dashboard splits Field / Expert / Literature; metric is **Submission completion**, not visit attendance
- Safety flags are a separate queue; nothing is auto-reported

## API

Versioned at `/api/v1`. Health: `GET /api/v1/health`.

Frontend integration should use the [backend API contract](docs/backend-api-contract.md), the [OpenAPI description](docs/openapi.v1.yaml), and the exported Zod request schemas in `packages/shared`.

Backend authorization is database-driven RBAC with organization/site/service/template/data/research-use scopes and explicit allow/deny overrides. Run the backend and migration suite with:

```bash
npm run test:backend
```
