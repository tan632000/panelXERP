#!/bin/bash
# Init S3 buckets for sales + master-data phase (tech stack §7.4–§7.5)
set -euo pipefail

create_bucket() {
  local bucket="$1"
  if awslocal s3 ls "s3://${bucket}" >/dev/null 2>&1; then
    echo "[localstack] Bucket ${bucket} already exists"
    return 0
  fi
  awslocal s3 mb "s3://${bucket}"
  echo "[localstack] Created bucket ${bucket}"
}

# Default upload bucket (AWS_S3_BUCKET=erp-files)
create_bucket erp-files

# RFQ / quotation attachments (tech stack §7.2)
create_bucket erp-documents

# Application logs archive (tech stack §4.5 / §7.5 — AWS_S3_LOG_BUCKET)
create_bucket erp-logs
