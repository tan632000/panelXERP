# Task 10 — Installation at the project site

Status: done

## Outcome
A storekeeper records at most one installation per order (address prefilled from the project, planned date, person in charge, notes, photos) and moves it `planned → in_progress → done` while the order is in production or delivered; sales and managers read it within their scope.

## Scope
- In (feature `installation`, D-10): tables `installations` (order_id unique among non-deleted, site_address ≤ 500, planned_date, person_in_charge ≤ 255 free text ((user, Q5)), note ≤ 2000, status `planned|in_progress|done`, started_at/by, done_at/by) and `installation_photos`; permissions `installation:read|manage`. Endpoints: `POST /delivery/orders/:orderId/installation` `{siteAddress?, plannedDate?, personInCharge?, note?}` (`manage`; order lock → scope (404) → order `in_production|delivered` else 409 → existing one → 409; `siteAddress` defaults to `OrderProductionPort.siteAddress`); `PATCH /delivery/installations/:id` (fields, while not `done`); `POST /delivery/installations/:id/start` (`planned → in_progress`), `POST /delivery/installations/:id/finish` (`in_progress → done`), other moves 409; (R-09) start, finish and `PATCH` take the order lock, check scope, then re-check the order is `in_production|delivered` (409); `GET /delivery/installations?status=&orderId=&page=&limit=`, `GET /delivery/installations/:id`; photos `POST /delivery/installations/:id/photos` ((user, Q4) ≤ 30 per installation, ≤ 10 MB; (R-02) visibility check before storing; count under order lock → installation `FOR UPDATE`), (R-03) `GET /delivery/installation-photos/:photoId/content` with `installation:read`, D-03 condition in SQL, stored type, `nosniff`, inline. No cancel ((user, Q5)). `seed-roles.panel.spec.ts`: remove `installation` from `PENDING_MODULES`.
- Out: acceptance (task-11); screens (task-12).

## Coverage
- CP-10

## Ownership
- Create: `backend/src/plugins/delivery/installation/**` (migration, entities, dto, permissions, `services/installation.service.ts` + `installation.service.spec.ts`, `services/installation-photo.service.ts` + `installation-photo.service.spec.ts`, controllers + `installation.controller.spec.ts`, `installation.module.ts`)
- Modify: `delivery.features.ts`, `delivery.module.ts`, `seed-roles.panel.spec.ts` (PENDING), `frontend/src/kernel/langs/{vi,en}/permission.json`, `backend/docs/api/openapi.json`, `frontend/src/kernel/core/api/generated/api.ts`
- Read: `backend/src/plugins/sales/_shared/ports/order-production.port.ts`, `delivery/_shared/utils/delivery-file.util.ts`, `delivery-scope.util.ts`

## Steps
1. Installation → `installation.service.spec.ts` (real Postgres): created for an `in_production` order with the project's site address prefilled, then the customer address when the order has no project; second create → 409; `open`/`completed` order → 409; `finish` from `planned` → 409; `PATCH` after `done` → 409; (R-09) on an order moved to `cancelled` (test fixture) start, finish and `PATCH` → 409; sales_a (own order) reads, `POST` → 403; sales_b → 404; `expectNoMoneyKeys`.
2. Photos → `installation-photo.service.spec.ts`: 31st → 400, also with two uploads at 29 queued (`queuedBehind`) behind the `sales_orders` row; storage failure → object deleted, no row; (R-02) storekeeper uploading to an installation id that does not exist → 404 with the storage fake's `upload` not called (no `ownSales` role holds `installation:manage`); `installation.controller.spec.ts`: 10 MB + 1 → 413, content of another owner → 404 for sales_b, technician → 403, `nosniff`, no key in responses.
3. Labels, OpenAPI, `api.ts`.

## Acceptance
- AC-09; AC-11 (installation reads, writes, content); AC-12 (installation photos).

## Dependencies
- task-09-delivery-note-screens.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/delivery/installation/services/installation.service.spec.ts && test -f src/plugins/delivery/installation/services/installation-photo.service.spec.ts && test -f src/plugins/delivery/installation/installation.controller.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/delivery src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts`
- Named probe: `installation.service.spec.ts` (prefill, single, transitions, R-09, scope, money keys), `installation-photo.service.spec.ts` (count race, cleanup), `installation.controller.spec.ts` (413, headers, 403/404)
- Reachability: known.
- Oracle: exit 0, 0 skipped.
- Counterexample: checking the order status only at create must fail the R-09 cancelled-order case.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/plugins/delivery/installation/services/installation.service.spec.ts && test -f src/plugins/delivery/installation/services/installation-photo.service.spec.ts && test -f src/plugins/delivery/installation/installation.controller.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/delivery src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
Exit: 0
Base: 5afcb85629b59dd620dc8e0e3e6287158c335ac4
Head: a9be09a6b4f609a4163859ae93378a6513eb7984d6fb735181afab013e42d65f
```text
$ docker compose exec -T backend sh -c "test -f ...installation.service.spec.ts && ... && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/delivery src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations"
PASS src/plugins/delivery/installation/services/installation-photo.service.spec.ts (20.519 s)
PASS src/plugins/delivery/installation/services/installation.service.spec.ts (21.345 s)
PASS src/plugins/delivery/installation/installation.controller.spec.ts (31.573 s)
Test Suites: 23 passed, 23 total
Tests:       219 passed, 219 total
Migration filename check passed (53 files).
$ docker compose run --rm --no-deps -v .../backend:/backend:ro frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
 ✓ src/kernel/langs/tests/permission-labels.test.ts (6 tests)
 Test Files  1 passed (1)
FINAL_EXIT=0
```
Skipped: none reported in the log. Counterexample (run once against a temporary mutation of `installation-access.service.ts`, reverted afterwards; SHA-256 `29ab42d8e6570c9a…` identical before and after): removing the order-status re-check from `lockForWrite`, so the status is checked only at create, failed 4 of 35 installation tests: "refuses start / finish / patch on an installation whose order was cancelled meanwhile" and "refuses a photo for an installation whose order was cancelled, leaving no object".
Review: code-auditor PASS (0 critical/high/medium). Low, left as is: `plannedDate: ''` is a 400 and only `null` clears the planned date (the task does not require clearing it); photo file validation (400/413) runs before the 404 visibility check, as in the delivery-note photo service; an empty PATCH still bumps `updated_at`; the empty `siteAddress` fallback to the prefill has no explicit test. One Low was fixed before the final run: the implementer's edit had removed the space after the colon of `iqc_commercial_goods:approve` in `frontend/src/kernel/langs/vi/permission.json`; restored, so that file now differs only by the two new installation keys.
Deviations: implementation delegated to the implementer agent and verified independently by the controller (pre-change run by the controller: the `test -f` check failed, exit 1, because the spec files did not exist). Photo uploads also take the order-status check (409 after the object is stored, then deleted; R-02 visibility still runs first), because AC-09 says "refuse any write while the order is not `in_production|delivered`" while the task text names only start, finish and PATCH; a photo on a `done` installation is allowed when the order is writable (the task does not forbid it). `soft-delete-unique-index.spec.ts` needed no change (`uq_installations_order` is partial on `is_deleted = false`). `delivery.module.ts` needed no change (it spreads the feature list). Not verified: the full Nest app was not booted; runtime DI of `InstallationModule` is covered through the spec harness and the migration run only.
Docs impact: none yet (API docs are task-14); openapi.json/.yaml and `api.ts` were regenerated.
