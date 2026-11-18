# Task 02 — Delivery plugin and the shared QC checklist template

Status: done

## Outcome
Plugin `delivery` is registered in backend and frontend; every migrated database (dev, staging, production) holds the 10 checklist items once; a productionManager adds, renames, hides/shows and reorders items from "QC & Giao hàng › Mẫu checklist"; qcInspector reads the template; every other role gets 403.

## Scope
- In (backend): `backend/src/plugins/delivery/` with `delivery.plugin.ts` (`name: 'delivery'`, `dependsOn: ['sales','production']`, as `production.plugin.ts:16-22`), `delivery.module.ts`, `delivery.features.ts` (first feature `qc-checklist`); registered after `productionPlugin` in `PLUGIN_CATALOG` (`kernel/platform/plugins/enabled-plugins.ts:23-29`). Feature `qc-checklist`: table `qc_checklist_items` (D-04: `name` varchar(200) not blank, unique `lower(name)` among non-deleted rows, `position` int, `active` bool default true, base audit columns); (R-04) a second **data migration** inserting the 10 D-04 items (positions 1–10) only when the table has no row — not a feature seed, which staging and production never run (`seed-scope.ts:1-9,33-34`); permissions `qc_checklist:read|manage`. Endpoints: `GET /delivery/qc/checklist-items?includeHidden=true|false` (`read`, ordered by `position`), `POST /delivery/qc/checklist-items` `{name}` (`manage`, appended last), `PATCH /delivery/qc/checklist-items/:id` `{name?, active?}` (`manage`), `PUT /delivery/qc/checklist-items/order` `{ids}` (`manage`; `ids` must be exactly the set of all item ids, else 400). Every template write takes the exclusive `pg_advisory_xact_lock(hashtext('qc_checklist'))` first; (R-11) QC rounds take no template lock. Duplicate name → 409. `seed-roles.panel.spec.ts`: remove `qc_checklist` from `PENDING_MODULES`.
- In (frontend): `frontend/src/plugins/delivery/` with `plugin.ts` (`key: 'delivery'`, `navigationModuleKey: 'delivery'`, as `frontend/src/plugins/production/plugin.ts:10-18`), `delivery.features.ts`, feature `qc-checklist` (screen: ordered list, add, rename inline, hide/show toggle, move up/down; read-only without `qc_checklist:manage`); route `frontend/src/app/[locale]/delivery/layout.tsx` + `delivery/qc/checklist/page.tsx`; registered in `FRONTEND_PLUGIN_CATALOG` (`frontend/src/kernel/platform/plugins/enabled-plugins.ts:22-28`), `FRONTEND_FEATURE_CATALOG` (`enabled-feature-keys.ts:22-29`), `SECTION_ORDER` gains `sidebarDelivery` after `sidebarProduction` (`navigation.registry.ts:62-68`); namespace `delivery` in `kernel/langs/{vi,en}/delivery.json` loaded by `load-messages.ts` (as `production`, `load-messages.ts:17,47,85,118`); vi/en permission labels for `qc_checklist`. vi: "QC & Giao hàng", "Mẫu checklist", "Thêm hạng mục", "Ẩn", "Hiện".
- Out: QC rounds (task-04), other sidebar items (tasks 06, 09, 12).

## Coverage
- CP-02

## Ownership
- Create: `backend/src/plugins/delivery/` (`delivery.plugin.ts`, `delivery.module.ts`, `delivery.features.ts`, `qc-checklist/**` incl. schema migration, data migration + `qc-checklist-data.migration.spec.ts`, entity, dto, permissions, service + `qc-checklist.service.spec.ts`, controller), `frontend/src/plugins/delivery/` (`plugin.ts`, `delivery.features.ts`, `qc-checklist/**` + `qc-checklist/tests/checklist-template.test.tsx`), `frontend/src/app/[locale]/delivery/layout.tsx`, `frontend/src/app/[locale]/delivery/qc/checklist/page.tsx`, `frontend/src/kernel/langs/{vi,en}/delivery.json`
- Modify: `backend/src/kernel/platform/plugins/enabled-plugins.ts`, `seed-roles.panel.spec.ts` (PENDING), `frontend/src/kernel/platform/plugins/enabled-plugins.ts`, `frontend/src/kernel/platform/features/enabled-feature-keys.ts`, `frontend/src/kernel/platform/plugins/navigation.registry.ts`, `frontend/src/kernel/langs/load-messages.ts`, `frontend/src/kernel/langs/{vi,en}/permission.json`, `backend/docs/api/openapi.json`, `frontend/src/kernel/core/api/generated/api.ts`
- Read: `backend/src/plugins/production/production.plugin.ts`, `production.features.ts`, `backend/src/plugins/production/production-order/database/event-data.migration.spec.ts` (migration spec pattern), `kernel/core/database/seeds/helpers/seed-scope.ts`

## Steps
1. Plugin, feature, migrations, entity → `qc-checklist-data.migration.spec.ts` (real Postgres): `up` on an empty table inserts 10 rows positions 1–10; `up` on a table holding one row inserts none; the items exist after `migration:run` with `SEED_SCOPE=core` semantics (no seed involved).
2. Service/controller → `qc-checklist.service.spec.ts`: add appends at max+1; rename to an existing name (any case) → 409; hide keeps the row with `active=false` and `includeHidden=false` omits it; reorder with a missing or foreign id → 400; reorder with the full set rewrites positions 1..n; two adds queued with `queuedBehind` behind a holder of `SELECT pg_advisory_xact_lock(hashtext('qc_checklist'))` get distinct consecutive positions; storekeeper `POST` → 403; qcInspector `GET` → 200, `PATCH` → 403.
3. Frontend plugin, route, screen, labels → `checklist-template.test.tsx`: manage controls render only with `qc_checklist:manage`; move-down sends the full id list; hidden items show the "Ẩn" badge.
4. Regenerate OpenAPI and `api.ts` (plan, Shared registration files).

## Acceptance
- AC-02 (template half); AC-13 (productionManager manages the template from the UI).

## Dependencies
- task-01-qc-role-permissions-scope.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/delivery/qc-checklist/database/qc-checklist-data.migration.spec.ts && test -f src/plugins/delivery/qc-checklist/services/qc-checklist.service.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/delivery src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/delivery/qc-checklist/tests/checklist-template.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/delivery src/kernel/core/tests/landing-path.test.ts" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts`
- Named probe: `qc-checklist-data.migration.spec.ts` (empty-table insert, idempotent), `qc-checklist.service.spec.ts` (rename 409, reorder 400, advisory-lock race, 403s), `checklist-template.test.tsx`, `permission-labels.test.ts` (`qc_checklist` labelled), `seed-roles.panel.spec.ts` (`qc_checklist` no longer pending)
- Reachability: known (P3 tasks 02/06 ran the same three-part form; `validatePluginDependencies` throws at import when `delivery` precedes `production`, `enabled-plugins.ts:43-64`).
- Oracle: exit 0, 0 skipped.
- Counterexample: items inserted by a feature seed instead of the migration must fail the migration spec; an insert that runs when the table already has rows must fail the idempotence case; an add without the advisory lock must fail the consecutive-position race.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Execution notes

- Pre-change run: exit 1 at the first `test -f` guard (probes absent).
- Implemented by an implementer subagent (TDD); the controller ran the exact Command as one chain (log below); independent code review: PASS, 0 Critical/High/Medium.
- Scope exceptions (registration files the plan missed, now listed under "Shared registration files" in plan.md): `backend/src/kernel/platform/features/enabled-features.ts` (`FEATURE_CATALOG` — without it `migration:run` reported "No migrations are pending" and the table did not exist); `frontend/src/kernel/platform/tests/app-navigation.test.ts` (exact section list gains `sidebarDelivery`). `openapi.yaml` regenerates beside `openapi.json`.
- Regenerated `openapi.json`/`api.ts` also catch up the estimate pricing endpoints of commit 879dfd3 (stale committed copies); `api.ts` formatted with prettier to match the committed style (raw generator output re-indented the whole file).
- Permission label: `qc_checklist:manage` gets a scope-specific label (no generic `manage` action label exists).
- Open Low review notes (not fixed): data-migration `down` deletes the default names regardless of who created them; "Đổi tên" button lacks `disabled={busy}`; `ReorderQcChecklistDto.ids` has no `ArrayMaxSize` (route needs `qc_checklist:manage`, body size limit applies).
- No live UI walkthrough yet (deferred to the feature-level walkthrough before GATE-DONE).

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/plugins/delivery/qc-checklist/database/qc-checklist-data.migration.spec.ts && test -f src/plugins/delivery/qc-checklist/services/qc-checklist.service.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/delivery src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/delivery/qc-checklist/tests/checklist-template.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/delivery src/kernel/core/tests/landing-path.test.ts" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
Exit: 0
Base: 879dfd382d83963c6668a8c5c9e6e9c5a03a8de0
Head: 81cd6c6c1c4bbc8a8efb60d7413cd5ca65c75dadc8a17f02f8f4fff7ce77d5e7
```text
$ docker compose exec -T backend sh -c "test -f src/plugins/delivery/qc-checklist/database/qc-checklist-data.migration.spec.ts && test -f src/plugins/delivery/qc-checklist/services/qc-checklist.service.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/delivery src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/delivery/qc-checklist/tests/checklist-template.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/delivery src/kernel/core/tests/landing-path.test.ts" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
PASS src/kernel/core/database/seeds/role-matrix-doc.spec.ts (18.36 s)
PASS src/kernel/core/database/seeds/seed-roles.panel.spec.ts (18.403 s)
PASS src/kernel/core/database/seeds/helpers/seed-scope.spec.ts
PASS src/kernel/core/database/seeds/seed-users.spec.ts
PASS src/plugins/delivery/qc-checklist/database/qc-checklist-data.migration.spec.ts
PASS src/kernel/core/database/seeds/permission-scope-conversion.spec.ts
PASS src/kernel/core/database/soft-delete-unique-index.spec.ts (20.238 s)
PASS src/kernel/core/database/seeds/seed-roles.inventory.spec.ts (27.111 s)
PASS src/plugins/delivery/qc-checklist/services/qc-checklist.service.spec.ts (28.714 s)
Test Suites: 9 passed, 9 total
Tests:       94 passed, 94 total
Migration filename check passed (49 files).
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests)
 Test Files  1 passed (1)
      Tests  7 passed (7)
 ✓ src/kernel/core/tests/landing-path.test.ts (6 tests)
 ✓ src/plugins/delivery/qc-checklist/tests/checklist-template.test.tsx (9 tests)
 Test Files  2 passed (2)
      Tests  15 passed (15)
 ✓ src/kernel/langs/tests/permission-labels.test.ts (6 tests)
 Test Files  1 passed (1)
      Tests  6 passed (6)
EXIT=0
```
