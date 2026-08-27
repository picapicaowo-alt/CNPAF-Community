#!/usr/bin/env bash

set -Eeuo pipefail

if [[ $# -ne 1 || ! "$1" =~ ^(dev|prod)$ ]]; then
  echo "Usage: $0 dev|prod" >&2
  exit 64
fi

environment="$1"
env_file="/home/ubuntu/apps/cnpaf-community/shared/${environment}.env"

if [[ ! -r "$env_file" ]]; then
  echo "Environment file is not readable: $env_file" >&2
  exit 66
fi

set -a
# The deployment env files are trusted, access-restricted configuration.
# shellcheck disable=SC1090
source "$env_file"
set +a

required=(APP_BASE_URL TASK_AUTOMATION_SECRET)
for variable in "${required[@]}"; do
  if [[ -z "${!variable:-}" ]]; then
    echo "Missing ${variable} in ${env_file}" >&2
    exit 78
  fi
done

curl --config - <<EOF
url = "${APP_BASE_URL%/}/api/v1/automation/tasks"
request = "POST"
header = "Authorization: Bearer ${TASK_AUTOMATION_SECRET}"
fail
silent
show-error
retry = 2
connect-timeout = 10
max-time = 120
EOF
