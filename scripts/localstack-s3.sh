#!/usr/bin/env bash
# Back up and restore the dev LocalStack S3 buckets.
#
# Why: the community LocalStack image keeps S3 objects in memory only, so recreating the
# localstack container (docker compose up --force-recreate, down, a host reboot) empties every
# bucket while the database rows that point at the files stay behind.
#
# Usage:
#   scripts/localstack-s3.sh backup    # copy every bucket to .localstack-backup/<bucket>/
#   scripts/localstack-s3.sh restore   # copy .localstack-backup/ back into LocalStack
#
# Run `backup` before anything that recreates localstack and `restore` once it is healthy again.
set -euo pipefail
# Git Bash on Windows would otherwise rewrite the /tmp paths passed to docker.
export MSYS_NO_PATHCONV=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Relative paths from the repo root: docker.exe on Windows cannot read Git Bash /c/... paths.
cd "${ROOT}"
BACKUP_DIR=.localstack-backup
SERVICE=localstack

compose() { docker compose "$@"; }

backup() {
  compose exec -T "${SERVICE}" sh -c '
    rm -rf /tmp/s3-backup && mkdir -p /tmp/s3-backup
    for bucket in $(awslocal s3api list-buckets --query "Buckets[].Name" --output text); do
      mkdir -p "/tmp/s3-backup/${bucket}"
      awslocal s3 sync "s3://${bucket}" "/tmp/s3-backup/${bucket}" --quiet
    done
    find /tmp/s3-backup -type f | wc -l'
  rm -rf "${BACKUP_DIR}" && mkdir -p "${BACKUP_DIR}"
  compose cp "${SERVICE}:/tmp/s3-backup/." "${BACKUP_DIR}/"
  echo "[localstack-s3] backed up to ${BACKUP_DIR}"
}

restore() {
  [ -d "${BACKUP_DIR}" ] || { echo "[localstack-s3] no backup at ${BACKUP_DIR}" >&2; exit 1; }
  compose exec -T "${SERVICE}" sh -c 'rm -rf /tmp/s3-restore && mkdir -p /tmp/s3-restore'
  compose cp "${BACKUP_DIR}/." "${SERVICE}:/tmp/s3-restore/"
  compose exec -T "${SERVICE}" sh -c '
    for dir in /tmp/s3-restore/*/; do
      bucket=$(basename "${dir}")
      awslocal s3 mb "s3://${bucket}" >/dev/null 2>&1 || true
      awslocal s3 sync "${dir}" "s3://${bucket}" --quiet
    done
    find /tmp/s3-restore -type f | wc -l'
  echo "[localstack-s3] restored from ${BACKUP_DIR}"
}

case "${1:-}" in
  backup) backup ;;
  restore) restore ;;
  *) echo "usage: $0 backup|restore" >&2; exit 2 ;;
esac
