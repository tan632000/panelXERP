# Task 11 — Acceptance minutes and the order becoming `completed`

Status: pending

## Outcome
The order's sales owner (or salesManager/director) uploads the signed acceptance minutes once the order is `delivered` and any installation is `done`, which moves the order `delivered → completed` in the same transaction and tells the followers; storekeeper reads the minutes.

## Scope
- In (feature `acceptance`, D-11): tables `acceptances` (order_id unique, representative_name ≤ 255, signed_date, created_by/at) and `acceptance_files`; permissions `acceptance:read|create`. Endpoints: `POST /delivery/orders/:orderId/acceptance` multipart `files[]` (1–10, ≤ 20 MB each, (user, Q4)), `representativeName`, `signedDate` (`create`): (R-02) visibility check (404) before storing any object → store → transaction: order lock → scope (404) → order `delivered` else 409 → installation of the order, if any, `done` else 409 → no acceptance yet else 409 → (R-12) `signedDate` ≤ `vnToday()` and ≥ the latest `received_date` of the order's notes, else 400 → rows → `moveStatus(delivered → completed)`; failure deletes every stored object; after commit the D-13 `completed` notice. `GET /delivery/orders/:orderId/acceptance` (`read`; 200 with `null` when none exists on a visible order); (R-03) `GET /delivery/acceptance-files/:fileId/content` with `acceptance:read`, D-03 condition in SQL, stored type, `nosniff`, `Content-Disposition: attachment`. No cancel ((user, Q5)). `seed-roles.panel.spec.ts`: remove `acceptance` from `PENDING_MODULES`, leaving it empty.
- Out: screens (task-12).

## Coverage
- CP-11

## Ownership
- Create: `backend/src/plugins/delivery/acceptance/**` (migration, entities, dto, permissions, `services/acceptance.service.ts` + `acceptance.service.spec.ts`, `services/acceptance-race.spec.ts`, controller + `acceptance.controller.spec.ts`, `acceptance.module.ts`)
- Modify: `delivery.features.ts`, `delivery.module.ts`, `seed-roles.panel.spec.ts` (PENDING), `frontend/src/kernel/langs/{vi,en}/permission.json`, `backend/docs/api/openapi.json`, `frontend/src/kernel/core/api/generated/api.ts`
- Read: `backend/src/plugins/sales/_shared/ports/order-production.port.ts:72-91`, `delivery/_shared/utils/delivery-file.util.ts`, `delivery-scope.util.ts`, `delivery/installation/entities/` (task-10)

## Steps
1. Acceptance → `acceptance.service.spec.ts` (real Postgres): order `in_production` → 409; `delivered` with installation `in_progress` → 409; `delivered` without installation → 201 and order `completed`; second acceptance → 409; `signedDate` after Vietnam today → 400; (R-12) `signedDate` one day before the latest `received_date` → 400, equal → 201; sales_a on own order → 201, salesManager on any order → 201 ((user, Q7)), storekeeper `POST` → 403, storekeeper `GET` → 200; (R-02) sales_b on sales_a's `in_production` order → 404 (not 409) and the storage fake's `upload` not called; followers read one `completed` notice; a storage failure after the first of two files → both objects deleted, no row, order still `delivered`.
2. Controller → `acceptance.controller.spec.ts`: renamed type → 400; 20 MB + 1 → 413; 11 files → 400; (R-03) content of another owner's file → 404 for sales_b, technician → 403, headers `nosniff` and `Content-Disposition: attachment`; key `^delivery/acceptance/<orderId>/[0-9a-f-]{36}\.(pdf|png|jpg)$`; no key in responses.
3. Races → `acceptance-race.spec.ts`: acceptance and installation create queued (`queuedBehind`) behind a holder of the `sales_orders` row → never an order `completed` while an installation not `done` exists (create first → acceptance 409; acceptance first → create 409); two acceptances queued → one 201, one 409, `moveStatus` once.
4. Labels, OpenAPI, `api.ts`.

## Acceptance
- AC-10; AC-11 (acceptance reads, writes, content); AC-12 (acceptance files).

## Dependencies
- task-10-installation-backend.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/delivery/acceptance/services/acceptance.service.spec.ts && test -f src/plugins/delivery/acceptance/services/acceptance-race.spec.ts && test -f src/plugins/delivery/acceptance/acceptance.controller.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/delivery src/plugins/sales/_shared src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts`
- Named probe: `acceptance.service.spec.ts` (gates, R-12, Q7, scope-first, cleanup, notice), `acceptance-race.spec.ts` (acceptance ∥ installation create, acceptance ∥ acceptance), `acceptance.controller.spec.ts` (413, headers, 403/404), `seed-roles.panel.spec.ts` (`PENDING_MODULES` empty)
- Reachability: known.
- Oracle: exit 0, 0 skipped.
- Counterexample: checking order status before scope must fail the sales_b 404 case; checking "installation done" before the order lock must fail acceptance ∥ installation create; writing the acceptance row without `moveStatus` in the same transaction must fail "order `completed`".
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
