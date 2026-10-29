# Task 15 — Purchase requests (manual and from an order's shortage) converted into POs

Status: done

## Outcome
Staff raise purchase requests by hand or from an order's shortage; purchasing turns open request lines into a draft PO for a supplier, PO lines remember the source order so its receipt goes to that order first, and request quantities stay right when POs are cancelled, closed or returned against — also under concurrent calls.

## Scope
- In: feature `inventory/purchase-request` (permission module `purchase_request` declared here), code `PR_YYYY_NNNN`, no approval (user). Header: `note`, `cancelled` flag + `cancel_reason`, `created_by`; lines: `item_id` (active), `quantity` > 0, `needed_by` date NULL, `note`, `source_order_id` NULL (no FK, D-04). Derived per D-11 (with `decimal.js`, D-17): per PO line `committed` (quantity; `received_qty` when the PO is `closed`; 0 when `cancelled`) and `incoming = committed − received_qty` (0 when closed); PR line `ordered = Σ committed` of linked PO lines, `remaining = max(0, quantity − ordered)`; PR status `cancelled` | `ordered` | `open`.
- Endpoints: create (`purchase_request:create` — (user, Q5) purchasing, storekeeper, engineeringLead, engineer); edit (`purchase_request:update`, only lines with `ordered = 0`, not cancelled); `cancel` with reason (`purchase_request:cancel`, 409 when any line has `ordered > 0`). Cancel, edit and convert lock the PR header(s) `FOR UPDATE` in ascending id before their lines (D-04).
- From shortage: `POST /inventory/purchase-requests/from-order/:orderId` (`purchase_request:create` and material visibility, D-09 → 404 otherwise): takes `pg_advisory_xact_lock` for the order (D-04 order position) so two concurrent calls serialize; one line per item with prefill = shortage − Σ remaining of open PR lines with that source order − Σ incoming of PO lines with that source order; items with prefill ≤ 0 omitted; nothing to request → 409.
- PR → PO: `POST /inventory/purchase-orders/from-requests` (`purchase_order:create`) `{ supplierId, lines: [{ prLineId, quantity }] }` → a `draft` PO (task-07 rules) whose lines carry `pr_line_id`, `source_order_id`, item, quantity ≤ the PR line's remaining (409), `unit_price` defaulting to the item's `reference_price` (else 0); a cancelled PR → 409.
- Item delete veto (R-14): `registerItemCheck('inventory-purchase-request', …)` → an item on a line of a non-cancelled PR → 409.
- Frontend `/inventory/purchase-requests`: list with remaining, form, "Tạo đề nghị mua" on the order material page, multi-select open lines → "Tạo PO" with a supplier picker.
- Out: PR approval, supplier quote comparison, automatic PR creation.

## Worked example (O3 short X 10)
1. From O3 → PR1 line X 10 (source O3).
2. From O3 again → 409 (prefill 10 − 10 = 0).
3. Convert PR1 X 6 → PO_A draft line X 6 (source O3); PR1 remaining 4, status `open`.
4. Cancel PO_A → PR1 remaining back to 10.
5. Convert PR1 X 6 → PO_B; approve; receive X 2 (allocated to O3, short 8); close PO_B → committed 2, incoming 0; PR1 ordered 2, remaining 8; from O3 → 409 (8 − 8 − 0).
6. Supplier return X 1 on the closed PO_B → received 1; PR1 ordered 1, remaining 9; O3 short 9; from O3 → 409 (9 − 9 − 0): no phantom incoming from the closed PO.

## Coverage
- CP-15

## Ownership
- Create: `backend/src/plugins/inventory/purchase-request/`, `frontend/src/plugins/inventory/purchase-request/`, `frontend/src/app/[locale]/inventory/purchase-requests/`
- Modify: `backend/src/plugins/inventory/purchase-order/` (from-requests endpoint, `committed`/`incoming` helpers), `backend/src/plugins/inventory/material/` (request button data), `frontend/src/plugins/inventory/material/` (request button), `inventory.features.ts`, shared registration files (incl. `soft-delete-unique-index.spec.ts`)
- Read: `backend/src/plugins/inventory/material/services/material.service.ts`

## Steps
1. Entities/migration; PR service with derived quantities.
2. From-shortage and PR→PO services with the locks above; item reference check.
3. Specs: worked example; `sales` → 403; storekeeper and engineer create a manual PR, cannot convert (403); director cannot create (403); engineer from-order → 404; `sales_b` from-order on `sales_a`'s order → 404; item delete with a live PR line → 409.
4. Real-Postgres races: (a) two from-order calls for O3 via `Promise.all` → one PR, the other 409; (b) cancel PR1 ∥ convert PR1 → never a cancelled PR with PO lines; (c) two conversions of PR1 X 6 with remaining 10 → one 201, one 409.
5. Frontend + test.
6. Regenerate OpenAPI + `api.ts`.

## Acceptance
- AC-03 (from-order scope), AC-04 (item veto), AC-21.

## Dependencies
- task-14-stocktake-approval.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/inventory/purchase-request/services/purchase-request.service.spec.ts && test -f src/plugins/inventory/purchase-request/services/purchase-request-race.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/inventory src/plugins/catalog/item src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/purchase-request/tests/purchase-request-list.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts`
- Named probe: `src/plugins/inventory/purchase-request/services/purchase-request.service.spec.ts` (worked example), `src/plugins/inventory/purchase-request/services/purchase-request-race.spec.ts` (races a–c), frontend `src/plugins/inventory/purchase-request/tests/purchase-request-list.test.tsx`, `src/kernel/langs/tests/permission-labels.test.ts`
- Reachability: compose Postgres; permission-labels run proven in task-02.
- Oracle: worked-example quantities exact; races as stated; real-DB specs 0 skipped.
- Counterexample: counting a closed PO line's full quantity as committed must give remaining 4 in step 5; dropping the advisory lock must let race (a) create two PRs.
- Artifacts: ephemeral; fixtures removed by unique prefix.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/plugins/inventory/purchase-request/services/purchase-request.service.spec.ts && test -f src/plugins/inventory/purchase-request/services/purchase-request-race.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/inventory src/plugins/catalog/item src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/purchase-request/tests/purchase-request-list.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
Exit: 0
Base: 69e05598e97abae4f473b478a3b1b37789f0d77a
Head: 56932855ef5f565e2a8e49145f7ad9eca764919bd2bb6dc04d254e724a9e365a
```text
$ docker compose exec -T backend sh -c "test -f src/plugins/inventory/purchase-request/services/purchase-request.service.spec.ts && test -f src/plugins/inventory/purchase-request/services/purchase-request-race.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/inventory src/plugins/catalog/item src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/purchase-request/tests/purchase-request-list.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
> panelxerp-backend@0.0.1 lint
> panelxerp-backend@0.0.1 typecheck
> panelxerp-backend@0.0.1 migration:run
> panelxerp-backend@0.0.1 typeorm
No migrations are pending
> panelxerp-backend@0.0.1 seed
PASS src/plugins/inventory/purchase-request/services/purchase-request-race.spec.ts (14.157 s)
PASS src/plugins/inventory/purchase-request/services/purchase-request.service.spec.ts (14.509 s)
PASS src/plugins/inventory/stocktake/services/stocktake-approval.service.spec.ts (14.823 s)
PASS src/plugins/inventory/stocktake/services/stocktake-race.spec.ts (15.125 s)
PASS src/plugins/inventory/issue/services/issue-race.spec.ts (8.237 s)
PASS src/plugins/catalog/item/item.controller.spec.ts (8.151 s)
PASS src/plugins/inventory/purchase-order/services/purchase-order-approval.service.spec.ts (9.267 s)
PASS src/kernel/core/database/soft-delete-unique-index.spec.ts (13.881 s)
PASS src/plugins/inventory/supplier-return/services/supplier-return.service.spec.ts (28.385 s)
PASS src/plugins/inventory/receipt/services/receipt.service.spec.ts (5.46 s)
PASS src/plugins/inventory/receipt/services/receipt-race.spec.ts (5.346 s)
PASS src/plugins/inventory/material/material.controller.spec.ts (5.864 s)
PASS src/kernel/core/database/seeds/seed-roles.panel.spec.ts
PASS src/plugins/inventory/stock/services/stock-availability.service.spec.ts (5.022 s)
PASS src/plugins/inventory/issue/services/issue.service.spec.ts (6.028 s)
PASS src/plugins/inventory/issue/services/workshop-return.service.spec.ts (6.228 s)
PASS src/plugins/inventory/supplier/supplier.controller.spec.ts (5.755 s)
PASS src/plugins/inventory/material/services/reservation-race.spec.ts
PASS src/plugins/inventory/stock/services/stock-posting-race.spec.ts
PASS src/plugins/catalog/item/services/item-import.service.spec.ts
PASS src/plugins/catalog/item/services/item-label.service.spec.ts
PASS src/plugins/inventory/material/services/reservation.service.spec.ts
PASS src/plugins/inventory/stock/stock.controller.spec.ts
PASS src/plugins/inventory/material/services/shortage-alert.service.spec.ts
PASS src/kernel/core/database/seeds/seed-roles.inventory.spec.ts
PASS src/plugins/inventory/material/services/material.service.spec.ts
PASS src/plugins/inventory/supplier/services/supplier.service.spec.ts
PASS src/plugins/inventory/stock/services/stock-posting.service.spec.ts
PASS src/plugins/catalog/item/services/item.service.spec.ts
PASS src/plugins/catalog/item/services/item-stock-settings.service.spec.ts
PASS src/plugins/inventory/stock/services/stock-alert.service.spec.ts
PASS src/plugins/catalog/item/utils/code128.util.spec.ts
PASS src/plugins/catalog/item/utils/item-identifier-lock.spec.ts
PASS src/plugins/inventory/_shared/gateways/supplier-reference-check-registry.spec.ts
PASS src/kernel/core/database/seeds/seed-users.spec.ts
PASS src/plugins/inventory/stock/utils/stock-cost.util.spec.ts
PASS src/plugins/inventory/purchase-order/utils/purchase-order-pricing.spec.ts
PASS src/kernel/core/database/seeds/helpers/seed-scope.spec.ts
PASS src/kernel/core/database/seeds/permission-scope-conversion.spec.ts
Test Suites: 39 passed, 39 total
Tests:       383 passed, 383 total
> panelxerp-backend@0.0.1 validate:migrations
Migration filename check passed (38 files).
> panelxerp-frontend@0.1.0 lint
> panelxerp-frontend@0.1.0 lint:i18n
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests) 5343ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
 ✓ src/plugins/inventory/stock/tests/stock-list.test.tsx (6 tests) 829ms
 ✓ src/plugins/inventory/supplier-return/tests/supplier-return-form.test.tsx (3 tests) 1614ms
 ✓ src/plugins/inventory/stocktake/tests/stocktake-counting.test.tsx (7 tests) 2040ms
 ✓ src/plugins/inventory/receipt/tests/receive-screen.test.tsx (5 tests) 2263ms
 ✓ src/plugins/inventory/issue/tests/issue-screen.test.tsx (6 tests) 2956ms
 ✓ src/plugins/inventory/material/tests/shortage-notification.test.ts (4 tests) 83ms
 ✓ src/plugins/inventory/purchase-request/tests/purchase-request-list.test.tsx (3 tests) 1645ms
 ✓ src/plugins/inventory/stock/tests/stock-notification.test.ts (4 tests) 97ms
 ✓ src/plugins/inventory/material/tests/order-material.test.tsx (4 tests) 860ms
 ✓ src/plugins/inventory/supplier/tests/supplier-list.test.tsx (4 tests) 845ms
 ✓ src/plugins/inventory/purchase-order/tests/purchase-order-detail.test.tsx (12 tests) 1047ms
 Test Files  11 passed (11)
      Tests  58 passed (58)
 ✓ src/kernel/langs/tests/permission-labels.test.ts (6 tests) 8474ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
EXIT=0
```

Negative proof (each counterexample applied alone, the named spec rerun, file restored byte-for-byte):
- a closed purchase order line counted in full as committed → step 5 fails (remaining 4 instead of 8).
- the per-order advisory lock removed → race (a) fails (the two calls no longer queue on the order's lock).

Reachability: backend restarted; `PurchaseRequestModule dependencies initialized`, `Mapped {/api/v1/inventory/purchase-requests, GET}`, `{…, POST}`, `{/:id, GET}`, `{/:id, PATCH}`, `{/:id/cancel, POST}`, `{/from-order/:orderId, POST}`, `{/api/v1/inventory/purchase-orders/from-requests, POST}`, `Nest application successfully started`; item veto registered as `inventory-purchase-request`. Frontend route `/inventory/purchase-requests`, sidebar item `purchaseRequests`, the "Tạo đề nghị mua" action on the order material page.

Review: code-auditor FAIL (1 High: editing a draft made from requests dropped its request and source-order links; 2 Medium: source orders shown outside the material scope, the request edit untested) → fixed → re-review PASS (0 Critical / 0 High / 0 Medium); Lows recorded for GATE-DONE. The i18n static scan's timeout was raised to 20 s with the user's consent (it passed at 4.2–5.3 s; no assertion changed).
