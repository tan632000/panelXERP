# ERP Platform — dev shortcuts (Docker Compose)
# Usage: make help

SHELL := /bin/bash
COMPOSE := docker compose
COMPOSE_FILE := compose.yml
COMPOSE_PROD_FILE := compose.production.yml

ENV_ROOT := .env
ENV_ROOT_EXAMPLE := .env.example
ENV_BACKEND := backend/.env
ENV_BACKEND_EXAMPLE := backend/.env.example
ENV_FRONTEND := frontend/.env
ENV_FRONTEND_EXAMPLE := frontend/.env.example
ENV_PROD := .env.production
ENV_PROD_EXAMPLE := .env.production.example

COMPOSE_PROD := $(COMPOSE) --env-file $(ENV_PROD) -f $(COMPOSE_PROD_FILE)

LOCALSTACK_SCRIPTS := docker/localstack/init-s3.sh docker/localstack/init-sqs.sh docker/localstack/init-ses.sh

.PHONY: help env init-scripts up setup down down-v restart logs logs-be logs-fe ps \
        migrate migrate-force seed db db-setup bootstrap \
        env-prod setup-prod build-prod deploy-prod update-prod up-prod down-prod restart-prod certbot-init \
        logs-prod logs-prod-be logs-prod-fe logs-prod-nginx ps-prod migrate-prod seed-prod seed-role-prod wait-backend-prod \
        backup-db backup-db-local backup-db-cron restore-db restore-db-prod import-sql import-sql-prod \
        lint lint-be lint-fe lint-fix lint-fix-be lint-fix-fe \
        lint-all lint-all-be lint-all-fe lint-fix-all lint-fix-all-be lint-fix-all-fe \
        format format-be format-fe format-all format-all-be format-all-fe \
        typecheck typecheck-be typecheck-fe \
        test test-be test-fe test-all test-all-be test-all-fe test-be-all test-fe-all build-be build-fe shell-be shell-fe \
        gen-module gen-feature gen-api-docs validate-api-docs gen-api-client \
        validate-migrations validate-migrations-strict

.DEFAULT_GOAL := help

help: ## Show available targets
	@grep -E '^[a-zA-Z0-9_-]+:.*##' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

env: ## Copy missing env files and sync root → backend for local run
	@chmod +x scripts/sync-env.sh
	@./scripts/sync-env.sh

init-scripts: ## Make LocalStack init scripts executable
	@chmod +x $(LOCALSTACK_SCRIPTS)
	@echo "[make] LocalStack init scripts are executable"

up: env init-scripts ## Check env, init scripts, start dev stack (no rebuild)
	$(COMPOSE) -f $(COMPOSE_FILE) up -d
	@$(MAKE) --no-print-directory stack-msg

setup: env init-scripts ## Check env, init scripts, build & start dev stack
	$(COMPOSE) -f $(COMPOSE_FILE) up --build -d
	@$(MAKE) --no-print-directory stack-msg

# Ports come from root .env so a worktree that shifted them prints its own URLs.
# Read with grep rather than `include .env`, which chokes on values Make would
# treat as syntax (#, spaces, $).
env-port = $(shell grep -E '^$(1)=' $(ENV_ROOT) 2>/dev/null | tail -1 | cut -d= -f2)

stack-msg:
	@FE="$(call env-port,FRONTEND_PORT)"; FE=$${FE:-3000}; \
	 BE="$(call env-port,BACKEND_PORT)"; BE=$${BE:-8080}; \
	 echo ""; \
	 echo "Stack starting:"; \
	 echo "  Frontend  → http://localhost:$${FE}"; \
	 echo "  Backend   → http://localhost:$${BE}/api/v1"; \
	 echo "  Swagger   → http://localhost:$${BE}/api/docs"; \
	 echo ""; \
	 echo "First time? Run: make db-setup"

down: ## Stop containers (keep volumes)
	$(COMPOSE) -f $(COMPOSE_FILE) down

down-v: ## Stop containers and remove volumes (reset DB)
	$(COMPOSE) -f $(COMPOSE_FILE) down -v

# Recreating keeps the anonymous /app/.next volume, so a corrupt Turbopack dev
# cache would survive it and every route answers 404; wipe it first. Only the
# dev cache goes: renewing all anonymous volumes would also reset node_modules.
restart: ## Restart stack (recreate BE/FE to reload .env, clear FE dev cache — no rebuild)
	-$(COMPOSE) -f $(COMPOSE_FILE) exec -T frontend rm -rf /app/.next/dev
	$(COMPOSE) -f $(COMPOSE_FILE) up -d --force-recreate --no-deps backend frontend

logs: ## Follow all service logs
	$(COMPOSE) -f $(COMPOSE_FILE) logs -f

logs-be: ## Follow backend logs only
	$(COMPOSE) -f $(COMPOSE_FILE) logs -f backend

logs-fe: ## Follow frontend logs only
	$(COMPOSE) -f $(COMPOSE_FILE) logs -f frontend

ps: ## Show container status
	$(COMPOSE) -f $(COMPOSE_FILE) ps

wait-backend: ## Wait until backend health endpoint responds
	@echo "[make] Waiting for backend..."
	@for i in $$(seq 1 30); do \
		if $(COMPOSE) -f $(COMPOSE_FILE) exec -T backend curl -sf http://localhost:8080/api/v1/health >/dev/null 2>&1; then \
			echo "[make] Backend is ready"; \
			exit 0; \
		fi; \
		sleep 2; \
	done; \
	echo "[make] ERROR: backend not ready after 60s"; \
	exit 1

# ts-node type-checks every file it loads; type safety comes from `make typecheck`, so the
# DB/script commands transpile only (migration:run drops from ~6 min to under a minute).
TS_FAST := -e TS_NODE_TRANSPILE_ONLY=true
# Loading the backend through ts-node still costs ~40s per command, while the watch compiler
# already keeps dist/ current. Run the compiled output when dist/ mirrors src/ (waiting up to
# ~10s for the watcher to catch up after a save), and fall back to ts-node otherwise.
# $(1) = compiled command, $(2) = ts-node fallback.
run_compiled_or_ts = \
	for i in 1 2 3 4 5; do \
		if reason=$$(./scripts/backend-dist-fresh.sh); then \
			echo "[make] Running from compiled dist/"; \
			exec $(COMPOSE) -f $(COMPOSE_FILE) exec backend $(1); \
		fi; \
		sleep 2; \
	done; \
	echo "[make] dist/ not usable ($$reason) — falling back to ts-node"; \
	$(COMPOSE) -f $(COMPOSE_FILE) exec $(TS_FAST) backend $(2)
MIGRATE_DIST := node -r tsconfig-paths/register node_modules/typeorm/cli.js migration:run -d dist/kernel/core/database/data-source.js
SEED_DIST := node -r tsconfig-paths/register dist/kernel/core/database/seeds/seed-runner.js
# Tool caches live in each container's node_modules volume, outside the bind-mounted source.
CACHE_DIR := node_modules/.cache

# Migration class names on disk that the `migrations` table has not recorded yet.
pending_migrations = $(shell comm -23 \
	<(find backend/src -path '*/database/migrations/*.ts' -not -name '*.spec.ts' \
		-exec sed -nE 's/^export class ([A-Za-z0-9_]+).*/\1/p' {} + | sort -u) \
	<($(COMPOSE) -f $(COMPOSE_FILE) exec -T postgres sh -c \
		'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -Atc "select name from migrations"' 2>/dev/null | sort -u))

migrate: env wait-backend ## Run database migrations — skipped when none is pending
	$(eval PENDING := $(pending_migrations))
	@if [ -z "$(PENDING)" ]; then echo "[make] No migrations are pending"; \
	else echo "[make] Pending: $(PENDING)"; \
	$(call run_compiled_or_ts,$(MIGRATE_DIST),npm run migration:run); fi

migrate-force: env wait-backend ## Run database migrations without the pending check
	@$(call run_compiled_or_ts,$(MIGRATE_DIST),npm run migration:run)

seed: env wait-backend ## Seed local DB in full (roles, users, plugin/screen data)
	@$(call run_compiled_or_ts,$(SEED_DIST),npm run seed)

db-setup: migrate seed ## Migrate + seed (run after first make setup)

db: db-setup ## Alias for db-setup

bootstrap: setup db-setup ## Full first-time setup: build, up, migrate, seed

# --- Production (EC2 / http://erp.example.com/) ---

env-prod: ## Copy .env.production from example if missing; refuse leftover CHANGE_ME
	@if [ ! -f $(ENV_PROD) ]; then \
		cp $(ENV_PROD_EXAMPLE) $(ENV_PROD); \
		echo "[make] Created $(ENV_PROD) — fill CHANGE_ME values then re-run"; \
		exit 1; \
	fi
	@if grep -qE '(^|[=])CHANGE_ME' $(ENV_PROD); then \
		echo "[make] ERROR: $(ENV_PROD) still contains CHANGE_ME — fill secrets first"; \
		exit 1; \
	fi

build-prod: env-prod ## Build production images (no start)
	$(COMPOSE_PROD) build

setup-prod: env-prod ## Build & start production stack (nginx :80/:443)
	$(COMPOSE_PROD) up --build -d
	@$(MAKE) --no-print-directory stack-msg-prod

deploy-prod: env-prod ## Deploy: CI-pulled images if passed, otherwise rebuild locally
	chmod +x scripts/deploy-prod.sh
	./scripts/deploy-prod.sh

update-prod: env-prod ## git pull --ff-only then rebuild locally
	git fetch origin
	git pull --ff-only
	$(MAKE) --no-print-directory deploy-prod

up-prod: env-prod ## Start production stack without rebuild
	$(COMPOSE_PROD) up -d
	@$(MAKE) --no-print-directory stack-msg-prod

stack-msg-prod:
	@echo ""
	@echo "Production stack starting:"
	@echo "  App      → https://erp.example.com/"
	@echo "  Swagger  → https://erp.example.com/api/docs"
	@echo ""
	@echo "First time? Run: make seed-prod"
	@echo "TLS:         Run: make certbot-init   (DNS A record + SG 80/443 first)"

certbot-init: env-prod ## Obtain Let's Encrypt cert, then switch nginx to HTTPS
	@echo "[make] Requesting certificate for $$(grep -E '^APP_HOST=' $(ENV_PROD) | cut -d= -f2- || echo erp.example.com)"
	$(COMPOSE_PROD) --profile certbot-init run --rm certbot-init
	$(COMPOSE_PROD) up -d --force-recreate --no-deps nginx
	@echo "[make] HTTPS enabled → https://erp.example.com/"

down-prod: ## Stop production stack (keep volumes)
	$(COMPOSE_PROD) down

restart-prod: env-prod ## Recreate BE/FE/nginx (no rebuild)
	$(COMPOSE_PROD) up -d --force-recreate --no-deps backend frontend nginx

logs-prod: ## Follow production logs
	$(COMPOSE_PROD) logs -f

logs-prod-be: ## Follow production backend logs
	$(COMPOSE_PROD) logs -f backend

logs-prod-fe: ## Follow production frontend logs
	$(COMPOSE_PROD) logs -f frontend

logs-prod-nginx: ## Follow production nginx logs
	$(COMPOSE_PROD) logs -f nginx

ps-prod: ## Show production container status
	$(COMPOSE_PROD) ps

wait-backend-prod: ## Wait until production backend health endpoint responds
	@echo "[make] Waiting for production backend..."
	@for i in $$(seq 1 45); do \
		if $(COMPOSE_PROD) exec -T backend curl -sf http://127.0.0.1:8080/api/v1/health >/dev/null 2>&1; then \
			echo "[make] Backend is ready"; \
			exit 0; \
		fi; \
		sleep 2; \
	done; \
	echo "[make] ERROR: production backend not ready after 90s"; \
	exit 1

# The prod image ships only dist/ — run the compiled data source, not src/*.ts.
migrate-prod: env-prod wait-backend-prod ## Run pending database migrations on staging/production
	$(COMPOSE_PROD) exec -T backend node -r tsconfig-paths/register node_modules/typeorm/cli.js migration:run -d dist/kernel/core/database/data-source.js

seed-prod: env-prod wait-backend-prod ## Seed staging/production DB (roles + missing users only — existing users untouched, no screen data)
	$(COMPOSE_PROD) exec backend node -r tsconfig-paths/register dist/kernel/core/database/seeds/seed-runner.js

seed-role-prod: env-prod wait-backend-prod ## Update role permissions on staging/production only — users are left untouched
	$(COMPOSE_PROD) exec backend node -r tsconfig-paths/register dist/kernel/core/database/seeds/seed-roles-runner.js

backup-db: env-prod ## Dump the prod/stg DB to backups/db and delete dumps older than 7 days
	chmod +x scripts/backup-db.sh
	./scripts/backup-db.sh prod

backup-db-local: ## Dump the local dev DB to backups/db (same 7-day retention)
	chmod +x scripts/backup-db.sh
	./scripts/backup-db.sh local

restore-db: ## Load a dump into the local dev DB: make restore-db FILE=backups/db/<name>.sql.gz
	@test -n "$(FILE)" || { echo "[make] usage: make restore-db FILE=backups/db/<name>.sql.gz"; exit 1; }
	chmod +x scripts/restore-db.sh
	./scripts/restore-db.sh "$(FILE)" local

restore-db-prod: env-prod ## Replace the prod/stg DB with a dump (asks to confirm): make restore-db-prod FILE=backups/<name>.sql.gz
	@test -n "$(FILE)" || { echo "[make] usage: make restore-db-prod FILE=backups/<name>.sql.gz"; exit 1; }
	chmod +x scripts/restore-db.sh
	ALLOW_PROD_RESTORE=1 ./scripts/restore-db.sh "$(FILE)" prod
	@echo "[make] restart the stack so the backend reconnects and runs pending migrations: make restart-prod"

import-sql: ## Run a SQL file on the local dev DB (no schema drop): make import-sql FILE=path/to/file.sql
	@test -n "$(FILE)" || { echo "[make] usage: make import-sql FILE=path/to/file.sql[.gz]"; exit 1; }
	chmod +x scripts/import-sql.sh
	./scripts/import-sql.sh "$(FILE)" local

import-sql-prod: env-prod ## Run a SQL file on the prod/stg DB (asks to confirm): make import-sql-prod FILE=path/to/file.sql
	@test -n "$(FILE)" || { echo "[make] usage: make import-sql-prod FILE=path/to/file.sql[.gz]"; exit 1; }
	chmod +x scripts/import-sql.sh
	./scripts/import-sql.sh "$(FILE)" prod

backup-db-cron: ## Install the daily 02:00 backup cron entry for the current user
	chmod +x scripts/backup-db.sh
	@( crontab -l 2>/dev/null | grep -v 'scripts/backup-db.sh'; \
	   echo "0 2 * * * cd $(CURDIR) && ./scripts/backup-db.sh >> $(CURDIR)/backups/backup-db.log 2>&1" ) | crontab -
	@mkdir -p backups
	@echo "[make] Installed daily backup at 02:00 — log: backups/backup-db.log"
	@crontab -l | grep backup-db.sh

LINT_BE_EXT := \.ts$$
LINT_FE_EXT := \.(tsx?|jsx?|mjs)$$
ESLINT_CHANGED := npx eslint --max-warnings=0 --no-warn-ignored --cache --cache-location $(CACHE_DIR)/eslint/

lint-be: ## ESLint backend — changed files only (container)
	$(eval FILES := $(call changed_files,backend,$(LINT_BE_EXT)))
	@if [ -z "$(FILES)" ]; then echo "lint-be: no changed files"; \
	else $(COMPOSE) -f $(COMPOSE_FILE) exec backend $(ESLINT_CHANGED) $(FILES); fi

lint-fe: ## ESLint frontend — changed files only + i18n check (container)
	$(eval FILES := $(call changed_files,frontend,$(LINT_FE_EXT)))
	@if [ -z "$(FILES)" ]; then echo "lint-fe: no changed files"; \
	else $(COMPOSE) -f $(COMPOSE_FILE) exec frontend $(ESLINT_CHANGED) $(FILES); fi
	$(COMPOSE) -f $(COMPOSE_FILE) exec frontend npm run lint:i18n

lint: lint-be lint-fe ## Lint changed backend + frontend files

lint-fix-be: ## ESLint backend --fix — changed files only (container)
	$(eval FILES := $(call changed_files,backend,$(LINT_BE_EXT)))
	@if [ -z "$(FILES)" ]; then echo "lint-fix-be: no changed files"; \
	else $(COMPOSE) -f $(COMPOSE_FILE) exec backend $(ESLINT_CHANGED) --fix $(FILES); fi

lint-fix-fe: ## ESLint frontend --fix — changed files only + i18n check (container)
	$(eval FILES := $(call changed_files,frontend,$(LINT_FE_EXT)))
	@if [ -z "$(FILES)" ]; then echo "lint-fix-fe: no changed files"; \
	else $(COMPOSE) -f $(COMPOSE_FILE) exec frontend $(ESLINT_CHANGED) --fix $(FILES); fi
	$(COMPOSE) -f $(COMPOSE_FILE) exec frontend npm run lint:i18n

lint-fix: lint-fix-be lint-fix-fe ## Lint changed files with --fix

lint-all-be: ## ESLint whole backend (container)
	$(COMPOSE) -f $(COMPOSE_FILE) exec backend npx eslint "{src,apps,libs,test}/**/*.ts" --max-warnings=0 --cache --cache-location $(CACHE_DIR)/eslint/

lint-all-fe: ## ESLint whole frontend (container)
	$(COMPOSE) -f $(COMPOSE_FILE) exec frontend sh -c 'npx eslint . --max-warnings=0 --cache --cache-location $(CACHE_DIR)/eslint/ && npm run lint:i18n'

lint-all: lint-all-be lint-all-fe ## Lint entire backend + frontend

lint-fix-all-be: ## ESLint whole backend --fix (container)
	$(COMPOSE) -f $(COMPOSE_FILE) exec backend npx eslint "{src,apps,libs,test}/**/*.ts" --fix --max-warnings=0 --cache --cache-location $(CACHE_DIR)/eslint/

lint-fix-all-fe: ## ESLint whole frontend --fix (container)
	$(COMPOSE) -f $(COMPOSE_FILE) exec frontend sh -c 'npx eslint . --fix --max-warnings=0 --cache --cache-location $(CACHE_DIR)/eslint/ && npm run lint:i18n'

lint-fix-all: lint-fix-all-be lint-fix-all-fe ## Lint entire backend + frontend with --fix

# Uncommitted files (staged, unstaged, untracked; deleted excluded) under $(1) matching
# the regex $(2), with the $(1)/ prefix stripped so the paths resolve inside the container.
changed_files = $(shell { git diff --name-only --diff-filter=d HEAD -- $(1); \
	git ls-files --others --exclude-standard -- $(1); } | grep -E '$(2)' | sort -u | sed 's|^$(1)/||')

PRETTIER := npx prettier --write --cache --cache-location $(CACHE_DIR)/prettier/.prettier-cache

format-be: ## Prettier backend — changed files only (container)
	$(eval FILES := $(call changed_files,backend,\.ts$$))
	@if [ -z "$(FILES)" ]; then echo "format-be: no changed files"; \
	else $(COMPOSE) -f $(COMPOSE_FILE) exec backend $(PRETTIER) $(FILES); fi

format-fe: ## Prettier frontend — changed files only (container)
	$(eval FILES := $(call changed_files,frontend,\.tsx?$$))
	@if [ -z "$(FILES)" ]; then echo "format-fe: no changed files"; \
	else $(COMPOSE) -f $(COMPOSE_FILE) exec frontend $(PRETTIER) $(FILES); fi

format: format-be format-fe ## Format changed backend + frontend files

format-all-be: ## Prettier whole backend (container)
	$(COMPOSE) -f $(COMPOSE_FILE) exec backend $(PRETTIER) "src/**/*.ts" "test/**/*.ts"

format-all-fe: ## Prettier whole frontend (container)
	$(COMPOSE) -f $(COMPOSE_FILE) exec frontend $(PRETTIER) "src/**/*.{ts,tsx}"

format-all: format-all-be format-all-fe ## Format entire backend + frontend

typecheck-be: ## Typecheck backend (container)
	$(COMPOSE) -f $(COMPOSE_FILE) exec backend npx tsc --noEmit -p tsconfig.build.json --incremental --tsBuildInfoFile $(CACHE_DIR)/tsc/build.tsbuildinfo

typecheck-fe: ## Typecheck frontend (container)
	$(COMPOSE) -f $(COMPOSE_FILE) exec frontend sh -c 'rm -rf .next/types .next/dev/types && npm run typecheck'

typecheck: typecheck-be typecheck-fe ## Typecheck backend + frontend

test-be: ## Run backend tests related to changed files (container)
	$(eval FILES := $(call changed_files,backend,\.ts$$))
	@if [ -z "$(FILES)" ]; then echo "test-be: no changed files"; \
	else $(COMPOSE) -f $(COMPOSE_FILE) exec backend npx jest --findRelatedTests --passWithNoTests $(FILES); fi

test-fe: ## Run the changed frontend test files (container); the whole suite is test-fe-all
	$(eval FILES := $(call changed_files,frontend,\.test\.tsx?$$))
	@if [ -z "$(FILES)" ]; then echo "test-fe: no changed test files"; \
	else $(COMPOSE) -f $(COMPOSE_FILE) exec frontend npx vitest run --passWithNoTests $(FILES); fi

test: test-be test-fe ## Run tests related to changed files

test-all-be: ## Run all backend tests (container)
	$(COMPOSE) -f $(COMPOSE_FILE) exec backend npm test

test-all-fe: ## Run all frontend tests (container)
	$(COMPOSE) -f $(COMPOSE_FILE) exec frontend npm test

test-all: test-all-be test-all-fe ## Run all tests

test-be-all: test-all-be ## Run all backend tests (alias of test-all-be)

test-fe-all: test-all-fe ## Run all frontend tests (alias of test-all-fe)

build-be: ## Build backend (container)
	$(COMPOSE) -f $(COMPOSE_FILE) exec backend npm run build

build-fe: ## Build frontend (container)
	$(COMPOSE) -f $(COMPOSE_FILE) exec frontend npm run build

gen-module: ## Scaffold BE module: make gen-module ARGS="--plugin sales --module invoice"
	@if [ -z "$(ARGS)" ]; then echo "Usage: make gen-module ARGS=\"--plugin sales --module invoice\""; exit 1; fi
	$(COMPOSE) -f $(COMPOSE_FILE) exec backend npm run generate:module -- $(ARGS)

gen-feature: ## Scaffold FE feature: make gen-feature ARGS="--plugin sales --feature invoice"
	@if [ -z "$(ARGS)" ]; then echo "Usage: make gen-feature ARGS=\"--plugin sales --feature invoice\""; exit 1; fi
	$(COMPOSE) -f $(COMPOSE_FILE) exec frontend npm run generate:feature -- $(ARGS)

gen-api-docs: ## Generate OpenAPI spec from backend code
	$(COMPOSE) -f $(COMPOSE_FILE) exec backend npm run generate:api-docs

validate-api-docs: ## Validate OpenAPI spec with Redocly
	$(COMPOSE) -f $(COMPOSE_FILE) exec backend npm run validate:api-docs

validate-migrations: ## Validate TypeORM migration filenames
	$(COMPOSE) -f $(COMPOSE_FILE) exec $(TS_FAST) backend npm run validate:migrations

validate-migrations-strict: ## Validate migration filenames (reject legacy padded timestamps)
	$(COMPOSE) -f $(COMPOSE_FILE) exec $(TS_FAST) backend npm run validate:migrations:strict

gen-api-client: gen-api-docs ## Generate FE TypeScript types from OpenAPI spec
	@mkdir -p /tmp/opencode
	docker compose cp backend:/app/docs/api/openapi.json /tmp/opencode/openapi.json
	docker compose cp /tmp/opencode/openapi.json frontend:/app/openapi.json
	$(COMPOSE) -f $(COMPOSE_FILE) exec frontend npx openapi-typescript openapi.json -o src/kernel/core/api/generated/api.ts
	$(COMPOSE) -f $(COMPOSE_FILE) exec frontend rm -f /app/openapi.json

shell-be: ## Open shell in backend container
	$(COMPOSE) -f $(COMPOSE_FILE) exec backend sh

shell-fe: ## Open shell in frontend container
	$(COMPOSE) -f $(COMPOSE_FILE) exec frontend sh
