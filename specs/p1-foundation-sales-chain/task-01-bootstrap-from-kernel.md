# Task 01 — Repo boots from the REF kernel with no business plugin

Status: pending

## Outcome
panelXERP has a running NestJS + Next.js + Postgres + Redis stack copied from REF, with an empty plugin catalog, seeded admin login, and all quality gates green.

## Scope
- In: copy from REF `backend/` (kernel, `eslint-plugin-erp/`, `scripts/`, `test/`, configs, package files), `frontend/` (kernel, app shell, `eslint-plugin-erp/`, configs), `docker/`, `compose.yml`, `compose.production.yml`, `.env.example`, `.env.production.example`, `.dockerignore`, `.gitattributes`, `Makefile`, `tools/`, `docs/feature-standard/`, `docs/scaffold/`; `git init`.
- Out: every `REF/backend/src/plugins/*` and `REF/frontend/src/plugins/*`; REF `.specs/`, `plans/`, `docs/original-specs/`, the nested `REF/vn0047-haiphuong-erp-develop/` copy; `.github/` CI (later); any `.env` with real values.

## Coverage
- CP-01

## Ownership
- Create: `backend/`, `frontend/`, `docker/`, `compose.yml`, `compose.production.yml`, `.env.example`, `Makefile`, `tools/`, `docs/feature-standard/`, `docs/scaffold/`
- Modify: `backend/src/kernel/platform/plugins/enabled-plugins.ts`, `backend/src/kernel/platform/features/enabled-features.ts`, `backend/src/kernel/core/database/seeds/seed-roles.ts`, `frontend/src/kernel/platform/plugins/enabled-plugins.ts`, `frontend/src/kernel/platform/features/enabled-feature-keys.ts`, `.gitignore`
- Read: `REF/README.md`, `REF/docs/scaffold/new-plugin/README.md`

## Steps
1. Copy the In-scope paths (exclude `node_modules`, `.next`, `dist`, caches) → `backend/src/plugins/` and `frontend/src/plugins/` do not exist yet.
2. Empty `PLUGIN_CATALOG` (`enabled-plugins.ts:28`) and `FEATURE_CATALOG` (`enabled-features.ts:29`) on both sides; create empty `backend/src/plugins/.gitkeep` and `frontend/src/plugins/.gitkeep`.
3. Remove or rewrite every kernel file importing `@plugins/`: backend `seed-roles.function-list.spec.ts`, `seed-roles.packaging-dispatch.spec.ts`, `files.controller.spec.ts`, `is-date-only.validator.spec.ts`; frontend `classification-options.test.tsx`, `file-allowlist-dots.test.ts`, `i18n-enum-conformance.test.ts`, `use-delete-failure-reason.test.tsx`, `use-toast-mutation-feedback.test.tsx`, `delete-confirmation.test.ts`, `status-messages.test.ts`. Rewrite a test to use a kernel-local fixture when it covers kernel behavior; delete it only when it tests a REF plugin. Then `grep -rn "@plugins/" backend/src/kernel frontend/src/kernel` → 0 hits except the two catalog files.
4. Reduce `seed-roles.ts` to a single `admin` role holding all kernel permissions; Hải Phương roles removed.
5. Rename project identifiers (`erp-haiphuong-*` package names, compose project name, DB name) to `panelxerp`; remove Hải Phương branding strings in i18n `vi`/`en`.
6. `git init`; extend `.gitignore` with `.env`, `node_modules`, `.next`, `dist`. First commit only when the user authorizes it.
7. `docker compose up --build -d`, run migrations + seed → backend health OK.

## Acceptance
- AC-01: `GET /api/v1/health` (exact path as in REF `kernel/core/health`) returns 200; `POST` login with the seeded admin returns a token.
- AC-02: backend + frontend lint, typecheck, full test suites and `validate:migrations` exit 0 with > 0 tests executed.

## Dependencies
- none

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci && npm run validate:migrations" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npm test -- --run" && curl -fsS http://localhost:${BACKEND_PORT:-3001}/api/v1/health`
- Named probe: `backend/src/kernel/core/roles/roles.service.spec.ts`, `backend/src/kernel/core/database/validate-migration-filenames.util.spec.ts`, health endpoint.
- Reachability: host has Docker 27.5 + Compose v2.32, Node 20.17; no `make` → commands use `docker compose exec`. Backend port taken from copied `.env.example`.
- Oracle: every sub-command exits 0; jest/vitest report ≥ 1 passed test; curl prints health JSON.
- Counterexample: a leftover `@plugins/` import makes `typecheck` fail; an empty test suite makes `jest --ci` exit 1.
- Artifacts: ephemeral; `docker compose down` after verification if not reused.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
