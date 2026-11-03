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

## Troubleshooting: every frontend page answers 404

After the frontend container restarts (Docker Desktop or the machine restarted, `docker compose up -d` on existing containers), Turbopack can reuse a stale route cache and answer **404 — Không tìm thấy trang** for every route, `/` and `/login` included.

The `frontend` service in `compose.yml` now drops that cache on every start (`command: sh -c "rm -rf /app/.next/dev/cache && exec npm run dev"`), so a plain `docker compose restart frontend` is enough. A container created before that change keeps its old command until it is recreated with `docker compose up -d frontend`. If 404s still appear, clear the cache by hand and restart:

```bash
docker compose exec -T frontend sh -c 'rm -rf /app/.next/dev/cache'
docker compose restart frontend
```

The first request then takes about 30 s while Turbopack recompiles. A signed-out `http://localhost:3000/` should redirect to `/login` and answer 200.

- Keep the `sh -c '...'` wrapper: in Git Bash on Windows a bare `/app/...` argument is rewritten into a Windows path.
- Clearing without restarting does not help, and a restart without clearing still answers 404.
- Never run `docker compose rm -sfv frontend` to "reset" it: `-v` deletes the `node_modules` volume.

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
