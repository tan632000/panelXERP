#!/bin/bash
set -euo pipefail

SES_FROM="${SES_FROM_EMAIL:-noreply@example.com}"
awslocal ses verify-email-identity --email-address "${SES_FROM}" >/dev/null 2>&1 || true
echo "[localstack] SES identity ${SES_FROM} ready"
