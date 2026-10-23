# Docker assets — ERP Platform

Layout follows the same pattern as `ai-mining-develop/docker`. **Compose files live at the repo root.**

## Directories

| Directory | Description |
|-----------|-------------|
| `rdb/` | PostgreSQL Dockerfile + `init-db.sql` |
| `redis/` | Redis Dockerfile |
| `localstack/` | LocalStack Dockerfile + S3/SQS/SES init scripts |
| `backend/` | NestJS — `Dockerfile.dev`, `Dockerfile.prod` |
| `frontend/` | Next.js — `Dockerfile.dev`, `Dockerfile.prod` |

Build context for `backend/` and `frontend/` images is the **repo root** (`.`).

## Compose

| File | Backend | Frontend |
|------|---------|----------|
| `../compose.yml` | `docker/backend/Dockerfile.dev` | `docker/frontend/Dockerfile.dev` |
| `../compose.production.yml` | `docker/backend/Dockerfile.prod` | `docker/frontend/Dockerfile.prod` |

## LocalStack init (sales + master-data scope)

| Script | Purpose |
|--------|---------|
| `init-s3.sh` | Buckets: `erp-files`, `erp-documents`, `erp-logs` |
| `init-sqs.sh` | No-op — async jobs use Bull/Redis; add SQS when Planning/MRP modules land |
| `init-ses.sh` | Verify SES identity from `SES_FROM_EMAIL` (default `noreply@example.com`) |

Additional buckets (`erp-drawings`, `erp-reports`, …) are added when the matching modules are deployed.

## Quick start (local)

From the **repo root**:

```bash
make setup       # first time / rebuild images
make up          # daily start (no rebuild)
make db-setup    # first time: migrate + seed
```

Or manually:

```bash
chmod +x docker/localstack/*.sh
docker compose up --build -d
```

## Manual image build

```bash
docker build -f docker/backend/Dockerfile.dev -t erp-backend:dev .
docker build -f docker/backend/Dockerfile.prod -t erp-backend:prod .
docker build -f docker/frontend/Dockerfile.dev -t erp-frontend:dev .
docker build -f docker/frontend/Dockerfile.prod \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api/v1 \
  --build-arg NEXT_PUBLIC_APP_NAME="Acme ERP" \
  -t erp-frontend:prod .
```
