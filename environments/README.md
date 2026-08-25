# CNPAF runtime environments

The application remains one maintainable monorepo. This directory separates
runtime configuration examples without duplicating application code.

- `local/.env.example` runs Next.js on the host with PostgreSQL and local object
  storage for development.
- `aws/.env.example` runs the same build against PostgreSQL and S3.
- `aws/compose.postgres.yml` provisions one project-scoped PostgreSQL instance;
  run it once with the Dev env file and once with the Prod env file so their
  containers, networks, ports, and volumes remain independent.
- `aws/nginx/` contains isolated reverse-proxy sites for the Dev and Prod
  domains. Both applications bind only to loopback; Nginx is the public edge.
- `aws/scripts/`, `aws/systemd/`, and `aws/logrotate/` provide streamed S3
  database backups and bounded Community-only process logs.

Copy the relevant example to the ignored root `.env`, fill deployment-specific
values outside Git, then run:

```bash
npm run env:check
npm run db:migrate
npm run db:seed
npm run dev
```

AWS credentials are never stored here. Production compute should use an
instance/task role. A developer workstation may use the standard AWS SDK
credential chain. `npm run env:check` uses that same SDK chain and performs a
read-only S3 bucket access check when `STORAGE_BACKEND=s3`.

For an existing local `.env` created before Docker variables were introduced,
add `CNPAF_DB_USER`, `CNPAF_DB_PASSWORD`, and `CNPAF_DB_NAME` so
`docker compose` can provision PostgreSQL reproducibly. Keep `DATABASE_URL`
consistent with those values.

The S3 migration and rollback procedure remains authoritative in
`docs/storage-migration-runbook.md`.

## AWS Dev/Prod topology

| Environment | Public URL | Loopback app | Loopback database | S3 prefix |
| --- | --- | --- | --- | --- |
| Dev | `https://dev.community.cnpaf.org` | `127.0.0.1:3601` | `127.0.0.1:5434` | `cnpaf/community/dev` |
| Prod | `https://community.cnpaf.org` | `127.0.0.1:3600` | `127.0.0.1:5435` | `cnpaf/community/prod` |

Use separate environment files outside Git, for example
`/home/ubuntu/apps/cnpaf-community/shared/dev.env` and `prod.env`. Start the
databases with distinct Compose project names:

```bash
docker compose --project-name cnpaf-community-dev \
  --env-file /home/ubuntu/apps/cnpaf-community/shared/dev.env \
  -f environments/aws/compose.postgres.yml up -d

docker compose --project-name cnpaf-community-prod \
  --env-file /home/ubuntu/apps/cnpaf-community/shared/prod.env \
  -f environments/aws/compose.postgres.yml up -d
```

Do not expose ports 3600, 3601, 5434, or 5435 in the EC2 security group. Only
Nginx should accept public HTTP(S) traffic. Prefer an EC2 instance profile for
AWS SDK credentials; never store access keys in either env file.

`aws/cnpaf-community-storage.yaml` creates the production-grade storage layer:

- one private, encrypted, versioned S3 bucket retained if the stack is removed;
- separate `cnpaf/community/dev` and `cnpaf/community/prod` object prefixes;
- a least-privilege EC2 role limited to those object prefixes; and
- an instance profile that AWS CLI and the Node AWS SDK can use for short-lived
credentials automatically.

Deploy it in `us-west-2` with IAM capability enabled, then place the
`BucketName` output into both environment files. Attach the stack's
`InstanceProfileName` output to the EC2 instance once through **EC2 → Actions →
Security → Modify IAM role**. Do not create SDK access keys.

## Backups and log retention

The backup script uses PostgreSQL's compressed custom format and streams it
directly from the container to S3. It does not create a large temporary file on
the EC2 instance. Install the script and timer units, then enable both isolated
environments:

```bash
sudo install -m 0755 environments/aws/scripts/backup-postgres-to-s3.sh \
  /usr/local/sbin/cnpaf-community-db-backup
sudo install -m 0644 environments/aws/systemd/cnpaf-community-db-backup@.service \
  environments/aws/systemd/cnpaf-community-db-backup@.timer \
  /etc/systemd/system/
sudo install -m 0644 environments/aws/logrotate/cnpaf-community \
  /etc/logrotate.d/cnpaf-community
sudo systemctl daemon-reload
sudo systemctl enable --now cnpaf-community-db-backup@dev.timer \
  cnpaf-community-db-backup@prod.timer
```

Dev database backups expire after 14 days and Prod backups after 35 days. S3
versioning still protects application objects, while noncurrent object versions
expire after 90 days. Restore into a fresh database first; never overwrite the
active database during a restore drill:

```bash
aws s3 cp s3://BUCKET/cnpaf/community/prod/backups/database/TIMESTAMP.dump - \
  | docker exec -i TARGET_POSTGRES pg_restore --clean --if-exists \
      --no-owner --no-privileges --username cnpaf --dbname TARGET_DATABASE
```
