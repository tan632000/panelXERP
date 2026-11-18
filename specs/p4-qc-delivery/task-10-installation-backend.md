# Task 10 — Installation at the project site

Status: pending

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
