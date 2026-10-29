# Task 11 — Goods receipt against an approved PO by scanning

Status: done

## Outcome
A storekeeper scans the delivered items of an approved PO into a receipt; partial receipts post to stock at the PO price (weighted average), over-receipt is refused even under concurrency, a double submit posts once, and the new stock is allocated to short orders — the PO's source orders first.

## Scope
- In: feature `inventory/receipt` (permission module `stock_receipt` declared here). Header `stock_receipts` (`code` `NK_YYYY_NNNN`, `purchase_order_id`, `note`, `request_key` uuid unique NULL, `created_by`, `created_at`; code and `request_key` indexes in `DOCUMENT_NUMBER_INDEXES` when the table extends `BaseEntity`); lines (`po_line_id`, `item_id`, `quantity`, `unit_cost` = PO line `unit_price`). `POST /inventory/receipts` (`stock_receipt:create`) `{ purchaseOrderId, requestKey?, note?, lines: [{ poLineId, quantity }] }`:
  1. `createWithDocumentCode` transaction (D-07). D-18: a `requestKey` already stored → the existing receipt, 200, nothing posted.
  2. Lock the PO header `FOR UPDATE` (D-04, the first lock of this document), then **immediately** insert the receipt header with `request_key`, before any validation and before the balance locks. A concurrent twin waits on the PO lock, then fails on the `request_key` unique index → its transaction rolls back and the original is read back and returned with 200 (never a 409 from step 3). Then: PO status must be `approved|partially_received` (409).
  3. Each line: quantity > 0 (400), line belongs to the PO (400), `quantity ≤ ordered − received_qty` summed per PO line within the request, compared with `decimal.js` (D-17) (409 naming the item); update `received_qty`; PO → `received` when every line's remaining is 0, else `partially_received` (`WHERE status = :expected`).
  4. `StockPostingService.post` movement type `receipt` at `unit_cost` (D-06), then `ReservationService.allocate(itemIds, preferOrderIds = the lines' source_order_id)` (D-05).
  5. After commit: low-stock and shortage alerts for the touched items and every order whose reservation changed.
- Receipts are immutable; corrections go through supplier return (13) or count (14).
- `GET /inventory/receipts`, `GET /inventory/receipts/:id` (`stock_receipt:read`); without `purchase_price:read` no D-19 money key (AC-02).
- Frontend `/inventory/receipts` list and receive screen opened from an approved PO: PO lines (ordered, received, remaining, this receipt) with `ScanInput` (task-04): a scan resolves the item (D-12) and adds 1 to the first PO line of that item with remaining; typed quantity allowed for non-unit items; an item not on the PO or beyond remaining shows an inline error and keeps focus; "Nhập kho" posts once (button disabled in flight, one `requestKey` per screen).
- Out: receipts without a PO, QC/IQC (P4), invoices.

## Worked example (on hand X 0, Y 0; PO approved: X 10 @ 100 000 with source order O3, Y 5 @ 20 000; open orders O2 (2026-11-05) short X 4, O3 (no date) short X 4)
1. Receive X 6 → PO `partially_received`; X on hand 6, value 600 000; allocation O3 +4 first (source order), then O2 +2 → O2 short 2.
2. Receive X 5 → 409 (remaining 4), nothing written.
3. Receive X 4 and Y 5 → PO `received`; O2 +2 (short 0); Y value 100 000.
4. Receive Y 1 → 409 (PO `received`).
5. Decimal (D-17): a PO line Z 0.3 → receive 0.1 then 0.2 → both accepted, line remaining exactly 0, PO `received`.

## Coverage
- CP-11

## Ownership
- Create: `backend/src/plugins/inventory/receipt/`, `frontend/src/plugins/inventory/receipt/`, `frontend/src/app/[locale]/inventory/receipts/`
- Modify: `backend/src/plugins/inventory/purchase-order/` (status recompute helper, "Nhập kho" entry on the PO page), `inventory.features.ts`, shared registration files (incl. `soft-delete-unique-index.spec.ts`)
- Read: `backend/src/plugins/inventory/material/services/reservation.service.ts`

## Steps
1. Entities/migration; receipt service per the five sub-steps.
2. Specs: worked example (statuses, on hand, value, reservations); wrong PO status → 409; `expectNoMoneyKeys` on the storekeeper's receipt list/detail; a stored `requestKey` → same receipt id, one movement set.
3. Real-Postgres races: (a) two receipts of X 6 on remaining 10 via `Promise.all` → one 201, one 409, `received_qty` 6; (b) a receipt concurrent with a PO `close` → never a receipt on a closed PO; (c) boundary fixture — the PO line's remaining is exactly 6: `Promise.all` of two posts of X 6 with the same `requestKey` → one 201 and one 200 with the same id, exactly one set of movements, `received_qty` 6 (validating before the header insert would give the twin 409 and fail the probe).
4. Frontend receive screen + test (scan of an item not on the PO shows the error and keeps focus; over-remaining blocked).
5. Regenerate OpenAPI + `api.ts`.

## Acceptance
- AC-02 (receipts), AC-08 (receipt cost), AC-16, AC-25 (receipt half), AC-26.

## Dependencies
- task-10-reservation-allocation.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/inventory/receipt/services/receipt.service.spec.ts && test -f src/plugins/inventory/receipt/services/receipt-race.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/inventory src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/receipt/tests/receive-screen.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts`
- Named probe: `src/plugins/inventory/receipt/services/receipt.service.spec.ts` (worked example), `src/plugins/inventory/receipt/services/receipt-race.spec.ts` (races a–c), frontend `src/plugins/inventory/receipt/tests/receive-screen.test.tsx`, `src/kernel/langs/tests/permission-labels.test.ts`
- Reachability: compose Postgres; permission-labels run proven in task-02.
- Oracle: worked-example numbers exact; race (a) exactly one success; (c) one document; real-DB specs 0 skipped.
- Counterexample: checking the remaining quantity before taking the PO lock must let both race receipts through; allocating without the source-order preference must give O2 the first 4; a float comparison must refuse the 0.2 receipt in step 5; letting the `request_key` violation surface must turn race (c) into a 500.
- Artifacts: ephemeral; fixtures removed by unique prefix.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/plugins/inventory/receipt/services/receipt.service.spec.ts && test -f src/plugins/inventory/receipt/services/receipt-race.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/inventory src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/receipt/tests/receive-screen.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
Exit: 0
Base: 967069d3648131ffa65f359399e59e764ee9cde9
Head: 9d6d9e365945213367f753b8307ac0909038d6c5fb38fa2f5591b20307b00d92
```text
$ docker compose exec -T backend sh -c "test -f src/plugins/inventory/receipt/services/receipt.service.spec.ts && test -f src/plugins/inventory/receipt/services/receipt-race.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/inventory src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/receipt/tests/receive-screen.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
> panelxerp-backend@0.0.1 lint
> panelxerp-backend@0.0.1 typecheck
> panelxerp-backend@0.0.1 migration:run
> panelxerp-backend@0.0.1 typeorm
No migrations are pending
> panelxerp-backend@0.0.1 seed
PASS src/kernel/core/database/seeds/seed-roles.inventory.spec.ts (15.392 s)
PASS src/kernel/core/database/seeds/seed-roles.panel.spec.ts (15.467 s)
PASS src/plugins/inventory/stock/services/stock-availability.service.spec.ts (17.314 s)
PASS src/plugins/inventory/receipt/services/receipt-race.spec.ts (18.31 s)
PASS src/plugins/inventory/material/material.controller.spec.ts (5.925 s)
PASS src/plugins/inventory/supplier/supplier.controller.spec.ts (5.483 s)
PASS src/plugins/inventory/purchase-order/services/purchase-order-approval.service.spec.ts (8.734 s)
PASS src/plugins/inventory/stock/services/stock-posting-race.spec.ts
PASS src/kernel/core/database/seeds/seed-users.spec.ts
PASS src/kernel/core/database/soft-delete-unique-index.spec.ts (14.758 s)
PASS src/plugins/inventory/material/services/reservation-race.spec.ts (6.388 s)
PASS src/kernel/core/database/seeds/permission-scope-conversion.spec.ts
PASS src/kernel/core/database/seeds/helpers/seed-scope.spec.ts
PASS src/plugins/inventory/material/services/reservation.service.spec.ts
PASS src/plugins/inventory/receipt/services/receipt.service.spec.ts (31.69 s)
PASS src/plugins/inventory/material/services/material.service.spec.ts
PASS src/plugins/inventory/material/services/shortage-alert.service.spec.ts
PASS src/plugins/inventory/_shared/gateways/supplier-reference-check-registry.spec.ts
PASS src/plugins/inventory/purchase-order/utils/purchase-order-pricing.spec.ts
PASS src/plugins/inventory/stock/utils/stock-cost.util.spec.ts
PASS src/plugins/inventory/supplier/services/supplier.service.spec.ts
PASS src/plugins/inventory/stock/stock.controller.spec.ts (9.507 s)
PASS src/plugins/inventory/stock/services/stock-alert.service.spec.ts
PASS src/plugins/inventory/stock/services/stock-posting.service.spec.ts
Test Suites: 24 passed, 24 total
Tests:       212 passed, 212 total
> panelxerp-backend@0.0.1 validate:migrations
Migration filename check passed (34 files).
> panelxerp-frontend@0.1.0 lint
> panelxerp-frontend@0.1.0 lint:i18n
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests) 4553ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
 ✓ src/plugins/inventory/stock/tests/stock-list.test.tsx (6 tests) 376ms
 ✓ src/plugins/inventory/receipt/tests/receive-screen.test.tsx (5 tests) 1903ms
 ✓ src/plugins/inventory/material/tests/shortage-notification.test.ts (4 tests) 338ms
 ✓ src/plugins/inventory/material/tests/order-material.test.tsx (4 tests) 1465ms
 ✓ src/plugins/inventory/supplier/tests/supplier-list.test.tsx (4 tests) 1751ms
 ✓ src/plugins/inventory/stock/tests/stock-notification.test.ts (4 tests) 75ms
 ✓ src/plugins/inventory/purchase-order/tests/purchase-order-detail.test.tsx (12 tests) 596ms
 Test Files  7 passed (7)
      Tests  39 passed (39)
 ✓ src/kernel/langs/tests/permission-labels.test.ts (6 tests) 7202ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
EXIT=0
```

Negative proof (each counterexample applied alone, receipt specs rerun, file restored byte-for-byte):
- remaining checked before the order lock → race (a) fails (both receipts pass).
- allocation without the source-order preference → worked example fails (O2 takes the first 4).
- float comparison of the remaining → the 0.1 then 0.2 on 0.3 spec fails (0.2 refused).
- request key violation left to surface → race (c) fails (500 instead of 200).

Reachability: backend restarted; `StockReceiptModule dependencies initialized`, `Mapped {/api/v1/inventory/receipts, GET}`, `{/api/v1/inventory/receipts/:id, GET}`, `{/api/v1/inventory/receipts, POST}`, `Nest application successfully started`. Frontend routes `/inventory/receipts` and `/inventory/receipts/new`, sidebar item `receipts`, and the "Nhập kho" action on approved / partly received purchase orders.

Review: code-auditor PASS (0 Critical / 0 High / 0 Medium); Lows recorded for GATE-DONE.
