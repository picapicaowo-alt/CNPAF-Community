#!/usr/bin/env bash

set -Eeuo pipefail

if [[ $# -ne 1 || ! "$1" =~ ^(dev|prod)$ ]]; then
  echo "Usage: $0 dev|prod" >&2
  exit 64
fi

environment="$1"
env_file="/home/ubuntu/apps/cnpaf-community/shared/${environment}.env"
compose_project="cnpaf-community-${environment}"

if [[ ! -r "$env_file" ]]; then
  echo "Environment file is not readable: $env_file" >&2
  exit 66
fi

set -a
# The deployment env files are trusted, access-restricted configuration.
# shellcheck disable=SC1090
source "$env_file"
set +a

required=(CNPAF_DB_USER CNPAF_DB_NAME S3_BUCKET S3_REGION S3_PREFIX)
for variable in "${required[@]}"; do
  if [[ -z "${!variable:-}" ]]; then
    echo "Missing ${variable} in ${env_file}" >&2
    exit 78
  fi
done

container_id="$({
  docker ps \
    --filter "label=com.docker.compose.project=${compose_project}" \
    --filter "label=com.docker.compose.service=postgres" \
    --format '{{.ID}}'
} | head -n 1)"

if [[ -z "$container_id" ]]; then
  echo "No running PostgreSQL container found for ${compose_project}" >&2
  exit 69
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
object_key="${S3_PREFIX%/}/backups/database/${timestamp}.dump"
destination="s3://${S3_BUCKET}/${object_key}"

echo "Streaming ${compose_project} PostgreSQL backup to ${destination}"
docker exec "$container_id" \
  pg_dump \
    --username "$CNPAF_DB_USER" \
    --dbname "$CNPAF_DB_NAME" \
    --format custom \
    --compress 6 \
    --no-owner \
    --no-privileges \
  | aws s3 cp - "$destination" \
      --region "$S3_REGION" \
      --sse AES256 \
      --only-show-errors

aws s3api head-object \
  --bucket "$S3_BUCKET" \
  --key "$object_key" \
  --region "$S3_REGION" \
  --query '{Size:ContentLength,Encryption:ServerSideEncryption,Modified:LastModified}'

echo "Backup completed: ${destination}"
