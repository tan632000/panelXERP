# Task 09 — Order material view without sales money

Status: pending

## Outcome
Purchasing, storekeepers, managers and engineering leads see every order's material demand per panel and item (sales see only their own orders), with no sales price, total, discount, VAT or margin anywhere in the response.

## Scope
- In: port `backend/src/plugins/sales/_shared/ports/order-material-read.port.ts` (registered in `sales-shared.module.ts`): on a given manager returns order headers (id, code, status, delivery date, created at, customer name, project name, request id, sales owner id + name) and lines (id, tag, description, quantity) with BOM lines (item id, code, name, unit, per-panel quantity). The port types contain no money field. List: filters status, text, sales owner id, plus a mandatory scope condition from `materialListCondition` (task-01) applied in SQL on the request's `sales_owner_id`; a `salesOwnerId` filter is AND-ed and never widens it.
- Feature `inventory/material` (`material:read`, permission module declared here): `GET /inventory/materials/orders` (paged list with short-line count) and `GET /inventory/materials/orders/:orderId` (visibility via `canSeeMaterial`, out of scope → 404). Per order × item (D-05, D-17): demand (Σ per-panel qty × panel qty over linked lines), reserved (from `stock_reservations`, 0 until task-10), issued and returned (from `stock_movements` by `order_id`), short; per panel: its BOM with demand; unlinked lines (D-02) listed separately with a warning and excluded from demand.
- D-19 + whitelist: no `unitPrice`, `amount`, `subtotal`, `discount*`, `vat*`, `total`, `margin*`, `avgCost`, `value` anywhere in the JSON tree, for every role.
- Frontend `/inventory/materials` (orders with delivery date and short-line count) and the order material page; sales `OrderDetailPage.tsx` gets a "Vật tư" link for holders of `material:read`.
- Out: reservation writes (10), issue (12), estimate-vs-actual (16).

## Coverage
- CP-09

## Ownership
- Create: `backend/src/plugins/sales/_shared/ports/order-material-read.port.ts` (+ spec), `backend/src/plugins/inventory/material/` (module, permissions, `material.service.ts`, `material.controller.ts`, specs), `frontend/src/plugins/inventory/material/`, `frontend/src/app/[locale]/inventory/materials/`
- Modify: `backend/src/plugins/sales/_shared/sales-shared.module.ts`, `frontend/src/plugins/sales/order/components/OrderDetailPage.tsx`, `inventory.features.ts`, shared registration files
- Read: `backend/src/kernel/shared/services/data-scope.service.ts`, `backend/src/kernel/shared/testing/money-keys.helper-spec.ts`

## Steps
1. Port + spec (scope condition always applied; `salesOwnerId` filter of another owner by `sales_a` → 0 rows).
2. Material service + controller; specs: demand = 3 per panel × 2 panels = 6; unlinked line excluded and reported; `purchasing` and `storekeeper` read any order; list as `sales_b` does not contain `sales_a`'s order; detail of `sales_a`'s order as `sales_b` → 404; `engineer` → 403; whitelist + `expectNoMoneyKeys` on list and detail for storekeeper, purchasing, director and sales.
3. Frontend pages + test.
4. Regenerate OpenAPI + `api.ts`.

## Acceptance
- AC-02 (material view), AC-03 (HTTP half), AC-13.

## Dependencies
- task-08-bom-item-link.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/inventory/material/services/material.service.spec.ts && test -f src/plugins/sales/_shared/ports/order-material-read.port.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/inventory/material src/plugins/sales/_shared src/plugins/sales/order src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/material/tests/order-material.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory/material src/plugins/sales/order" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts`
- Named probe: `src/plugins/inventory/material/services/material.service.spec.ts`, `src/plugins/inventory/material/material.controller.spec.ts` (scope + whitelist), `src/plugins/sales/_shared/ports/order-material-read.port.spec.ts`, frontend `src/plugins/inventory/material/tests/order-material.test.tsx`, `src/kernel/langs/tests/permission-labels.test.ts`
- Reachability: compose Postgres; permission-labels run proven in task-02.
- Oracle: demand 6; whitelist finds zero money keys; scope cases as stated; real-DB specs 0 skipped.
- Counterexample: returning the order DTO from `OrderService` must fail the whitelist; applying the scope only in the detail endpoint must fail the `sales_b` list spec.
- Artifacts: ephemeral; fixtures removed by unique prefix.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
