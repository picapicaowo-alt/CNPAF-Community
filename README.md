# CNPAF Collect

PWA for CNPAF field collection: **capture → server-side privacy scan → AI propose → human approve → origin-split analytics**.

Not a research OS. Not an App Store build. Same site for volunteers (phone) and coordinators (desktop). Add to Home Screen on iOS Safari.

## Stack

- `apps/web` — Next.js App Router PWA
- `packages/shared` — lookups, Zod contracts, i18n, source-kind handlers
- `packages/db` — Postgres schema, SQL migrations, seeds

Lookups live in seed tables (not Postgres ENUMs). Activity definitions, canonical themes, and AI prompts are versioned.

**Branches:** one repo with `cursor/database`, `cursor/backend`, `cursor/ai`, and
`cursor/frontend` module branches. See
[docs/branch-workflow.md](docs/branch-workflow.md).

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

The seed command does not embed a default credential. For a local-only demo,
set a unique 12+ character `SEED_PASSWORD` before running `npm run db:seed`.
That opt-in creates or refreshes the following role accounts, plus the USC
student volunteer catalog below. Every local account uses `SEED_PASSWORD`.

| Role | Local account |
| --- | --- |
| Admin | `admin@cnpaf.local` |
| Operations reviewer | `ops@cnpaf.local` |
| Research lead | `research@cnpaf.local` |
| Approved-data stakeholder | `stakeholder@cnpaf.local` |
| General volunteer | `volunteer@cnpaf.local` |

| USC school / department | Student volunteer accounts |
| --- | --- |
| Leonard Davis School of Gerontology | `usc.gerontology.alex@cnpaf.local`, `usc.gerontology.maya@cnpaf.local` |
| Suzanne Dworak-Peck School of Social Work | `usc.socialwork.jordan@cnpaf.local` |
| Sol Price School of Public Policy | `usc.publicpolicy.priya@cnpaf.local` |
| Viterbi School of Engineering | `usc.engineering.ethan@cnpaf.local` |
| Keck School of Medicine | `usc.medicine.sofia@cnpaf.local` |
| Dornsife College of Letters, Arts and Sciences | `usc.dornsife.noah@cnpaf.local` |

For a custom local catalog, `SEED_DEMO_USERS_JSON` accepts an organization name,
a unique 12+ character password, and explicit `{ email, name, roleKey }` rows.

AI provider and model selection come from the published workflow version. With
no API key, seeded development workflows use the deterministic local provider.
When `OPENAI_API_KEY` is present, seeding publishes all four AI workflows against
the OpenAI Responses API using `AI_MODEL` (default `gpt-5.4-mini`). Set
`AI_PROVIDER=local_heuristic` to explicitly keep local analysis.

For the Docker deployment profile, keep the production key in ignored
`.env.prod-ai` and layer it over the normal deployment environment:

```bash
docker compose --env-file .env --env-file .env.prod-ai --profile app up -d --build
```

With the development server running, execute the mutating local operational
acceptance test with:

```bash
npm run test:e2e:full-chain
```

It creates a namespaced USC–CNPAF program and form, configures a university and
three ADHC locations, assigns seven student volunteers, submits and classifies
seven records, approves them, and verifies analytics and approved-data access.

Attachments default to local disk (`STORAGE_BACKEND=local`, `UPLOAD_DIR`). On AWS set `STORAGE_BACKEND=s3` plus `S3_BUCKET` / `S3_REGION`. For MinIO or other S3-compatible stores, also set `S3_ENDPOINT`. EC2 should use an instance role; do not put access keys in git.

## v1 behavior

- Field visits require de-identification attestation; professor interviews store names; literature stores title/URL
- PII scan happens **before** any external model call
- Images, audio, video, and bounded document attachments are optional. JPEG EXIF is stripped. Dataset AI sends supported images only after an explicit human privacy-review attestation; audio, video, and documents remain in-product sources unless a separately approved transcription workflow is configured.
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

All workspaces use strict TypeScript. Run the enforced local quality gate before
handoff or review:

```bash
npm run check
```

Implementation boundaries and frontend/backend module rules are defined in
[docs/application-architecture.md](docs/application-architecture.md). The V5
business workflow and acceptance baseline are defined in
[docs/product-functional-scope-v5.md](docs/product-functional-scope-v5.md).

The current integration audit and all local updates are summarized in
[docs/latest-update-summary.md](docs/latest-update-summary.md). Fixed engineering
rules live in [docs/coding-standards.md](docs/coding-standards.md) and
[CONTRIBUTING.md](CONTRIBUTING.md). The one-repo, four-module-branch ownership
and integration flow are documented in
[docs/repository-strategy.md](docs/repository-strategy.md).

The demo-ready Dataset Phase 1 relationships and acceptance flow are recorded in
[docs/dataset-phase-1-demo.md](docs/dataset-phase-1-demo.md).
The agreed Records → Dataset → Report → Rating sequence and Local-to-S3
migration gates are recorded in
[docs/dataset-report-rating-roadmap.md](docs/dataset-report-rating-roadmap.md).
The executable Local-to-S3 operator procedure is in
[docs/storage-migration-runbook.md](docs/storage-migration-runbook.md).
