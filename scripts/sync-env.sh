#!/usr/bin/env bash
# Ensure .env files exist and sync shared vars from root .env → backend/.env
# for local host run (Docker infra on the offset ports set in root .env —
# PG_PORT/REDIS_PORT/LOCALSTACK_PORT, default 15432/16379/14566).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_ENV="${ROOT}/.env"
ROOT_EXAMPLE="${ROOT}/.env.example"
BACKEND_ENV="${ROOT}/backend/.env"
BACKEND_EXAMPLE="${ROOT}/backend/.env.example"
FRONTEND_ENV="${ROOT}/frontend/.env"
FRONTEND_EXAMPLE="${ROOT}/frontend/.env.example"

copy_if_missing() {
  local dest=$1
  local src=$2
  # A side not checked out yet (no example file) has nothing to copy.
  [[ -f "${src}" ]] || return 0
  if [[ ! -f "${dest}" ]]; then
    cp "${src}" "${dest}"
    echo "[sync-env] Created ${dest#${ROOT}/} from ${src#${ROOT}/}"
  fi
}

get_var() {
  local key=$1
  local file=$2
  grep -E "^${key}=" "${file}" 2>/dev/null | tail -1 | cut -d= -f2- || true
}

set_var() {
  local file=$1
  local key=$2
  local value=$3
  if grep -qE "^${key}=" "${file}"; then
    sed "s|^${key}=.*|${key}=${value}|" "${file}" > "${file}.tmp" && mv "${file}.tmp" "${file}"
  else
    echo "${key}=${value}" >> "${file}"
  fi
}

copy_if_missing "${ROOT_ENV}" "${ROOT_EXAMPLE}"
copy_if_missing "${BACKEND_ENV}" "${BACKEND_EXAMPLE}"
copy_if_missing "${FRONTEND_ENV}" "${FRONTEND_EXAMPLE}"

DB_NAME="$(get_var DB_NAME "${ROOT_ENV}")"
DB_USER="$(get_var DB_USER "${ROOT_ENV}")"
DB_PASSWORD="$(get_var DB_PASSWORD "${ROOT_ENV}")"
TENANT_ID="$(get_var TENANT_ID "${ROOT_ENV}")"
SES_FROM_EMAIL="$(get_var SES_FROM_EMAIL "${ROOT_ENV}")"
ENABLED_PLUGINS="$(get_var ENABLED_PLUGINS "${ROOT_ENV}")"
ENABLED_FEATURES="$(get_var ENABLED_FEATURES "${ROOT_ENV}")"

DB_NAME="${DB_NAME:-erp_platform}"
DB_USER="${DB_USER:-erp_user}"
DB_PASSWORD="${DB_PASSWORD:-erp_pass_dev}"

# Published host ports — must match what compose.yml maps, which reads the same
# root .env. A worktree that shifted its ports gets a backend/.env pointing at
# its own containers rather than whichever stack happens to own 15432.
PG_PORT="$(get_var PG_PORT "${ROOT_ENV}")"
REDIS_PORT="$(get_var REDIS_PORT "${ROOT_ENV}")"
LOCALSTACK_PORT="$(get_var LOCALSTACK_PORT "${ROOT_ENV}")"
PG_PORT="${PG_PORT:-15432}"
REDIS_PORT="${REDIS_PORT:-16379}"
LOCALSTACK_PORT="${LOCALSTACK_PORT:-14566}"

set_var "${BACKEND_ENV}" DB_NAME "${DB_NAME}"
set_var "${BACKEND_ENV}" DB_USER "${DB_USER}"
set_var "${BACKEND_ENV}" DB_PASSWORD "${DB_PASSWORD}"
set_var "${BACKEND_ENV}" DATABASE_URL "postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${PG_PORT}/${DB_NAME}"
set_var "${BACKEND_ENV}" DB_HOST "localhost"
set_var "${BACKEND_ENV}" DB_PORT "${PG_PORT}"
set_var "${BACKEND_ENV}" REDIS_HOST "localhost"
set_var "${BACKEND_ENV}" REDIS_PORT "${REDIS_PORT}"
set_var "${BACKEND_ENV}" REDIS_URL "redis://localhost:${REDIS_PORT}"
set_var "${BACKEND_ENV}" AWS_ENDPOINT "http://localhost:${LOCALSTACK_PORT}"

if [[ -n "${TENANT_ID}" ]]; then
  set_var "${BACKEND_ENV}" TENANT_ID "${TENANT_ID}"
  set_var "${BACKEND_ENV}" CUSTOMER_PROFILE "${TENANT_ID}"
fi

if [[ -n "${SES_FROM_EMAIL}" ]]; then
  set_var "${BACKEND_ENV}" SES_FROM_EMAIL "${SES_FROM_EMAIL}"
  if [[ "${SES_FROM_EMAIL}" == *@* ]]; then
    set_var "${BACKEND_ENV}" SEED_EMAIL_DOMAIN "${SES_FROM_EMAIL#*@}"
  fi
fi

if [[ -n "${ENABLED_PLUGINS}" ]]; then
  set_var "${BACKEND_ENV}" ENABLED_PLUGINS "${ENABLED_PLUGINS}"
fi

if [[ -n "${ENABLED_FEATURES}" ]]; then
  set_var "${BACKEND_ENV}" ENABLED_FEATURES "${ENABLED_FEATURES}"
fi

echo "[sync-env] Synced .env → backend/.env (DB=${DB_NAME}, local host ports)"
