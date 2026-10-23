#!/bin/bash
# SQS queues are not required for init (sales + master-data).
# Bull + Redis handles async jobs. Add queues here when planning/MRP module is implemented.
set -euo pipefail

echo "[localstack] SQS init skipped — no queues needed for init scope"
