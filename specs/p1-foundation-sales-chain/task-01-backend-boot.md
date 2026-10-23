# Task 01 — Backend boots from the REF kernel with hardened secrets

Status: done

## Outcome
`docker compose up` starts Postgres, Redis, LocalStack and a NestJS backend with no business plugin; migrations + seed run on an empty DB; health and admin login work; production refuses weak secrets.

## Scope
- In (copy allowlist from REF): `backend/` except `src/plugins/`, `src/webhooks/mes/`, `frag.ts`, `node_modules`, `dist`, `docs/api/openapi*.json`; `docker/`; `compose.yml`; `compose.production.yml`; `.env.example`; `.env.production.example`; `.dockerignore`; `.gitattributes`; root `package.json` + `.husky/`; `scripts/sync-env.sh`; `tools/`; `docs/permission/` (compose mount); `docs/feature-standard/`; `docs/scaffold/`; `Makefile` (kept for Linux/macOS users; not used for verification).
- Out: `frontend/` (task-02); every REF business plugin; REF `.specs/`, `plans/`, `.github/`, `docs/original-specs/`.

## Coverage
- CP-01

## Ownership
- Create: `backend/`, `docker/`, `compose.yml`, `compose.production.yml`, `.env.example`, `.env.production.example`, `.gitattributes`, `package.json`, `.husky/`, `scripts/sync-env.sh`, `tools/`, `docs/permission/`, `docs/feature-standard/`, `docs/scaffold/`, `Makefile`
- Modify: `backend/src/app.module.ts` (drop REF line 30 import + its registration at line 64), `backend/src/webhooks/webhooks.module.ts` (drop MES), `backend/src/kernel/platform/plugins/enabled-plugins.ts`, `backend/src/kernel/platform/features/enabled-features.ts`, `backend/src/kernel/core/database/seeds/{seed-roles.ts,seed-users.ts,seed-runner.ts}`, `backend/src/kernel/core/config/app.config.ts`, `backend/src/kernel/core/users/constants/department-staff-role.constant.ts`, `backend/src/kernel/core/audit/notification.service.ts`, `backend/src/kernel/core/users/list-preference.constant.ts`, `backend/test/jest-e2e.json`, `.gitignore`
- Delete: kernel migrations touching plugin tables (at least `1792472199496-sync-master-name-snapshots.ts`, `1792491345042-packaging-lines-store-tp-codes.ts`; find the rest by grepping plugin table names), `backend/scripts/generate-module.*`
- Read: `REF/Makefile:40-150` (env, migrate, seed recipes)

## Steps
1. Copy the allowlist → `grep -rnE "@/?plugins/" backend/src backend/scripts backend/test` hits only the two catalog files.
2. Empty `PLUGIN_CATALOG` and `FEATURE_CATALOG`; create `backend/src/plugins/.gitkeep`.
3. Kernel migrations: delete every file that references a REF plugin table (grep table names of REF plugin entities in `backend/src/kernel/core/database/migrations`) → migrate on empty DB succeeds.
4. Strip Hải Phương domain from kernel: department-staff constants (+ their use in `notification.service.ts`), REF keys in `list-preference.constant.ts`; rewrite kernel specs that cover kernel behavior with kernel-local fixtures, delete specs that only test REF plugins/roles (`seed-roles.function-list.spec.ts`, `seed-roles.packaging-dispatch.spec.ts`, `seed-roles.department-staff.spec.ts`, plugin parts of `files.controller.spec.ts`, `is-date-only.validator.spec.ts`, `upgrade-role-permissions.spec.ts`, `roles.service.spec.ts`, `permission-catalog.coverage.spec.ts`). `seed-users.spec.ts` is **rewritten** (Step 5 cases), not deleted.
5. Seeds: `seed-roles.ts` → one `admin` role with all kernel permissions; `seed-users.ts` → admin uses role `admin`; admin password always comes from env `SEED_ADMIN_PASSWORD` (`backend/.env.example` holds a dev-only value; production fails if absent or equal to the example value); demo users only when `NODE_ENV !== 'production'`; remove password logging.
6. `app.config.ts` `resolveSecret`: in production reject `CHANGE_ME*` or length < 32. Add `app.config.spec.ts`.
7. `jest-e2e.json` moduleNameMapper: add `@kernel`, `@shared`, `@plugins`, `@webhooks` like `backend/package.json` jest config.
8. Rename identifiers `erp-haiphuong-*` → `panelxerp`; `.gitignore` += `.env`, `backend/.env`, `frontend/.env`, `node_modules`, `dist`, `.next`.
9. `bash scripts/sync-env.sh` (creates `backend/.env`, `frontend/.env` from examples); `docker compose up --build -d postgres redis localstack backend`.

## Acceptance
- AC-01: health 200; login returns an access token (value never printed).
- AC-02: `app.config.spec.ts` proves weak-secret rejection for every secret resolved by `resolveSecret`; `seed-users.spec.ts` proves: production without `SEED_ADMIN_PASSWORD` (or with the example value) throws, no demo users in production, no password in logs. Other `CHANGE_ME` values in `.env.production.example` (DB, AWS) are an operator checklist item in P1, not code-enforced.

## Dependencies
- none

## Verification Plan
- Command: `docker compose exec -T backend sh -c 'npm run lint && npm run typecheck && npx jest --ci && npm run validate:migrations && npm run migration:run && npm run seed && npm run test:e2e -- --ci && curl -fsS http://localhost:8080/api/v1/health && curl -fsS -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8080/api/v1/auth/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"$SEED_ADMIN_PASSWORD\"}"'`
- Quoting: outer single quotes, so the host shell does not expand; `$SEED_ADMIN_PASSWORD` expands inside the container from `backend/.env` via compose `env_file`; never echoed, never hard-coded.
- Named probe: `src/kernel/core/config/app.config.spec.ts`, `src/kernel/core/database/seeds/seed-users.spec.ts` (rewritten), `test/app.e2e-spec.ts`, health + login endpoints.
- Reachability: host Docker/Compose known; backend port 8080 inside container (`REF/compose.yml:68`); `curl` present in `docker/backend/Dockerfile.dev`; login DTO field names confirmed from `auth.controller.ts` at implementation (adjust JSON keys, not the oracle).
- Oracle: all sub-commands exit 0; jest ≥ 1 passed; health JSON printed; login prints `200` or `201`.
- Counterexample: a leftover plugin import makes jest/typecheck fail; a kernel migration touching `products` makes `migration:run` fail; admin seeded with role `director` makes login 401.
- Artifacts: ephemeral containers/volumes; `docker compose down` when not reused by task-02.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c 'npm run lint && npm run typecheck && npx jest --ci && npm run validate:migrations && npm run migration:run && npm run seed && npm run test:e2e -- --ci && curl -fsS http://localhost:8080/api/v1/health && curl -fsS -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8080/api/v1/auth/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"$SEED_ADMIN_PASSWORD\"}"'
Exit: 0
Base: ecd2c4078a4c95a401dc99201c788d696b35e177
Head: d729f0e96603faa24cd53f0826b39c5ac64adc3210d6049a0e99cdf3f4f79e80
```text
$ docker compose exec -T backend sh -c '... (Command above, run on a freshly reset DB volume)'
> panelxerp-backend@0.0.1 lint
> eslint "{src,apps,libs,test}/**/*.ts" --max-warnings=0
> panelxerp-backend@0.0.1 typecheck
> tsc --noEmit -p tsconfig.build.json
PASS src/kernel/core/database/validate-migration-filenames.util.spec.ts
Test Suites: 55 passed, 55 total
Tests:       536 passed, 536 total
> panelxerp-backend@0.0.1 validate:migrations
Migration InitCore1784005029001 has been executed successfully.
Migration AddAccentInsensitiveSearch1792482277453 has been executed successfully.
[seed:users] 1 users created, 0 already existed and were left untouched (domain: example.com)
[seed-runner] All seeds completed.
    ✓ /api/v1/health (GET) (1014 ms)
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
{"status":"ok","timestamp":"2026-10-22T16:58:54.391Z"}201
Exit: 0
```
Negative/extra proof (same Head): wrong-password login → 401; proof log scanned inside the container for `$SEED_ADMIN_PASSWORD` → "password not in log"; `grep -rnE "@/?plugins/" backend/src backend/scripts backend/test` → only the `@plugins` alias in `backend/test/jest-e2e.json` and the `not.toContain('@plugins/')` assertion. Review (code-auditor): PASS, 0 Critical/High/Medium; Low findings #4/#5 fixed before this run, #1/#2 carried into task-03 Steps.
